#!/usr/bin/env node
/** Nightly supervisor re-check.
 *
 * Invoked from Hetzner cron (see docs/infrastructure.md). Re-queues any
 * published/review listings whose supervisor run is older than
 * --older-than-days (default 30) or whose check version differs from the
 * current SUPERVISOR_CHECK_VERSION.
 */
import { createLogger } from "@mpgenesis/shared";
import { enqueueSupervisorBatch } from "./enqueue.js";

const logger = createLogger("supervisor-cron");

async function main() {
  const olderThanDays = Number(process.env["SUPERVISOR_CRON_DAYS"] ?? 30);

  const queued = await enqueueSupervisorBatch({
    status: ["review", "published"],
    stale: true,
    olderThanDays,
    reason: "cron",
  });
  logger.info({ queued, olderThanDays }, "Nightly supervisor run complete");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Supervisor cron failed");
  process.exit(1);
});
