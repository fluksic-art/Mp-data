#!/usr/bin/env node
import { createLogger } from "@mpgenesis/shared";
import { CrawlWorker } from "./worker.js";

const logger = createLogger("crawl-start");

const worker = new CrawlWorker();

logger.info("Crawl worker started, waiting for jobs...");

async function shutdown() {
  logger.info("Shutting down crawl worker...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
