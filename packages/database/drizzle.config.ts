import { defineConfig } from "drizzle-kit";

const url = process.env["DATABASE_URL"]!;
const isLocal = /\/\/[^@]*@(localhost|127\.0\.0\.1)/.test(url);

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: isLocal ? false : "require",
  },
});
