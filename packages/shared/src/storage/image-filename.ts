import { slugify } from "../seo/json-ld.js";
import {
  translateAdjective,
  type SlugAdjectiveKey,
} from "../seo/slug-adjectives.js";

/** ES-locale property type labels for image filenames. */
const PROPERTY_TYPE_ES: Record<string, string> = {
  apartment: "departamento",
  house: "casa",
  villa: "villa",
  penthouse: "penthouse",
  land: "terreno",
  office: "oficina",
  commercial: "local",
};

export interface ImageFilenameParams {
  city: string;
  bedrooms: number | null;
  propertyType: string;
  slugAdjective: SlugAdjectiveKey | null;
  propertyId: string;
  position: number;
  originalUrl: string;
}

/** Build an SEO-friendly, anonymized image filename.
 *
 * Format: {city}-{bedrooms}rec-{type}-{adjective}-{id8}-{pos}.{ext}
 * - Bedrooms omitted for land or when null
 * - Adjective omitted when null
 * - Uses ES locale (primary market)
 */
export function buildImageFilename(params: ImageFilenameParams): string {
  const city = slugify(params.city);
  const type = PROPERTY_TYPE_ES[params.propertyType] ?? params.propertyType;
  const adj = translateAdjective(params.slugAdjective, "es");
  const id8 = params.propertyId.slice(0, 8);
  const pos = String(params.position).padStart(2, "0");
  const ext = extractExtension(params.originalUrl);

  const parts: string[] = [city];

  // Skip bedrooms for land or when null
  if (params.propertyType !== "land" && params.bedrooms != null) {
    parts.push(`${params.bedrooms}rec`);
  }

  parts.push(type);
  if (adj) parts.push(adj);
  parts.push(id8);
  parts.push(pos);

  return `${parts.join("-")}.${ext}`;
}

/** Build the full storage path within the bucket. */
export function buildImageStoragePath(
  propertyId: string,
  filename: string,
): string {
  const id8 = propertyId.slice(0, 8);
  return `${id8}/${filename}`;
}

/** Extract file extension from a URL, defaulting to jpg. */
function extractExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lastDot = pathname.lastIndexOf(".");
    if (lastDot === -1) return "jpg";
    const ext = pathname.slice(lastDot + 1).toLowerCase();
    // Only allow known image extensions
    if (["jpg", "jpeg", "png", "webp", "avif"].includes(ext)) return ext;
    return "jpg";
  } catch {
    return "jpg";
  }
}
