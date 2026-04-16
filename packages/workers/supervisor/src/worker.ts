import { Job } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  SUPERVISOR_CHECK_VERSION,
  createLogger,
  type SupervisorJobData,
  type PropertyForSupervisor,
} from "@mpgenesis/shared";
import { createDb, properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { superviseProperty } from "./supervise.js";

const logger = createLogger("supervisor-worker");

export class SupervisorWorker extends BaseWorker<"supervisor"> {
  constructor() {
    super(QUEUE_NAMES.SUPERVISOR);
  }

  protected async process(job: Job<SupervisorJobData>): Promise<void> {
    const { sourceId, crawlRunId, propertyId, force, reason, skipJudge } =
      job.data;
    const db = createDb();

    const [row] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (!row) {
      logger.warn({ propertyId }, "Property not found, skipping");
      return;
    }

    // Idempotency: skip if already checked with the current version and no force.
    if (
      !force &&
      row.supervisorCheckVersion === SUPERVISOR_CHECK_VERSION &&
      row.supervisorCheckedAt
    ) {
      logger.info(
        { propertyId, version: SUPERVISOR_CHECK_VERSION },
        "Already supervised with current version, skipping",
      );
      return;
    }

    const input: PropertyForSupervisor = {
      id: row.id,
      title: row.title,
      propertyType: row.propertyType,
      listingType: row.listingType,
      priceCents: row.priceCents,
      currency: row.currency,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      constructionM2: row.constructionM2,
      landM2: row.landM2,
      parkingSpaces: row.parkingSpaces,
      country: row.country,
      state: row.state,
      city: row.city,
      neighborhood: row.neighborhood,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      contentEs: row.contentEs as PropertyForSupervisor["contentEs"],
      contentEn: row.contentEn as PropertyForSupervisor["contentEn"],
      contentFr: row.contentFr as PropertyForSupervisor["contentFr"],
      rawData: (row.rawData as Record<string, unknown>) ?? {},
    };

    const result = await superviseProperty({
      property: input,
      force: force ?? false,
      skipJudge: skipJudge ?? false,
      status: row.status,
    });

    const { report, ranJudge, judgeCostUsd } = result;

    const updates: Record<string, unknown> = {
      supervisorScore: report.supervisorScore,
      supervisorFactualScore: report.factualScore,
      supervisorContentScore: report.contentScore,
      supervisorIssues: report.issues,
      supervisorSummary: report.summary ?? null,
      supervisorCheckedAt: new Date(),
      supervisorCheckVersion: report.version,
      qaStatus: report.qaStatus,
    };

    // Never promote a published listing back to review silently unless
    // qa flagged real issues. If qaStatus is "ok" don't touch status;
    // if "needs_review" and current status is "published", move to review.
    if (
      (report.qaStatus === "needs_review" || report.qaStatus === "blocked") &&
      row.status === "published"
    ) {
      updates["status"] = "review";
    }

    await db
      .update(properties)
      .set(updates)
      .where(eq(properties.id, propertyId));

    logger.info(
      {
        sourceId,
        crawlRunId,
        propertyId,
        reason: reason ?? "unknown",
        supervisorScore: report.supervisorScore,
        factualScore: report.factualScore,
        contentScore: report.contentScore,
        qaStatus: report.qaStatus,
        issuesCount: report.issues.length,
        errorsCount: report.issues.filter((i) => i.severity === "error").length,
        ranJudge,
        judgeCostUsd: judgeCostUsd.toFixed(5),
      },
      "Supervisor complete",
    );
  }
}
