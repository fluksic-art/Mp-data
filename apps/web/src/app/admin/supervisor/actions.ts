"use server";

import { getDb } from "@/lib/db";
import { properties } from "@mpgenesis/database";
import {
  enqueueSupervisorJob,
  enqueueSupervisorJobs,
  SUPERVISOR_CHECK_VERSION,
  type SupervisorIssue,
  type SupervisorJobData,
} from "@mpgenesis/shared";
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function triggerSupervisorSingle(
  propertyId: string,
  options: { force?: boolean; skipJudge?: boolean } = {},
): Promise<{ queued: boolean }> {
  const db = getDb();
  const [row] = await db
    .select({
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!row) return { queued: false };

  const data: SupervisorJobData = {
    sourceId: row.sourceId,
    crawlRunId: row.lastCrawlRunId ?? "",
    propertyId,
    force: options.force ?? false,
    skipJudge: options.skipJudge ?? false,
    reason: "manual-single",
  };
  await enqueueSupervisorJob(data);
  revalidatePath("/admin/supervisor");
  revalidatePath(`/admin/listings/${propertyId}`);
  return { queued: true };
}

export interface SupervisorBatchFilter {
  status?: string[];
  propertyType?: string;
  sourceId?: string;
  stale?: boolean;
  olderThanDays?: number;
  force?: boolean;
  skipJudge?: boolean;
}

export async function triggerSupervisorBatch(
  filter: SupervisorBatchFilter,
): Promise<{ queued: number }> {
  const db = getDb();
  const conditions: SQL[] = [
    ne(properties.status, "possible_duplicate"),
    isNotNull(properties.contentEs),
  ];
  if (filter.status && filter.status.length > 0) {
    conditions.push(inArray(properties.status, filter.status));
  }
  if (filter.propertyType) {
    conditions.push(eq(properties.propertyType, filter.propertyType));
  }
  if (filter.sourceId) {
    conditions.push(eq(properties.sourceId, filter.sourceId));
  }
  if (filter.stale) {
    const staleCondition = or(
      isNull(properties.supervisorCheckVersion),
      ne(properties.supervisorCheckVersion, SUPERVISOR_CHECK_VERSION),
    );
    if (staleCondition) conditions.push(staleCondition);
  }
  if (filter.olderThanDays && filter.olderThanDays > 0) {
    const cutoff = new Date(
      Date.now() - filter.olderThanDays * 24 * 60 * 60 * 1000,
    );
    const cutoffCondition = or(
      isNull(properties.supervisorCheckedAt),
      lt(properties.supervisorCheckedAt, cutoff),
    );
    if (cutoffCondition) conditions.push(cutoffCondition);
  }

  const matches = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
    })
    .from(properties)
    .where(and(...conditions));

  if (matches.length === 0) {
    revalidatePath("/admin/supervisor");
    return { queued: 0 };
  }

  const jobs: SupervisorJobData[] = matches.map((r) => ({
    sourceId: r.sourceId,
    crawlRunId: r.lastCrawlRunId ?? "",
    propertyId: r.id,
    force: filter.force ?? false,
    skipJudge: filter.skipJudge ?? false,
    reason: "manual-batch",
  }));

  await enqueueSupervisorJobs(jobs);
  revalidatePath("/admin/supervisor");
  revalidatePath("/admin/listings");
  return { queued: jobs.length };
}

/** Marks a specific issue as "accepted by human" — removes it from the
 * issues array. If no issues remain, sets qa_status to "ok". */
export async function resolveSupervisorIssue(
  propertyId: string,
  rule: string,
): Promise<{ remaining: number }> {
  const db = getDb();
  const [row] = await db
    .select({ supervisorIssues: properties.supervisorIssues })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  const current = (row?.supervisorIssues ?? []) as SupervisorIssue[];
  const next = current.filter((i) => i.rule !== rule);
  const remaining = next.length;

  const updates: Record<string, unknown> = { supervisorIssues: next };
  if (remaining === 0) updates["qaStatus"] = "ok";
  else {
    const hasError = next.some((i) => i.severity === "error");
    updates["qaStatus"] = hasError ? "needs_review" : "ok";
  }

  await db.update(properties).set(updates).where(eq(properties.id, propertyId));
  revalidatePath("/admin/supervisor");
  revalidatePath(`/admin/listings/${propertyId}`);
  return { remaining };
}
