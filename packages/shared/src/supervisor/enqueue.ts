import { Queue } from "bullmq";
import { getRedisConnection } from "../queue/connection.js";
import { QUEUE_NAMES } from "../queue/queues.js";
import type { SupervisorJobData } from "../queue/job-types.js";
import { SUPERVISOR_CHECK_VERSION } from "../schemas/supervisor.js";

/** Enqueue a single supervisor job. Opens and closes its own Queue
 * connection — suitable for server actions where we don't keep a
 * long-lived queue handle. For batch operations, prefer reusing one
 * Queue instance via enqueueSupervisorJobs. */
export async function enqueueSupervisorJob(
  data: SupervisorJobData,
): Promise<void> {
  const queue = new Queue<SupervisorJobData>(QUEUE_NAMES.SUPERVISOR, {
    connection: getRedisConnection(),
  });
  try {
    await queue.add(QUEUE_NAMES.SUPERVISOR, data, {
      jobId: buildJobId(data),
    });
  } finally {
    await queue.close();
  }
}

export async function enqueueSupervisorJobs(
  datas: SupervisorJobData[],
): Promise<void> {
  if (datas.length === 0) return;
  const queue = new Queue<SupervisorJobData>(QUEUE_NAMES.SUPERVISOR, {
    connection: getRedisConnection(),
  });
  try {
    for (const d of datas) {
      await queue.add(QUEUE_NAMES.SUPERVISOR, d, { jobId: buildJobId(d) });
    }
  } finally {
    await queue.close();
  }
}

function buildJobId(data: SupervisorJobData): string {
  return data.force
    ? `supervisor-${data.propertyId}-force-${Date.now()}`
    : `supervisor-${data.propertyId}-${SUPERVISOR_CHECK_VERSION}`;
}
