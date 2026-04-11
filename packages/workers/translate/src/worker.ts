import { Job } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type TranslateJobData,
  createLogger,
  isStructuredContent,
} from "@mpgenesis/shared";
import { createDb, properties, sources } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { translateStructured } from "./translate.js";

const logger = createLogger("translate-worker");

export class TranslateWorker extends BaseWorker<"translate"> {
  constructor() {
    super(QUEUE_NAMES.TRANSLATE);
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
    }
  }
}
