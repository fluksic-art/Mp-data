#!/usr/bin/env node
import { createLogger } from "@mpgenesis/shared";
import { ParaphraseWorker } from "./worker.js";

const logger = createLogger("paraphrase-start");
const worker = new ParaphraseWorker();
logger.info("Paraphrase worker started, waiting for jobs...");

process.on("SIGINT", async () => { await worker.close(); process.exit(0); });
process.on("SIGTERM", async () => { await worker.close(); process.exit(0); });
