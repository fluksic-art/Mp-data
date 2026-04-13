import { Job, Queue } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type ExtractJobData,
  type ParaphraseJobData,
  type ImageProcessingJobData,
  createLogger,
  getRedisConnection,
} from "@mpgenesis/shared";
import { createDb, properties, propertyImages } from "@mpgenesis/database";
import { extractProperty } from "@mpgenesis/extraction";
import { createHash } from "node:crypto";
import { eq, and, ne, sql } from "drizzle-orm";

const logger = createLogger("extract-worker");

export class ExtractWorker extends BaseWorker<"extract"> {
  private paraphraseQueue: Queue<ParaphraseJobData>;
  private imageProcessingQueue: Queue<ImageProcessingJobData>;

  constructor() {
    super(QUEUE_NAMES.EXTRACT);
    const connection = getRedisConnection();
    this.paraphraseQueue = new Queue(QUEUE_NAMES.PARAPHRASE, { connection });
    this.imageProcessingQueue = new Queue(QUEUE_NAMES.IMAGE_PROCESSING, {
      connection,
    });
  }

  async close() {
    await this.imageProcessingQueue.close();
    await this.paraphraseQueue.close();
    await super.close();
  }

  protected async process(job: Job<ExtractJobData>): Promise<void> {
    const { sourceId, crawlRunId, pageUrl, html } = job.data;

    const result = await extractProperty(html, pageUrl);

    if (!result) {
      logger.warn({ sourceId, crawlRunId, pageUrl }, "No data extracted");
      return;
    }

    const { data, tier, usage } = result;

    // P6: Log LLM costs if Tier 3 was used
    if (usage) {
      logger.info(
        {
          sourceId,
          crawlRunId,
          pageUrl,
          tier,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: usage.costUsd,
        },
        "LLM extraction cost",
      );
    }

    // Generate sourceListingId from URL if not extracted
    const sourceListingId =
      data.sourceListingId ?? generateListingId(pageUrl);

    // Content hash for change detection between crawls
    const contentHash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");

    const db = createDb();

    // P4: Idempotent upsert using source_id + source_listing_id
    await db
      .insert(properties)
      .values({
        sourceId,
        sourceListingId,
        sourceUrl: pageUrl,
        title: data.title ?? "Untitled",
        propertyType: data.propertyType ?? "apartment",
        listingType: data.listingType ?? "sale",
        priceCents: data.priceCents ?? null,
        currency: data.currency ?? "MXN",
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        constructionM2: data.constructionM2 ?? null,
        landM2: data.landM2 ?? null,
        parkingSpaces: data.parkingSpaces ?? null,
        developerName: data.developerName ?? null,
        developmentName: data.developmentName ?? null,
        slugAdjective: data.slugAdjective ?? null,
        country: "MX",
        state: data.state ?? "",
        city: data.city ?? "",
        neighborhood: data.neighborhood ?? null,
        address: data.address ?? null,
        postalCode: data.postalCode ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        rawData: data.rawData ?? {},
        extractedData: { tier, pageUrl },
        contentHash,
        lastCrawlRunId: crawlRunId,
        status: "draft",
      })
      .onConflictDoUpdate({
        target: [properties.sourceId, properties.sourceListingId],
        set: {
          title: data.title ?? "Untitled",
          propertyType: data.propertyType ?? "apartment",
          listingType: data.listingType ?? "sale",
          priceCents: data.priceCents ?? null,
          currency: data.currency ?? "MXN",
          bedrooms: data.bedrooms ?? null,
          bathrooms: data.bathrooms ?? null,
          constructionM2: data.constructionM2 ?? null,
          landM2: data.landM2 ?? null,
          parkingSpaces: data.parkingSpaces ?? null,
          developerName: data.developerName ?? null,
          developmentName: data.developmentName ?? null,
          slugAdjective: data.slugAdjective ?? null,
          state: data.state ?? "",
          city: data.city ?? "",
          neighborhood: data.neighborhood ?? null,
          address: data.address ?? null,
          postalCode: data.postalCode ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          rawData: data.rawData ?? {},
          extractedData: { tier, pageUrl },
          contentHash,
          lastSeenAt: new Date(),
          lastCrawlRunId: crawlRunId,
        },
      });

    logger.info(
      { sourceId, crawlRunId, pageUrl, sourceListingId, tier },
      "Property upserted",
    );

    // Fetch stored property ID + pipeline state (needed for downstream queues)
    const [stored] = await db
      .select({ id: properties.id, contentEs: properties.contentEs })
      .from(properties)
      .where(
        and(
          eq(properties.sourceId, sourceId),
          eq(properties.sourceListingId, sourceListingId),
        ),
      )
      .limit(1);

    if (!stored) return;

    // --- Images: insert into property_images + enqueue upload jobs ---
    const imageUrls = extractImageUrls(data.rawData);
    if (imageUrls.length > 0) {
      // P4: Upsert images with ON CONFLICT on (property_id, position)
      for (let i = 0; i < imageUrls.length; i++) {
        await db
          .insert(propertyImages)
          .values({
            propertyId: stored.id,
            position: i,
            originalUrl: imageUrls[i]!,
          })
          .onConflictDoUpdate({
            target: [propertyImages.propertyId, propertyImages.position],
            set: { originalUrl: imageUrls[i]! },
          });
      }

      // Check which images already have rawUrl (already uploaded)
      const existing = await db
        .select({
          position: propertyImages.position,
          rawUrl: propertyImages.rawUrl,
        })
        .from(propertyImages)
        .where(eq(propertyImages.propertyId, stored.id));

      const uploaded = new Set(
        existing.filter((img) => img.rawUrl != null).map((img) => img.position),
      );

      let enqueued = 0;
      for (let i = 0; i < imageUrls.length; i++) {
        if (uploaded.has(i)) continue;
        await this.imageProcessingQueue.add(QUEUE_NAMES.IMAGE_PROCESSING, {
          sourceId,
          crawlRunId,
          propertyId: stored.id,
          imageUrl: imageUrls[i]!,
          position: i,
        });
        enqueued++;
      }

      logger.info(
        {
          propertyId: stored.id,
          totalImages: imageUrls.length,
          enqueued,
          skipped: imageUrls.length - enqueued,
        },
        "Image processing jobs enqueued",
      );
    }

    // --- Duplicate detection: check if same development exists in another source ---
    const isDuplicate = await detectCrossSourceDuplicate(
      db,
      sourceId,
      data.developmentName ?? null,
      data.title ?? "",
    );

    if (isDuplicate) {
      await db
        .update(properties)
        .set({ status: "possible_duplicate" })
        .where(eq(properties.id, stored.id));

      logger.info(
        { propertyId: stored.id, sourceListingId, developmentName: data.developmentName },
        "Possible duplicate detected, skipping paraphrase",
      );
      return;
    }

    // --- Paraphrase: enqueue if not already done and description is long enough ---
    const description = extractDescriptionFromRawData(data.rawData);
    if (description && description.length >= 50 && !stored.contentEs) {
      await this.paraphraseQueue.add(QUEUE_NAMES.PARAPHRASE, {
        sourceId,
        crawlRunId,
        propertyId: stored.id,
        description,
      });
      logger.info(
        { propertyId: stored.id, sourceListingId },
        "Paraphrase job enqueued",
      );
    } else {
      logger.info(
        { sourceListingId },
        "Skipping paraphrase enqueue: no usable description",
      );
    }
  }
}

