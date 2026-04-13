/**
 * Block non-essential resources to save proxy bandwidth.
 * Images are downloaded later by the image-processing worker directly from CDN.
 */
import type { Page } from "playwright";

const BLOCKED_TYPES = new Set(["stylesheet", "font", "image", "media"]);
const BLOCKED_EXT =
  /\.(css|woff2?|ttf|eot|otf|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mp3)(\?.*)?$/i;

export async function blockResources(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (BLOCKED_TYPES.has(type) || BLOCKED_EXT.test(url)) {
      return route.abort();
    }
    return route.continue();
  });
}
