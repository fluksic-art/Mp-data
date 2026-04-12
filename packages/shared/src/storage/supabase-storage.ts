import { createLogger } from "../logger/index.js";

const logger = createLogger("storage");

/** Thin REST wrapper for Supabase Storage (no SDK dependency — P9). */
export class SupabaseStorage {
  private baseUrl: string;
  private serviceRoleKey: string;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.baseUrl = supabaseUrl;
    this.serviceRoleKey = serviceRoleKey;
  }

  /** Upload a file to a public bucket. Uses x-upsert for idempotency. */
  async upload(
    bucket: string,
    path: string,
    body: Uint8Array,
    contentType: string,
    cacheControl: string = "public, max-age=31536000, immutable",
  ): Promise<{ publicUrl: string }> {
    const url = `${this.baseUrl}/storage/v1/object/${bucket}/${path}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "x-upsert": "true",
      },
      // Node 20+ fetch accepts Uint8Array at runtime; the TS DOM lib
      // types lag behind, so we cast through BodyInit.
      body: body as unknown as BodyInit,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Storage upload failed (${res.status}): ${text}`,
      );
    }

    const publicUrl = this.getPublicUrl(bucket, path);
    logger.debug({ bucket, path, publicUrl }, "File uploaded");
    return { publicUrl };
  }

  /** Construct the public CDN URL for a file. */
  getPublicUrl(bucket: string, path: string): string {
    return `${this.baseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }
}

// Singleton
let cached: SupabaseStorage | null = null;

export function getStorage(): SupabaseStorage {
  if (cached) return cached;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required",
    );
  }

  cached = new SupabaseStorage(url, key);
  return cached;
}