/** Extract image URLs from rawData JSONB. */
function extractImageUrls(rawData: unknown): string[] {
  if (!rawData || typeof rawData !== "object") return [];
  const r = rawData as Record<string, unknown>;
  const img = r["image"];
  if (Array.isArray(img)) return img.filter((u): u is string => typeof u === "string");
  if (typeof img === "string") return [img];
  return [];
}

function extractDescriptionFromRawData(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const r = rawData as Record<string, unknown>;
  const desc = r["description"];
  return typeof desc === "string" && desc.trim().length > 0 ? desc : null;
}

/** Normalize a name for cross-source duplicate comparison. */
function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s]/g, "") // alphanumeric only
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if a property with the same development exists in another source. */
async function detectCrossSourceDuplicate(
  db: ReturnType<typeof createDb>,
  currentSourceId: string,
  developmentName: string | null,
  title: string,
): Promise<boolean> {
  const nameToCheck = developmentName ?? title;
  if (!nameToCheck || nameToCheck.length < 3) return false;

  const normalized = normalizeForDedup(nameToCheck);
  if (normalized.length < 3) return false;

  // Fetch developmentName + title from other sources and compare in JS
  // (avoids needing unaccent extension in Supabase)
  const candidates = await db
    .select({
      developmentName: properties.developmentName,
      title: properties.title,
    })
    .from(properties)
    .where(ne(properties.sourceId, currentSourceId))
    .limit(2000);

  for (const c of candidates) {
    const candidateName = c.developmentName ?? c.title;
    const candidateNorm = normalizeForDedup(candidateName);
    if (candidateNorm.includes(normalized) || normalized.includes(candidateNorm)) {
      return true;
    }
  }

  return false;
}

function generateListingId(url: string): string {
  // Use URL path as a stable listing ID
  try {
    const path = new URL(url).pathname;
    return path.replace(/^\/|\/$/g, "").replace(/\//g, "-") || "unknown";
  } catch {
    return createHash("md5").update(url).digest("hex").slice(0, 16);
  }
}
