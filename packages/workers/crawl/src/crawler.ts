import {
  PlaywrightCrawler,
  createPlaywrightRouter,
  type PlaywrightCrawlingContext,
  Configuration,
} from "crawlee";
import { createLogger } from "@mpgenesis/shared";
import { classifyUrl, isListingRelated } from "./classifier.js";

export interface CrawlResult {
  /** Pages crawled with their HTML content, keyed by URL */
  pages: Map<string, { url: string; html: string; pageType: string }>;
  /** Total pages crawled */
  pagesCrawled: number;
  /** Errors encountered */
  errors: Array<{ url: string; error: string }>;
}

export interface CrawlerOptions {
  domain: string;
  maxPages?: number | undefined;
  startUrl?: string | undefined;
  sourceId: string;
  crawlRunId: string;
}

export async function runCrawler(opts: CrawlerOptions): Promise<CrawlResult> {
  const { domain, maxPages = 100, sourceId, crawlRunId } = opts;
  const logger = createLogger("crawler");
  const baseUrl = `https://${domain}`;

  const result: CrawlResult = {
    pages: new Map(),
    pagesCrawled: 0,
    errors: [],
  };

  const router = createPlaywrightRouter();

  // Default handler: classify and route
  router.addDefaultHandler(async (ctx: PlaywrightCrawlingContext) => {
    const { request, page, enqueueLinks, log } = ctx;
    const url = request.loadedUrl ?? request.url;
    const pageType = classifyUrl(url);

    log.info(`[${pageType}] ${url}`);

    if (pageType === "sitemap") {
      await handleSitemap(ctx, baseUrl);
      return;
    }

    // For listing_index and property_detail, save the HTML
    if (pageType === "listing_index" || pageType === "property_detail") {
      const html = await page.content();
      result.pages.set(url, { url, html, pageType });
      result.pagesCrawled++;

      logger.info(
        { sourceId, crawlRunId, url, pageType, pagesCrawled: result.pagesCrawled },
        `Crawled page`,
      );
    }

    // From any non-sitemap page, follow links to listings
    await enqueueLinks({
      strategy: "same-domain",
      transformRequestFunction: (req) => {
        const type = classifyUrl(req.url);
        if (type === "property_detail" || type === "listing_index") {
          return req;
        }
        return false;
      },
    });

    // Handle pagination on listing indexes
    if (pageType === "listing_index") {
      await handlePagination(ctx);
    }
  });

  // Disable Crawlee's default storage to avoid polluting the filesystem
  const config = Configuration.getGlobalConfig();
  config.set("persistStorage", false);

  const crawler = new PlaywrightCrawler({
    requestHandler: router,
    maxRequestsPerCrawl: maxPages,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 30,
    headless: true,
    launchContext: {
      launchOptions: {
        args: ["--disable-blink-features=AutomationControlled"],
      },
    },
    failedRequestHandler: async ({ request }, error) => {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push({ url: request.url, error: errorMsg });
      logger.error(
        { sourceId, crawlRunId, url: request.url, error: errorMsg },
        "Request failed",
      );
    },
  });

  // Start with provided URL, sitemap discovery, then homepage
  const startUrls = [
    ...(opts.startUrl ? [opts.startUrl] : []),
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/wp-sitemap.xml`,
    baseUrl,
  ];

  await crawler.run(startUrls);

  logger.info(
    {
      sourceId,
      crawlRunId,
      pagesCrawled: result.pagesCrawled,
      errorCount: result.errors.length,
    },
    "Crawl complete",
  );

  return result;
}

async function handleSitemap(
  ctx: PlaywrightCrawlingContext,
  baseUrl: string,
) {
  const { page, enqueueLinks, log } = ctx;

  // Sitemaps are XML — extract URLs from <loc> tags
  const content = await page.content();
  const locRegex = /<loc>(.*?)<\/loc>/g;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(content)) !== null) {
    const url = match[1];
    if (url && url.startsWith(baseUrl)) {
      urls.push(url);
    }
  }

  // Separate sub-sitemaps from page URLs
  const subSitemaps = urls.filter((u) => /sitemap.*\.xml/i.test(u));
  const pageUrls = urls.filter((u) => !/sitemap.*\.xml/i.test(u));

  log.info(
    `Sitemap: found ${urls.length} URLs (${subSitemaps.length} sub-sitemaps, ${pageUrls.length} pages)`,
  );

  // Always follow sub-sitemaps
  if (subSitemaps.length > 0) {
    await enqueueLinks({ urls: subSitemaps });
  }

  // Filter page URLs to listing-relevant ones
  if (pageUrls.length > 0) {
    await enqueueLinks({
      urls: pageUrls,
      transformRequestFunction: (req) => {
        const type = classifyUrl(req.url);
        if (type !== "skip") {
          return req;
        }
        return false;
      },
    });
  }
}

async function handlePagination(ctx: PlaywrightCrawlingContext) {
  const { page, enqueueLinks } = ctx;

  // Detect pagination links: ?page=, /page/N/, rel="next"
  await enqueueLinks({
    selector: 'a[rel="next"], a[href*="page="], a[href*="/page/"]',
    strategy: "same-domain",
  });

  // Detect infinite scroll: scroll to bottom and wait for new content
  const previousHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  const newHeight = await page.evaluate(() => document.body.scrollHeight);

  if (newHeight > previousHeight) {
    // New content loaded, enqueue any new listing links
    await enqueueLinks({
      strategy: "same-domain",
      transformRequestFunction: (req) => {
        if (isListingRelated(req.url)) {
          return req;
        }
        return false;
      },
    });
  }
}
