#!/usr/bin/env node
import { createLogger } from "@mpgenesis/shared";
import { ExtractWorker } from "./worker.js";

const logger = createLogger("extract-start");

const worker = new ExtractWorker();

logger.info("Extract worker started, waiting for jobs...");

async function shutdown() {
  logger.info("Shutting down extract worker...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
