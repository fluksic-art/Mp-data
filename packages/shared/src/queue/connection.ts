import type { ConnectionOptions } from "bullmq";

function getRedisUrl(): string {
  const url = process.env["REDIS_URL"];
  if (!url) {
    throw new Error("REDIS_URL environment variable is required");
  }
  return url;
}

export function getRedisConnection(): ConnectionOptions {
  const raw = getRedisUrl();
  const url = new URL(raw);
  const useTls = url.protocol === "rediss:";
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    username: url.username || undefined,
    ...(useTls ? { tls: {} } : {}),
  };
}
