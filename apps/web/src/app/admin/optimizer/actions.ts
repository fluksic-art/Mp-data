"use server";

import { getDb } from "@/lib/db";
import { properties, optimizerCampaigns } from "@mpgenesis/database";
import { eq, ne, and, sql, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  getFixForRule,
  type FixActionKind,
  enqueueParaphraseJob,
  enqueueTranslateJob,
  enqueueSupervisorRecheck,
} from "@mpgenesis/shared";

export async function createCampaign(
  rule: string,
  severity: string,
  category: string,
): Promise<{ id: string; error?: string }> {
  const fix = getFixForRule(rule);
  if (!fix) return { id: "", error: `No fix mapping for rule "${rule}"` };

  const db = getDb();

  const [countRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(properties)
    .where(
      and(
        ne(properties.status, "possible_duplicate"),
        sql`exists (select 1 from jsonb_array_elements(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) as i where i->>'rule' = ${rule})`,
      ),
    );
  const totalAffected = countRow?.value ?? 0;

  const testRows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        ne(properties.status, "possible_duplicate"),
        sql`exists (select 1 from jsonb_array_elements(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) as i where i->>'rule' = ${rule})`,
      ),
    )
    .orderBy(sql`random()`)
    .limit(5);

  const testIds = testRows.map((r) => r.id);

  const [campaign] = await db
    .insert(optimizerCampaigns)
    .values({
      rule,
      severity,
      category,
      fixAction: fix.kind,
      totalAffected,
      testIds,
      status: "draft",
    })
    .returning({ id: optimizerCampaigns.id });

  revalidatePath("/admin/optimizer");
  return { id: campaign!.id };
}

export async function runTestBatch(
  campaignId: string,
): Promise<{ error?: string }> {
  const db = getDb();

  const [campaign] = await db
    .select()
    .from(optimizerCampaigns)
    .where(eq(optimizerCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) return { error: "Campaign not found" };
  if (campaign.status !== "draft") return { error: `Cannot test in status "${campaign.status}"` };

  const testIds = campaign.testIds as string[];
  if (testIds.length === 0) return { error: "No test IDs" };

  const testProps = await db
    .select({
      id: properties.id,
      supervisorScore: properties.supervisorScore,
      supervisorIssues: properties.supervisorIssues,
    })
    .from(properties)
    .where(sql`${properties.id} = ANY(${testIds})`);

  const testBefore = testProps.map((p) => ({
    propertyId: p.id,
    score: p.supervisorScore,
    issues: filterIssuesByRule(p.supervisorIssues, campaign.rule),
  }));

  await db
    .update(optimizerCampaigns)
    .set({
      status: "testing",
      testStartedAt: new Date(),
      testBefore,
    })
    .where(eq(optimizerCampaigns.id, campaignId));

  for (const propId of testIds) {
    await executeFixAction(db, campaign.fixAction as FixActionKind, propId, campaign.fixParams);
  }

  await enqueueSupervisorForIds(db, testIds);

  revalidatePath("/admin/optimizer");
  return {};
}

export async function completeTest(
  campaignId: string,
): Promise<{ error?: string }> {
  const db = getDb();

  const [campaign] = await db
    .select()
    .from(optimizerCampaigns)
    .where(eq(optimizerCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) return { error: "Campaign not found" };
  if (campaign.status !== "testing") return { error: `Not in testing status` };

  const testIds = campaign.testIds as string[];
  const testProps = await db
    .select({
      id: properties.id,
      supervisorScore: properties.supervisorScore,
      supervisorIssues: properties.supervisorIssues,
    })
    .from(properties)
    .where(sql`${properties.id} = ANY(${testIds})`);

  const testAfter = testProps.map((p) => ({
    propertyId: p.id,
    score: p.supervisorScore,
    issues: filterIssuesByRule(p.supervisorIssues, campaign.rule),
  }));

  await db
    .update(optimizerCampaigns)
    .set({
      status: "review",
      testDoneAt: new Date(),
      testAfter,
    })
    .where(eq(optimizerCampaigns.id, campaignId));

  revalidatePath("/admin/optimizer");
  return {};
}

export async function approveAndRollout(
  campaignId: string,
): Promise<{ error?: string }> {
  const db = getDb();

  const [campaign] = await db
    .select()
    .from(optimizerCampaigns)
    .where(eq(optimizerCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) return { error: "Campaign not found" };
  if (campaign.status !== "review") return { error: `Not in review status` };

  const testIds = new Set(campaign.testIds as string[]);

  const allAffected = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        ne(properties.status, "possible_duplicate"),
        sql`exists (select 1 from jsonb_array_elements(coalesce(${properties.supervisorIssues}, '[]'::jsonb)) as i where i->>'rule' = ${campaign.rule})`,
      ),
    );

  const remaining = allAffected.filter((r) => !testIds.has(r.id));

  await db
    .update(optimizerCampaigns)
    .set({
      status: "running",
      approvedAt: new Date(),
      rolloutStartedAt: new Date(),
    })
    .where(eq(optimizerCampaigns.id, campaignId));

  let fixed = 0;
  let failed = 0;

  for (let i = 0; i < remaining.length; i += 50) {
    const batch = remaining.slice(i, i + 50);
    for (const row of batch) {
      try {
        await executeFixAction(db, campaign.fixAction as FixActionKind, row.id, campaign.fixParams);
        fixed++;
      } catch {
        failed++;
      }
    }

    await db
      .update(optimizerCampaigns)
      .set({ rolloutFixed: fixed, rolloutFailed: failed })
      .where(eq(optimizerCampaigns.id, campaignId));
  }

  await db
    .update(optimizerCampaigns)
    .set({
      status: "done",
      rolloutDoneAt: new Date(),
      rolloutFixed: fixed,
      rolloutFailed: failed,
    })
    .where(eq(optimizerCampaigns.id, campaignId));

  revalidatePath("/admin/optimizer");
  return {};
}

export async function cancelCampaign(
  campaignId: string,
): Promise<{ error?: string }> {
  const db = getDb();
  await db
    .update(optimizerCampaigns)
    .set({ status: "failed" })
    .where(eq(optimizerCampaigns.id, campaignId));
  revalidatePath("/admin/optimizer");
  return {};
}

// --- Executor logic (inline to avoid drizzle-orm dep in shared) ---

async function executeFixAction(
  db: ReturnType<typeof getDb>,
  action: FixActionKind,
  propertyId: string,
  params: unknown,
): Promise<void> {
  switch (action) {
    case "reprocess_paraphrase":
      await execReprocessParaphrase(db, propertyId);
      break;
    case "retranslate":
      await execRetranslate(db, propertyId);
      break;
    case "re_enrich":
      await execReEnrich(db, propertyId);
      break;
    case "bulk_status": {
      const p = params as { status?: string } | null;
      if (p?.status) {
        await db
          .update(properties)
          .set({ status: p.status })
          .where(eq(properties.id, propertyId));
      }
      break;
    }
    case "data_patch": {
      const p = params as { field?: string; value?: unknown } | null;
      if (p?.field) {
        await db
          .update(properties)
          .set({ [p.field]: p.value ?? null })
          .where(eq(properties.id, propertyId));
      }
      break;
    }
  }
}

async function execReprocessParaphrase(
  db: ReturnType<typeof getDb>,
  propertyId: string,
): Promise<void> {
  const [prop] = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
      rawData: properties.rawData,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!prop) return;

  const rawData = (prop.rawData ?? {}) as Record<string, unknown>;
  const description = (rawData["description"] as string) ?? "";
  if (description.length < 20) return;

  await db
    .update(properties)
    .set({ contentEs: null, contentEn: null, contentFr: null, status: "draft" })
    .where(eq(properties.id, propertyId));

  await enqueueParaphraseJob({
    sourceId: prop.sourceId,
    crawlRunId: prop.lastCrawlRunId ?? "",
    propertyId: prop.id,
    description,
  });
}

