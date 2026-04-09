import { Job, Queue } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type ParaphraseJobData,
  type TranslateJobData,
  createLogger,
  getRedisConnection,
} from "@mpgenesis/shared";
import { createDb, properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { paraphraseProperty } from "./paraphrase.js";

const logger = createLogger("paraphrase-worker");

export class ParaphraseWorker extends BaseWorker<"paraphrase"> {
  private translateQueue: Queue<TranslateJobData>;

  constructor() {
    super(QUEUE_NAMES.PARAPHRASE);
    this.translateQueue = new Queue(QUEUE_NAMES.TRANSLATE, {
      connection: getRedisConnection(),
    });
  }

  protected async process(job: Job<ParaphraseJobData>): Promise<void> {
    const { sourceId, crawlRunId, propertyId, description } = job.data;
    const db = createDb();

    // Get property for context
    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (!property) {
      logger.warn({ propertyId }, "Property not found, skipping");
      return;
    }

    const result = await paraphraseProperty(
      property.title,
      description,
      property.city,
      property.propertyType,
    );

    // P6: Log LLM costs
    logger.info(
      {
        sourceId,
        crawlRunId,
        propertyId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      },
      "Paraphrase LLM cost",
    );

    // Save paraphrased content (ES)
    await db
      .update(properties)
      .set({
        contentEs: {
          title: result.title,
          description: result.description,
          metaTitle: result.metaTitle,
          metaDescription: result.metaDescription,
          h1: result.h1,
        },
      })
      .where(eq(properties.id, propertyId));

    // Enqueue translation jobs (ES → EN, ES → FR)
    for (const locale of ["en", "fr"] as const) {
      await this.translateQueue.add(QUEUE_NAMES.TRANSLATE, {
        sourceId,
        crawlRunId,
        propertyId,
        textEs: result.description,
        targetLocale: locale,
      });
    }

    logger.info(
      { propertyId, translateJobsQueued: 2 },
      "Paraphrase saved, translation jobs queued",
    );
  }

  async close() {
    await this.translateQueue.close();
    await super.close();
  }
}
