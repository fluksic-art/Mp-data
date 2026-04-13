import { getDb } from "@/lib/db";
import { properties } from "@mpgenesis/database";
import { count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const results: Record<string, string> = {};

  // Check env vars
  results["DATABASE_URL set"] = process.env["DATABASE_URL"] ? "yes" : "NO";
  results["DATABASE_URL host"] = (() => {
    try {
      const url = new URL(process.env["DATABASE_URL"] ?? "");
      return `${url.hostname}:${url.port}`;
    } catch {
      return "invalid URL";
    }
  })();
  results["ADMIN_PASSWORD set"] = process.env["ADMIN_PASSWORD"] ? "yes" : "NO";

  // Test DB connection
  try {
    const db = getDb();
    const [result] = await db.select({ value: count() }).from(properties);
    results["DB connection"] = "OK";
    results["Property count"] = String(result?.value ?? 0);
  } catch (e) {
    results["DB connection"] = "FAILED";
    results["DB error"] = e instanceof Error ? e.message : String(e);
    results["DB stack"] = e instanceof Error ? (e.stack ?? "").slice(0, 500) : "";
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Debug</h1>
      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
        {JSON.stringify(results, null, 2)}
      </pre>
    </div>
  );
}
