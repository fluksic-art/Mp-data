#!/usr/bin/env node
/** Retry all failed jobs across extract, paraphrase, and translate queues. */
import { Queue } from "bullmq";
import { QUEUE_NAMES, getRedisConnection, createLogger } from "@mpgenesis/shared";

const logger = createLogger("retry-failed");

async function retryQueue(name: string) {
  const queue = new Queue(name, { connection: getRedisConnection() });
  const failed = await queue.getFailed(0, 5000);
  logger.info({ queue: name, count: failed.length }, "Failed jobs found");

  let retried = 0;
  for (const job of failed) {
    await job.retry();
    retried++;
  }

  logger.info({ queue: name, retried }, "Jobs retried");
  await queue.close();
  return retried;
}

async function main() {
  const queues = [QUEUE_NAMES.EXTRACT, QUEUE_NAMES.PARAPHRASE, QUEUE_NAMES.TRANSLATE];
  let total = 0;
  for (const q of queues) {
    total += await retryQueue(q);
  }
  logger.info({ total }, "All queues retried");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ error: String(err) }, "Retry failed");
  process.exit(1);
});
