import { Job } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type TranslateJobData,
  createLogger,
} from "@mpgenesis/shared";
import { createDb, properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { translateProperty } from "./translate.js";

const logger = createLogger("translate-worker");

export class TranslateWorker extends BaseWorker<"translate"> {
  constructor() {
    super(QUEUE_NAMES.TRANSLATE);
  }

  protected async process(job: Job<TranslateJobData>): Promise<void> {
    const { sourceId, crawlRunId, propertyId, textEs, targetLocale } = job.data;
    const db = createDb();

    // Get ES content for full translation
    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (!property) {
      logger.warn({ propertyId }, "Property not found, skipping");
      return;
    }

    const contentEs = property.contentEs as Record<string, string> | null;
    if (!contentEs) {
      logger.warn({ propertyId }, "No ES content to translate, skipping");
      return;
    }

    const result = await translateProperty(
      contentEs["title"] ?? property.title,
      contentEs["description"] ?? textEs,
      contentEs["metaTitle"] ?? property.title.slice(0, 60),
      contentEs["metaDescription"] ?? textEs.slice(0, 160),
      contentEs["h1"] ?? property.title,
      targetLocale,
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

    // Save translated content
    const contentField =
      targetLocale === "en" ? "contentEn" : "contentFr";

    const translatedContent = {
      title: result.title,
      description: result.description,
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      h1: result.h1,
    };

    await db
      .update(properties)
      .set({ [contentField]: translatedContent })
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
    }
  }
}
