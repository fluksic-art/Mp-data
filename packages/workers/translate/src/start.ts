#!/usr/bin/env node
import { createLogger } from "@mpgenesis/shared";
import { TranslateWorker } from "./worker.js";

const logger = createLogger("translate-start");
const worker = new TranslateWorker();
logger.info("Translate worker started, waiting for jobs...");

process.on("SIGINT", async () => { await worker.close(); process.exit(0); });
process.on("SIGTERM", async () => { await worker.close(); process.exit(0); });
