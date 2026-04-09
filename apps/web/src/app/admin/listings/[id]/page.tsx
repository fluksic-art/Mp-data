import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { properties, sources, propertyImages } from "@mpgenesis/database";
import { eq } from "drizzle-orm";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const [listing] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);

  if (!listing) {
    notFound();
  }

  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, listing.sourceId))
    .limit(1);

  const images = await db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, id))
    .orderBy(propertyImages.position);

  return (
    <div>
      <Link
        href="/admin/listings"
        className="text-sm text-blue-600 hover:underline"
      >
        &larr; Back to listings
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{listing.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {listing.propertyType} / {listing.listingType} &middot;{" "}
            {listing.city}, {listing.state}
          </p>
        </div>
        <StatusBadge status={listing.status} />
      </div>

      {/* Facts grid — P1: all from typed DB columns, never LLM */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact
          label="Price"
          value={
            listing.priceCents
              ? `$${(listing.priceCents / 100).toLocaleString()} ${listing.currency}`
              : null
          }
        />
        <Fact
          label="Bedrooms"
          value={listing.bedrooms != null ? String(listing.bedrooms) : null}
        />
        <Fact
          label="Bathrooms"
          value={listing.bathrooms != null ? String(listing.bathrooms) : null}
        />
        <Fact
          label="Construction"
          value={
            listing.constructionM2 != null
              ? `${listing.constructionM2} m²`
              : null
          }
        />
        <Fact
          label="Land"
          value={listing.landM2 != null ? `${listing.landM2} m²` : null}
        />
        <Fact
          label="Parking"
          value={
            listing.parkingSpaces != null
              ? String(listing.parkingSpaces)
              : null
          }
        />
        <Fact label="Source" value={source?.domain ?? null} />
        <Fact
          label="First seen"
          value={listing.firstSeenAt.toLocaleDateString()}
        />
      </div>

      {/* Source URL */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-500">Source URL</h2>
        <a
          href={listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 text-sm text-blue-600 hover:underline"
        >
          {listing.sourceUrl}
        </a>
      </div>

      {/* Images */}
      {images.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-500">
            Images ({images.length})
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="aspect-video overflow-hidden rounded-md border bg-gray-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.cleanUrl ?? img.rawUrl ?? img.originalUrl}
                  alt={img.altText ?? `Image ${img.position}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw data */}
      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-500">Extracted Data</h2>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-gray-50 p-4 text-xs">
          {JSON.stringify(listing.extractedData, null, 2)}
        </pre>
      </div>

      <div className="mt-4">
        <h2 className="text-sm font-medium text-gray-500">Raw Data</h2>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-gray-50 p-4 text-xs">
          {JSON.stringify(listing.rawData, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value ?? "—"}</p>
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
      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status}
    </span>
  );
}