async function execRetranslate(
  db: ReturnType<typeof getDb>,
  propertyId: string,
): Promise<void> {
  const [prop] = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
      contentEs: properties.contentEs,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!prop || !prop.contentEs) return;

  await db
    .update(properties)
    .set({ contentEn: null, contentFr: null })
    .where(eq(properties.id, propertyId));

  const content = prop.contentEs as { description?: string };
  const textEs = content.description ?? "";
  if (!textEs) return;

  for (const locale of ["en", "fr"] as const) {
    await enqueueTranslateJob({
      sourceId: prop.sourceId,
      crawlRunId: prop.lastCrawlRunId ?? "",
      propertyId: prop.id,
      textEs,
      targetLocale: locale,
    });
  }
}

async function execReEnrich(
  db: ReturnType<typeof getDb>,
  propertyId: string,
): Promise<void> {
  const [prop] = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
      sourceUrl: properties.sourceUrl,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!prop?.sourceUrl) return;

  // Re-enrich is source-specific; for now we just log intent.
  // Phase 2 will add per-source extract re-enqueue.
}

async function enqueueSupervisorForIds(
  db: ReturnType<typeof getDb>,
  ids: string[],
): Promise<void> {
  const props = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
    })
    .from(properties)
    .where(sql`${properties.id} = ANY(${ids})`);

  for (const p of props) {
    await enqueueSupervisorRecheck({
      sourceId: p.sourceId,
      crawlRunId: p.lastCrawlRunId ?? "",
      propertyId: p.id,
    });
  }
}

function filterIssuesByRule(issues: unknown, rule: string): unknown[] {
  if (!Array.isArray(issues)) return [];
  return issues.filter(
    (i: { rule?: string }) => i?.rule === rule,
  );
}
