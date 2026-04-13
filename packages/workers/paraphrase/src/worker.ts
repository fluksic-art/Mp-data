import { Job, Queue } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type ParaphraseJobData,
  type TranslateJobData,
  createLogger,
  getRedisConnection,
} from "@mpgenesis/shared";
import { createDb, properties, sources } from "@mpgenesis/database";
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

    // Idempotency: skip if already paraphrased
    if (property.contentEs) {
      logger.info({ propertyId }, "Already paraphrased, skipping");
      return;
    }

    // Skip duplicates — require manual approval first
    if (property.status === "possible_duplicate") {
      logger.info({ propertyId }, "Possible duplicate, skipping paraphrase");
      return;
    }

    // Load source domain so the paraphrase worker can suppress it from output
    const [source] = await db
      .select({ domain: sources.domain })
      .from(sources)
      .where(eq(sources.id, property.sourceId))
      .limit(1);

    // Extract amenity labels from rawData (goodlers stores IDs, others may store labels)
    const rawAmenities = (property.rawData as Record<string, unknown>)?.amenities;
    const amenities: string[] = Array.isArray(rawAmenities)
      ? rawAmenities.map((a: unknown) => (typeof a === "string" ? a : "")).filter(Boolean)
      : [];

    const result = await paraphraseProperty({
      originalTitle: property.title,
      originalDescription: description,
      city: property.city,
      state: property.state,
      neighborhood: property.neighborhood,
      propertyType: property.propertyType,
      listingType: property.listingType,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      constructionM2: property.constructionM2,
      landM2: property.landM2 ? Number(property.landM2) : null,
      priceCents: property.priceCents,
      currency: property.currency,
      amenities: amenities.length > 0 ? amenities : undefined,
      developerName: property.developerName,
      developmentName: property.developmentName,
      sourceDomain: source?.domain ?? null,
    });

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

    // Save structured content (ES)
    await db
      .update(properties)
      .set({ contentEs: result.content })
      .where(eq(properties.id, propertyId));

    // Enqueue translation jobs (ES → EN, ES → FR) with dedup jobId
    for (const locale of ["en", "fr"] as const) {
      await this.translateQueue.add(
        QUEUE_NAMES.TRANSLATE,
        {
          sourceId,
          crawlRunId,
          propertyId,
          textEs: "", // legacy field — content is read from contentEs JSONB by translate worker
          targetLocale: locale,
        },
        { jobId: `translate-${propertyId}-${locale}` },
      );
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
