import { Queue } from "bullmq";
import { getRedisConnection } from "../queue/connection.js";
import { QUEUE_NAMES } from "../queue/queues.js";
import type { ParaphraseJobData, TranslateJobData, SupervisorJobData } from "../queue/job-types.js";

export async function enqueueParaphraseJob(
  data: ParaphraseJobData,
): Promise<void> {
  const queue = new Queue<ParaphraseJobData>(QUEUE_NAMES.PARAPHRASE, {
    connection: getRedisConnection(),
  });
  try {
    await queue.add(QUEUE_NAMES.PARAPHRASE, data);
  } finally {
    await queue.close();
  }
}

export async function enqueueTranslateJob(
  data: TranslateJobData,
): Promise<void> {
  const queue = new Queue<TranslateJobData>(QUEUE_NAMES.TRANSLATE, {
    connection: getRedisConnection(),
  });
  try {
    await queue.add(QUEUE_NAMES.TRANSLATE, data);
  } finally {
    await queue.close();
  }
}

export async function enqueueSupervisorRecheck(
  data: Omit<SupervisorJobData, "force" | "skipJudge" | "reason">,
): Promise<void> {
  const queue = new Queue<SupervisorJobData>(QUEUE_NAMES.SUPERVISOR, {
    connection: getRedisConnection(),
  });
  try {
    await queue.add(
      QUEUE_NAMES.SUPERVISOR,
      { ...data, force: true, skipJudge: true, reason: "optimizer-recheck" },
      { jobId: `supervisor-${data.propertyId}-optimizer-${Date.now()}` },
    );
  } finally {
    await queue.close();
  }
}
