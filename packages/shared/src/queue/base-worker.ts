import { Worker, Queue, Job } from "bullmq";
import type { QueueName } from "./queues.js";
import type { JobDataMap } from "./job-types.js";
import { getRedisConnection } from "./connection.js";
import { createLogger, type Logger } from "../logger/index.js";

/** Base worker with P6 observability built in.
 *
 * Every job logs: sourceId, crawlRunId, duration_ms, status.
 * Subclasses implement `process()` with their specific logic.
 */
export abstract class BaseWorker<Q extends QueueName> {
  protected worker: Worker;
  protected queue: Queue;
  protected logger: Logger;

  constructor(queueName: Q) {
    const connection = getRedisConnection();
    this.logger = createLogger(`worker:${queueName}`);
    this.queue = new Queue(queueName, { connection });
    this.worker = new Worker(
      queueName,
      async (job: Job<JobDataMap[Q]>) => {
        const startTime = Date.now();
        const { sourceId, crawlRunId } = job.data;

        this.logger.info(
          { sourceId, crawlRunId, jobId: job.id },
          `Processing job ${job.id}`,
        );

        try {
          const result = await this.process(job);
          const durationMs = Date.now() - startTime;

          this.logger.info(
            { sourceId, crawlRunId, jobId: job.id, durationMs, status: "completed" },
            `Job ${job.id} completed in ${durationMs}ms`,
          );

          return result;
        } catch (error) {
          const durationMs = Date.now() - startTime;

          this.logger.error(
            { sourceId, crawlRunId, jobId: job.id, durationMs, status: "failed", error },
            `Job ${job.id} failed after ${durationMs}ms`,
          );

          throw error;
        }
      },
      {
        connection,
        concurrency: 1,
      },
    );

    this.worker.on("error", (error) => {
      this.logger.error({ error }, "Worker error");
    });
  }

  /** Implement job processing logic. */
  protected abstract process(job: Job<JobDataMap[Q]>): Promise<unknown>;

  /** Add a job to this queue. */
  async addJob(data: JobDataMap[Q], opts?: { priority?: number }) {
    return this.queue.add(this.queue.name, data, {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      ...opts,
    });
  }

  async close() {
    await this.worker.close();
    await this.queue.close();
  }
}
