import Link from "next/link";
import { getDb } from "@/lib/db";
import { properties, sources } from "@mpgenesis/database";
import { desc, eq } from "drizzle-orm";

export default async function ListingsPage() {
  const db = getDb();

  const listings = await db
    .select({
      id: properties.id,
      title: properties.title,
      propertyType: properties.propertyType,
      listingType: properties.listingType,
      priceCents: properties.priceCents,
      currency: properties.currency,
      city: properties.city,
      state: properties.state,
      status: properties.status,
      sourceDomain: sources.domain,
      firstSeenAt: properties.firstSeenAt,
    })
    .from(properties)
    .leftJoin(sources, eq(properties.sourceId, sources.id))
    .orderBy(desc(properties.firstSeenAt))
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold">Listings</h1>
      <p className="mt-1 text-sm text-gray-500">
        {listings.length} properties found
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Price
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Location
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {listings.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  No listings yet. Run{" "}
                  <code className="rounded bg-gray-100 px-1 py-0.5">
                    pnpm crawl &lt;domain&gt;
                  </code>{" "}
                  to start.
                </td>
              </tr>
            ) : (
              listings.map((listing) => (
                <tr key={listing.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/listings/${listing.id}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {listing.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {listing.propertyType} / {listing.listingType}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {listing.priceCents
                      ? `${(listing.priceCents / 100).toLocaleString()} ${listing.currency}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {listing.city}, {listing.state}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {listing.sourceDomain ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={listing.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    review: "bg-yellow-100 text-yellow-700",
    published: "bg-green-100 text-green-700",
    archived: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status}
    </span>
  );
}
