import { Job, Queue } from "bullmq";
import {
  BaseWorker,
  QUEUE_NAMES,
  type CrawlJobData,
  type ExtractJobData,
  createLogger,
  getRedisConnection,
} from "@mpgenesis/shared";
import { createDb } from "@mpgenesis/database";
import { crawlRuns, sources } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { runCrawler } from "./crawler.js";

export class CrawlWorker extends BaseWorker<"crawl"> {
  private extractQueue: Queue<ExtractJobData>;

  constructor() {
    super(QUEUE_NAMES.CRAWL);
    this.extractQueue = new Queue(QUEUE_NAMES.EXTRACT, {
      connection: getRedisConnection(),
    });
  }

  protected async process(job: Job<CrawlJobData>): Promise<void> {
    const { sourceId, crawlRunId, domain, maxPages } = job.data;
    const db = createDb();
    const logger = createLogger("crawl-worker");

    // Update crawl run status
    await db
      .update(crawlRuns)
      .set({ status: "running" })
      .where(eq(crawlRuns.id, crawlRunId));

    try {
      // Run the crawler
      const result = await runCrawler({
        domain,
        maxPages,
        sourceId,
        crawlRunId,
      });

      // Enqueue extract jobs for each property detail page
      let extractJobsQueued = 0;
      for (const [url, page] of result.pages) {
        if (page.pageType === "property_detail") {
          await this.extractQueue.add(QUEUE_NAMES.EXTRACT, {
            sourceId,
            crawlRunId,
            pageUrl: url,
            html: page.html,
          });
          extractJobsQueued++;
        }
      }

      logger.info(
        { sourceId, crawlRunId, extractJobsQueued },
        `Queued ${extractJobsQueued} extract jobs`,
      );

      // Update crawl run with results
      await db
        .update(crawlRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          pagesCrawled: result.pagesCrawled,
          listingsExtracted: extractJobsQueued,
          errors: result.errors,
        })
        .where(eq(crawlRuns.id, crawlRunId));

      // Update source last_crawled_at
      await db
        .update(sources)
        .set({ lastCrawledAt: new Date() })
        .where(eq(sources.id, sourceId));
    } catch (error) {
      await db
        .update(crawlRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          errors: [
            {
              url: domain,
              error: error instanceof Error ? error.message : String(error),
            },
          ],
        })
        .where(eq(crawlRuns.id, crawlRunId));

      throw error;
    }
  }

  async close() {
    await this.extractQueue.close();
    await super.close();
  }
}
