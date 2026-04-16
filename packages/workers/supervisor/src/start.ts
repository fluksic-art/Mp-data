#!/usr/bin/env node
import { createLogger } from "@mpgenesis/shared";
import { SupervisorWorker } from "./worker.js";

const logger = createLogger("supervisor-start");
const worker = new SupervisorWorker();
logger.info("Supervisor worker started, waiting for jobs...");

process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
