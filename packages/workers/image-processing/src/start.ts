#!/usr/bin/env node
import { createLogger } from "@mpgenesis/shared";
import { ImageProcessingWorker } from "./worker.js";

const logger = createLogger("image-processing-start");

const worker = new ImageProcessingWorker();

logger.info("Image processing worker started, waiting for jobs...");

async function shutdown() {
  logger.info("Shutting down image processing worker...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
