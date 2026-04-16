import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  getRedisConnection,
  createLogger,
  SUPERVISOR_CHECK_VERSION,
  type SupervisorJobData,
} from "@mpgenesis/shared";
import { createDb, properties } from "@mpgenesis/database";
import { and, eq, inArray, isNotNull, isNull, lt, ne, or, sql, SQL } from "drizzle-orm";

const logger = createLogger("supervisor-enqueue");

export interface SupervisorEnqueueFilter {
  propertyId?: string;
  propertyIds?: string[];
  status?: string[];
  sourceId?: string;
  propertyType?: string;
  /** Only re-check listings whose check version differs from current. */
  stale?: boolean;
  /** Re-check listings older than this many days. */
  olderThanDays?: number;
  /** Re-check regardless of prior run. */
  force?: boolean;
  /** Skip LLM judge. */
  skipJudge?: boolean;
  /** Label the batch reason for logging. */
  reason?: string;
}

/** Enqueue a supervisor job for a single property. */
export async function enqueueSupervisor(
  input: SupervisorJobData,
): Promise<void> {
  const queue = new Queue<SupervisorJobData>(QUEUE_NAMES.SUPERVISOR, {
    connection: getRedisConnection(),
  });
  const jobId = input.force
    ? `supervisor-${input.propertyId}-force-${Date.now()}`
    : `supervisor-${input.propertyId}-${SUPERVISOR_CHECK_VERSION}`;
  await queue.add(QUEUE_NAMES.SUPERVISOR, input, { jobId });
  await queue.close();
}

/** Enqueue a batch of supervisor jobs based on a filter. Returns count. */
export async function enqueueSupervisorBatch(
  filter: SupervisorEnqueueFilter,
): Promise<number> {
  const db = createDb();

  const conditions: SQL[] = [ne(properties.status, "possible_duplicate")];
  if (filter.propertyId) conditions.push(eq(properties.id, filter.propertyId));
  if (filter.propertyIds && filter.propertyIds.length > 0) {
    conditions.push(inArray(properties.id, filter.propertyIds));
  }
  if (filter.status && filter.status.length > 0) {
    conditions.push(inArray(properties.status, filter.status));
  }
  if (filter.sourceId) conditions.push(eq(properties.sourceId, filter.sourceId));
  if (filter.propertyType) {
    conditions.push(eq(properties.propertyType, filter.propertyType));
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
  // Only target listings that have at least a paraphrased ES content.
  conditions.push(isNotNull(properties.contentEs));

  const matches = await db
    .select({
      id: properties.id,
      sourceId: properties.sourceId,
      lastCrawlRunId: properties.lastCrawlRunId,
    })
    .from(properties)
    .where(and(...conditions));

  if (matches.length === 0) {
    logger.info({ filter }, "No properties match supervisor batch filter");
    return 0;
  }

  const queue = new Queue<SupervisorJobData>(QUEUE_NAMES.SUPERVISOR, {
    connection: getRedisConnection(),
  });

  let queued = 0;
  for (const row of matches) {
    const jobId = filter.force
      ? `supervisor-${row.id}-force-${Date.now()}`
      : `supervisor-${row.id}-${SUPERVISOR_CHECK_VERSION}`;
    await queue.add(
      QUEUE_NAMES.SUPERVISOR,
      {
        sourceId: row.sourceId,
        crawlRunId: row.lastCrawlRunId ?? "",
        propertyId: row.id,
        force: filter.force ?? false,
        reason: filter.reason ?? "batch",
        skipJudge: filter.skipJudge ?? false,
      },
      { jobId },
    );
    queued += 1;
  }

  await queue.close();
  logger.info({ queued, reason: filter.reason ?? "batch" }, "Supervisor jobs enqueued");
  return queued;
}

/** CLI entry: `pnpm --filter @mpgenesis/supervisor-worker enqueue [--stale|--force|--status=review,published]` */
async function main() {
  const args = process.argv.slice(2);
  const filter: SupervisorEnqueueFilter = { reason: "cli" };
  for (const a of args) {
    if (a === "--stale") filter.stale = true;
    else if (a === "--force") filter.force = true;
    else if (a === "--skip-judge") filter.skipJudge = true;
    else if (a.startsWith("--status=")) {
      const val = a.slice("--status=".length);
      filter.status = val.split(",").filter(Boolean);
    } else if (a.startsWith("--source=")) {
      filter.sourceId = a.slice("--source=".length);
    } else if (a.startsWith("--type=")) {
      filter.propertyType = a.slice("--type=".length);
    } else if (a.startsWith("--older-than-days=")) {
      filter.olderThanDays = Number(a.slice("--older-than-days=".length));
    } else if (a.startsWith("--id=")) {
      filter.propertyId = a.slice("--id=".length);
    }
  }

  const queued = await enqueueSupervisorBatch(filter);
  logger.info({ queued }, "Supervisor enqueue CLI done");
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error({ err }, "Enqueue CLI failed");
    process.exit(1);
  });
}
