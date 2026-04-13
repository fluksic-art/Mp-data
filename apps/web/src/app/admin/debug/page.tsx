import { getDb } from "@/lib/db";
import { properties, sources, propertyImages } from "@mpgenesis/database";
import { count, desc, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const results: Record<string, string> = {};
  const db = getDb();

  // Step 1: basic count
  try {
    const [r] = await db.select({ value: count() }).from(properties);
    results["1_property_count"] = String(r?.value ?? 0);
  } catch (e) {
    results["1_property_count_error"] = e instanceof Error ? e.message : String(e);
  }

  // Step 2: distinct cities
  try {
    const cities = await db.selectDistinct({ city: properties.city }).from(properties).orderBy(asc(properties.city));
    results["2_cities"] = String(cities.length);
  } catch (e) {
    results["2_cities_error"] = e instanceof Error ? e.message : String(e);
  }

  // Step 3: distinct statuses
  try {
    const statuses = await db.selectDistinct({ status: properties.status }).from(properties);
    results["3_statuses"] = JSON.stringify(statuses.map(s => s.status));
  } catch (e) {
    results["3_statuses_error"] = e instanceof Error ? e.message : String(e);
  }

  // Step 4: distinct listing types
  try {
    const lt = await db.selectDistinct({ listingType: properties.listingType }).from(properties);
    results["4_listingTypes"] = JSON.stringify(lt.map(t => t.listingType));
  } catch (e) {
    results["4_listingTypes_error"] = e instanceof Error ? e.message : String(e);
  }

  // Step 5: sources
  try {
    const src = await db.selectDistinct({ domain: sources.domain }).from(sources);
    results["5_sources"] = JSON.stringify(src.map(s => s.domain));
  } catch (e) {
    results["5_sources_error"] = e instanceof Error ? e.message : String(e);
  }

  // Step 6: image count subquery
  try {
    const imageCountSq = db
      .select({
        propertyId: propertyImages.propertyId,
        imageCount: count().as("image_count"),
      })
      .from(propertyImages)
      .groupBy(propertyImages.propertyId)
      .as("img_counts");

    const listings = await db
      .select({
        id: properties.id,
        title: properties.title,
        sourceDomain: sources.domain,
        imageCount: imageCountSq.imageCount,
      })
      .from(properties)
      .leftJoin(sources, eq(properties.sourceId, sources.id))
      .leftJoin(imageCountSq, eq(properties.id, imageCountSq.propertyId))
      .orderBy(desc(properties.firstSeenAt))
      .limit(5);

    results["6_main_query"] = `OK - ${listings.length} rows`;
    results["6_first_title"] = listings[0]?.title?.slice(0, 50) ?? "none";
  } catch (e) {
    results["6_main_query_error"] = e instanceof Error ? e.message : String(e);
    results["6_main_query_stack"] = e instanceof Error ? (e.stack ?? "").slice(0, 500) : "";
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Debug — Query Tests</h1>
      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto whitespace-pre-wrap">
        {JSON.stringify(results, null, 2)}
      </pre>
    </div>
  );
}
