import { Job } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type ExtractJobData,
  createLogger,
} from "@mpgenesis/shared";
import { createDb, properties } from "@mpgenesis/database";
import { extractProperty } from "@mpgenesis/extraction";
import { createHash } from "node:crypto";

const logger = createLogger("extract-worker");

export class ExtractWorker extends BaseWorker<"extract"> {
  constructor() {
    super(QUEUE_NAMES.EXTRACT);
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
        bathrooms: data.bathrooms != null ? String(data.bathrooms) : null,
        constructionM2: data.constructionM2 != null
          ? String(data.constructionM2)
          : null,
        landM2: data.landM2 != null ? String(data.landM2) : null,
        parkingSpaces: data.parkingSpaces ?? null,
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
          bathrooms: data.bathrooms != null ? String(data.bathrooms) : null,
          constructionM2: data.constructionM2 != null
            ? String(data.constructionM2)
            : null,
          landM2: data.landM2 != null ? String(data.landM2) : null,
          parkingSpaces: data.parkingSpaces ?? null,
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
  }
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
