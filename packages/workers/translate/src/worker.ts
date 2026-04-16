import { Job, Queue } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type TranslateJobData,
  type SupervisorJobData,
  createLogger,
  getRedisConnection,
  isStructuredContent,
} from "@mpgenesis/shared";
import { createDb, properties, sources } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { translateStructured } from "./translate.js";

const logger = createLogger("translate-worker");

export class TranslateWorker extends BaseWorker<"translate"> {
  private supervisorQueue: Queue<SupervisorJobData>;

  constructor() {
    super(QUEUE_NAMES.TRANSLATE);
    this.supervisorQueue = new Queue(QUEUE_NAMES.SUPERVISOR, {
      connection: getRedisConnection(),
    });
  }

  protected async process(job: Job<TranslateJobData>): Promise<void> {
    const { sourceId, crawlRunId, propertyId, targetLocale } = job.data;
    const db = createDb();

    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (!property) {
      logger.warn({ propertyId }, "Property not found, skipping");
      return;
    }

    if (!isStructuredContent(property.contentEs)) {
      logger.warn(
        { propertyId },
        "No structured ES content to translate, skipping (run paraphrase first)",
      );
      return;
    }

    // Idempotency: skip if already translated for this locale
    const existing = targetLocale === "en" ? property.contentEn : property.contentFr;
    if (existing) {
      logger.info({ propertyId, locale: targetLocale }, "Already translated, skipping");
      return;
    }

    // Skip duplicates — require manual approval first
    if (property.status === "possible_duplicate") {
      logger.info({ propertyId, locale: targetLocale }, "Possible duplicate, skipping translate");
      return;
    }

    // Load source domain and build the prohibited-names list so the
    // translator also enforces anonimato.
    const [source] = await db
      .select({ domain: sources.domain })
      .from(sources)
      .where(eq(sources.id, property.sourceId))
      .limit(1);

    const prohibitedNames: string[] = [];
    if (property.developerName) prohibitedNames.push(property.developerName);
    if (property.developmentName) prohibitedNames.push(property.developmentName);
    if (source?.domain) {
      prohibitedNames.push(source.domain);
      const root = source.domain.split(".")[0];
      if (root && root.length > 3) prohibitedNames.push(root);
    }

    const result = await translateStructured(
      property.contentEs,
      targetLocale,
      prohibitedNames,
    );

    // P6: Log costs
    logger.info(
      {
        sourceId,
        crawlRunId,
        propertyId,
        locale: targetLocale,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      },
      "Translation LLM cost",
    );

    // Save translated structured content
    const contentField = targetLocale === "en" ? "contentEn" : "contentFr";

    await db
      .update(properties)
      .set({ [contentField]: result.content })
      .where(eq(properties.id, propertyId));

    // If both translations are done, move to review
    const [updated] = await db
      .select({
        contentEn: properties.contentEn,
        contentFr: properties.contentFr,
      })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (updated?.contentEn && updated?.contentFr) {
      await db
        .update(properties)
        .set({ status: "review" })
        .where(eq(properties.id, propertyId));

      logger.info({ propertyId }, "All translations complete, status → review");

      // Enqueue supervisor — it re-reads the row and finalizes qa_status.
      // Best-effort: if the queue is down, the listing still lands in
      // review and the nightly cron will pick it up.
      try {
        await this.supervisorQueue.add(
          QUEUE_NAMES.SUPERVISOR,
          {
            sourceId,
            crawlRunId,
            propertyId,
            reason: "post-translate",
          },
          { jobId: `supervisor-${propertyId}-post-translate` },
        );
      } catch (err) {
        logger.warn(
          { propertyId, err },
          "Failed to enqueue supervisor post-translate — nightly cron will catch it",
        );
      }
    }
  }

  async close() {
    await this.supervisorQueue.close();
    await super.close();
  }
}
