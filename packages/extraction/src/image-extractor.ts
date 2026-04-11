import * as cheerio from "cheerio";

/** Extract property images from HTML.
 *
 * Strategy (in order of reliability):
 * 1. JSON-LD `image` arrays (any @type, not just RealEstateListing)
 * 2. og:image meta tags
 * 3. <img> tags with property-relevant URL patterns
 *
 * Filters out: logos, icons, avatars, share buttons, related listings
 */
export function extractImagesFromHtml(html: string, sourceUrl: string): string[] {
  const $ = cheerio.load(html);
  const imagesSet = new Set<string>();

  // 1. JSON-LD images (most reliable)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).text().trim();
      if (!text) return;
      const data: unknown = JSON.parse(text);
      collectJsonLdImages(data, imagesSet);
    } catch {
      // skip invalid JSON
    }
  });

  // 2. og:image
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) imagesSet.add(normalizeUrl(ogImage, sourceUrl));

  $('meta[property="og:image:secure_url"]').each((_, el) => {
    const src = $(el).attr("content");
    if (src) imagesSet.add(normalizeUrl(src, sourceUrl));
  });

  // 3. <img> tags - filtered
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-lazy-src");
    if (!src) return;
    const url = normalizeUrl(src, sourceUrl);
    if (isLikelyPropertyImage(url, $(el))) {
      imagesSet.add(url);
    }
  });

  // Filter and dedupe final list
  return Array.from(imagesSet)
    .filter((url) => isLikelyPropertyImage(url))
    .filter((url) => !isJunkImage(url));
}

/** Recursively walk JSON-LD looking for image fields */
function collectJsonLdImages(data: unknown, set: Set<string>): void {
  if (!data) return;

  if (Array.isArray(data)) {
    for (const item of data) collectJsonLdImages(item, set);
    return;
  }

  if (typeof data !== "object") return;

  const obj = data as Record<string, unknown>;

  // Check for image field
  const img = obj["image"];
  if (typeof img === "string") {
    set.add(img);
  } else if (Array.isArray(img)) {
    for (const i of img) {
      if (typeof i === "string") set.add(i);
      else if (typeof i === "object" && i !== null) {
        const url = (i as Record<string, unknown>)["url"];
        if (typeof url === "string") set.add(url);
      }
    }
  } else if (typeof img === "object" && img !== null) {
    const url = (img as Record<string, unknown>)["url"];
    if (typeof url === "string") set.add(url);
  }

  // Recurse into @graph
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) collectJsonLdImages(item, set);
  }
}

/** Resolve relative URL against page URL */
function normalizeUrl(src: string, sourceUrl: string): string {
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return src;
  }
}

/** Filter junk images (logos, icons, avatars, social share buttons) */
function isJunkImage(url: string): boolean {
  const lower = url.toLowerCase();
  const junkPatterns = [
    /logo/i,
    /icon/i,
    /favicon/i,
    /avatar/i,
    /\bshare\b/i,
    /whatsapp/i,
    /facebook/i,
    /twitter/i,
    /instagram/i,
    /pinterest/i,
    /\bsprite\b/i,
    /placeholder/i,
    /\bbanner\b/i,
    /\.svg(\?|$)/,
    /\.gif(\?|$)/,
  ];
  return junkPatterns.some((p) => p.test(lower));
}

/** Heuristic: is this likely a property photo? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isLikelyPropertyImage(url: string, el?: any): boolean {
  // Must be http/https
  if (!url.startsWith("http")) return false;

  // Skip data URIs
  if (url.startsWith("data:")) return false;

  // Skip junk
  if (isJunkImage(url)) return false;

  // Check element context if available
  if (el) {
    const cls = (el.attr("class") ?? "").toLowerCase();
    const alt = (el.attr("alt") ?? "").toLowerCase();
    if (
      cls.includes("logo") ||
      cls.includes("icon") ||
      cls.includes("avatar") ||
      alt.includes("logo")
    ) {
      return false;
    }

    // Check parent context — skip images in nav, header, footer
    const parents = el.parents("nav, header, footer, .menu, .navigation");
    if (parents.length > 0) return false;
  }

  return true;
}
