import { getDb } from "@/lib/db";
import { properties, sources, crawlRuns } from "@mpgenesis/database";
import { count } from "drizzle-orm";

export default async function AdminDashboard() {
  const db = getDb();

  const [propertyCount] = await db.select({ value: count() }).from(properties);
  const [sourceCount] = await db.select({ value: count() }).from(sources);
  const [crawlCount] = await db.select({ value: count() }).from(crawlRuns);

  const stats = [
    { label: "Properties", value: propertyCount?.value ?? 0, href: "/admin/listings" },
    { label: "Sources", value: sourceCount?.value ?? 0 },
    { label: "Crawl Runs", value: crawlCount?.value ?? 0 },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="mt-6 grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
