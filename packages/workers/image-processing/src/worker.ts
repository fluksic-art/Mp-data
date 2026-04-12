import { Job } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type ImageProcessingJobData,
  createLogger,
  getStorage,
  buildImageFilename,
  buildImageStoragePath,
  type SlugAdjectiveKey,
  isSlugAdjectiveKey,
} from "@mpgenesis/shared";
import { createDb, properties, propertyImages } from "@mpgenesis/database";
import { eq, and } from "drizzle-orm";

const logger = createLogger("image-processing-worker");

const BUCKET = "property-images";
const DOWNLOAD_TIMEOUT_MS = 15_000;

export class ImageProcessingWorker extends BaseWorker<"image-processing"> {
  constructor() {
    super(QUEUE_NAMES.IMAGE_PROCESSING);
  }

  protected async process(job: Job<ImageProcessingJobData>): Promise<void> {
    const { propertyId, imageUrl, position, sourceId, crawlRunId } = job.data;
    const db = createDb();

    // 1. Idempotency check: skip if rawUrl already set
    const [existing] = await db
      .select({ rawUrl: propertyImages.rawUrl })
      .from(propertyImages)
      .where(
        and(
          eq(propertyImages.propertyId, propertyId),
          eq(propertyImages.position, position),
        ),
      )
      .limit(1);

    if (existing?.rawUrl) {
      logger.info(
        { propertyId, position },
        "Image already uploaded, skipping",
      );
      return;
    }

    // 2. Fetch property metadata for filename generation
    const [property] = await db
      .select({
        id: properties.id,
        city: properties.city,
        bedrooms: properties.bedrooms,
        propertyType: properties.propertyType,
        slugAdjective: properties.slugAdjective,
      })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    if (!property) {
      logger.warn({ propertyId }, "Property not found, skipping image");
      return;
    }

    // 3. Download image
    const downloadStart = Date.now();
    let buffer: Buffer;
    let contentType: string;

    try {
      const res = await fetch(imageUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { "User-Agent": "MPgenesis-ImageBot/1.0" },
      });

      if (!res.ok) {
        if (res.status === 404 || res.status === 403) {
          logger.warn(
            { propertyId, position, status: res.status, imageUrl },
            "Image not available, skipping permanently",
          );
          return;
        }
        throw new Error(`Download failed: HTTP ${res.status}`);
      }

      buffer = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get("content-type") ?? "image/jpeg";
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`);
      }
      throw error;
    }

    const downloadMs = Date.now() - downloadStart;

    // 4. Build SEO filename
    const slugAdj = isSlugAdjectiveKey(property.slugAdjective)
      ? (property.slugAdjective as SlugAdjectiveKey)
      : null;

    const filename = buildImageFilename({
      city: property.city,
      bedrooms: property.bedrooms,
      propertyType: property.propertyType,
      slugAdjective: slugAdj,
      propertyId: property.id,
      position,
      originalUrl: imageUrl,
    });

    const storagePath = buildImageStoragePath(property.id, filename);

    // 5. Upload to Supabase Storage
    const storage = getStorage();
    const { publicUrl } = await storage.upload(
      BUCKET,
      storagePath,
      buffer,
      contentType,
    );

    // 6. Update property_images.rawUrl
    await db
      .update(propertyImages)
      .set({ rawUrl: publicUrl })
      .where(
        and(
          eq(propertyImages.propertyId, propertyId),
          eq(propertyImages.position, position),
        ),
      );

    logger.info(
      {
        sourceId,
        crawlRunId,
        propertyId,
        position,
        publicUrl,
        sizeBytes: buffer.length,
        downloadMs,
        filename,
      },
      "Image uploaded to Supabase Storage",
    );
  }
}
