import { getDb } from "@/lib/db";
import {
  properties,
  leads,
  sources,
  propertyChanges,
  amenities,
  propertyAmenities,
} from "@mpgenesis/database";
import { sql } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatsFilters } from "./stats-filters";
import {
  HorizontalBarChart,
  GroupedBarChart,
  StackedBarChart,
  HistogramChart,
  DonutChart,
  PriceChangeChart,
  StackedAreaChart,
  PriceRangeBarChart,
} from "./charts";
import type { SQL } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    currency?: string;
    city?: string;
    type?: string;
    listingType?: string;
    status?: string;
  }>;
};

export default async function EstadisticasPage({ searchParams }: Props) {
  const params = await searchParams;
  const currency = params.currency === "USD" ? "USD" : "MXN";
  const cityFilter = params.city?.trim() || undefined;
  const typeFilter = params.type?.trim() || undefined;
  const listingFilter = params.listingType?.trim() || undefined;
  const statusFilter = params.status?.trim() || undefined; // "published" | "all" | undefined(=active)
  const db = getDb();

  // Dropdown options (unfiltered - always show all cities/types available)
  const citiesResult = await db.execute<{ city: string }>(sql`
    SELECT DISTINCT city FROM properties
    WHERE status NOT IN ('archived', 'possible_duplicate')
      AND city IS NOT NULL AND TRIM(city) != ''
    ORDER BY city
  `);
  const propertyTypesResult = await db.execute<{ property_type: string }>(sql`
    SELECT DISTINCT property_type FROM properties
    WHERE status NOT IN ('archived', 'possible_duplicate')
    ORDER BY property_type
  `);
  const cityOptions = citiesResult.map((r) => r.city);
  const propertyTypeOptions = propertyTypesResult.map((r) => r.property_type);

  // Build a WHERE-clause SQL fragment based on active filters.
  // Allows skipping specific filters when a chart displays that dimension
  // (e.g. skip city filter for the "by city" chart so it still shows context).
  function buildFilter(opts: {
    prefix?: string;
    skipCity?: boolean;
    skipType?: boolean;
    skipListing?: boolean;
    skipStatus?: boolean;
  } = {}): SQL {
    const p = opts.prefix ? `${opts.prefix}.` : "";
    const parts: SQL[] = [];

    if (!opts.skipStatus) {
      if (statusFilter === "published") {
        parts.push(sql.raw(`${p}status = 'published'`));
      } else if (statusFilter !== "all") {
        parts.push(sql.raw(`${p}status NOT IN ('archived', 'possible_duplicate')`));
      }
    }
    if (cityFilter && !opts.skipCity) {
      parts.push(sql`${sql.raw(`${p}city`)} = ${cityFilter}`);
    }
    if (typeFilter && !opts.skipType) {
      parts.push(sql`${sql.raw(`${p}property_type`)} = ${typeFilter}`);
    }
    if (listingFilter && !opts.skipListing) {
      parts.push(sql`${sql.raw(`${p}listing_type`)} = ${listingFilter}`);
    }
    if (parts.length === 0) return sql`TRUE`;
    let combined = parts[0]!;
    for (let i = 1; i < parts.length; i++) {
      combined = sql`${combined} AND ${parts[i]}`;
    }
    return combined;
  }

  const ACTIVE_STATUS_FILTER = buildFilter();
  const FILTER_NO_CITY = buildFilter({ skipCity: true });
  const FILTER_NO_TYPE = buildFilter({ skipType: true });
  const FILTER_NO_LISTING = buildFilter({ skipListing: true });
  // For price analyses: use listingFilter if set, otherwise default to 'sale'.
  // These filters skip listing (handled separately below) and optionally city/type.
  const effectiveListing = listingFilter ?? "sale";
  const FILTER_PRICE = buildFilter({ skipListing: true });
  const FILTER_PRICE_NO_CITY = buildFilter({ skipCity: true, skipListing: true });
  const FILTER_PRICE_NO_TYPE = buildFilter({ skipType: true, skipListing: true });
  const FILTER_P = buildFilter({ prefix: "p" });
  const hasPropertyFilters = Boolean(cityFilter || typeFilter || listingFilter);

  // ─────────────────────────────────────────────────────────
  // SECTION 1: Radiografia del Mercado
  // ─────────────────────────────────────────────────────────
  const [totalActive] = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM properties
    WHERE ${ACTIVE_STATUS_FILTER}
  `);

  const [medianPrice] = await db.execute<{ median: number | null; priced_count: number }>(sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) AS median,
      COUNT(*)::int AS priced_count
    FROM properties
    WHERE ${FILTER_PRICE}
      AND price_cents IS NOT NULL
      AND currency = ${currency}
      AND listing_type = ${effectiveListing}
  `);

  const [newLast30] = await db.execute<{ count: number; prev: number }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE first_seen_at >= NOW() - INTERVAL '30 days')::int AS count,
      COUNT(*) FILTER (WHERE first_seen_at >= NOW() - INTERVAL '60 days' AND first_seen_at < NOW() - INTERVAL '30 days')::int AS prev
    FROM properties
    WHERE ${ACTIVE_STATUS_FILTER}
  `);

  const [medianPricePerM2] = await db.execute<{ median: number | null }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents::numeric / construction_m2) AS median
    FROM properties
    WHERE ${FILTER_PRICE}
      AND price_cents IS NOT NULL
      AND construction_m2 IS NOT NULL
      AND construction_m2 > 0
      AND currency = ${currency}
      AND listing_type = ${effectiveListing}
  `);

  const inventoryByListingType = await db.execute<{
    listing_type: string;
    property_type: string;
    count: number;
  }>(sql`
    SELECT listing_type, property_type, COUNT(*)::int AS count
    FROM properties
    WHERE ${FILTER_NO_LISTING}
    GROUP BY listing_type, property_type
    ORDER BY listing_type, count DESC
  `);

  const propertiesByCity = await db.execute<{ city: string; count: number }>(sql`
    SELECT city, COUNT(*)::int AS count
    FROM properties
    WHERE ${FILTER_NO_CITY}
    GROUP BY city
    ORDER BY count DESC
    LIMIT 15
  `);

  // ─────────────────────────────────────────────────────────
  // SECTION 2: Inteligencia de Precios
  // ─────────────────────────────────────────────────────────
  const priceDistByType = await db.execute<{
    property_type: string;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    count: number;
  }>(sql`
    SELECT
      property_type,
      percentile_cont(0.0) WITHIN GROUP (ORDER BY price_cents)::bigint AS min,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY price_cents)::bigint AS q1,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents)::bigint AS median,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY price_cents)::bigint AS q3,
      percentile_cont(1.0) WITHIN GROUP (ORDER BY price_cents)::bigint AS max,
      COUNT(*)::int AS count
    FROM properties
    WHERE ${FILTER_PRICE_NO_TYPE}
      AND price_cents IS NOT NULL
      AND currency = ${currency}
      AND listing_type = ${effectiveListing}
    GROUP BY property_type
    HAVING COUNT(*) >= 3
    ORDER BY median DESC
  `);

  const pricePerM2ByCity = await db.execute<{
    city: string;
    median_m2: number;
    count: number;
  }>(sql`
    SELECT
      city,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents::numeric / construction_m2)::bigint AS median_m2,
      COUNT(*)::int AS count
    FROM properties
    WHERE ${FILTER_PRICE_NO_CITY}
      AND price_cents IS NOT NULL
      AND construction_m2 IS NOT NULL
      AND construction_m2 > 0
      AND currency = ${currency}
      AND listing_type = ${effectiveListing}
    GROUP BY city
    HAVING COUNT(*) >= 5
    ORDER BY median_m2 DESC
    LIMIT 15
  `);

  const pricePerM2ByNeighborhood = await db.execute<{
    neighborhood: string;
    city: string;
    median_m2: number;
    count: number;
  }>(sql`
    SELECT
      neighborhood,
      city,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents::numeric / construction_m2)::bigint AS median_m2,
      COUNT(*)::int AS count
    FROM properties
    WHERE ${FILTER_PRICE}
      AND price_cents IS NOT NULL
      AND construction_m2 IS NOT NULL
      AND construction_m2 > 0
      AND currency = ${currency}
      AND listing_type = ${effectiveListing}
      AND neighborhood IS NOT NULL
      AND neighborhood != ''
    GROUP BY neighborhood, city
    HAVING COUNT(*) >= 3
    ORDER BY median_m2 DESC
  `);

  const priceChanges = await db.execute<{
    week: string;
    increases: number;
    decreases: number;
    avg_pct: number | null;
  }>(sql`
    SELECT
      to_char(date_trunc('week', detected_at), 'YYYY-MM-DD') AS week,
      COUNT(*) FILTER (WHERE (new_value::text)::bigint > (old_value::text)::bigint)::int AS increases,
      COUNT(*) FILTER (WHERE (new_value::text)::bigint < (old_value::text)::bigint)::int AS decreases,
      AVG(
        CASE WHEN (old_value::text)::bigint > 0
        THEN (((new_value::text)::bigint - (old_value::text)::bigint)::float / (old_value::text)::bigint) * 100
        END
      ) AS avg_pct
    FROM property_changes
    WHERE field_name = 'price_cents'
      AND old_value IS NOT NULL
      AND new_value IS NOT NULL
      AND detected_at >= NOW() - INTERVAL '6 months'
    GROUP BY week
    ORDER BY week
  `);

  // ─────────────────────────────────────────────────────────
  // SECTION 3: Analisis de Oferta
  // ─────────────────────────────────────────────────────────
  const typeDistribution = await db.execute<{ property_type: string; count: number }>(sql`
    SELECT property_type, COUNT(*)::int AS count
    FROM properties
    WHERE ${FILTER_NO_TYPE}
    GROUP BY property_type
    ORDER BY count DESC
  `);

  const bedroomsByType = await db.execute<{
    property_type: string;
    bedrooms: number;
    count: number;
  }>(sql`
    SELECT property_type, bedrooms, COUNT(*)::int AS count
    FROM properties
    WHERE ${FILTER_NO_TYPE}
      AND bedrooms IS NOT NULL
      AND bedrooms BETWEEN 0 AND 8
      AND property_type IN ('apartment', 'house', 'villa', 'penthouse')
    GROUP BY property_type, bedrooms
    ORDER BY property_type, bedrooms
  `);

  const sizeDistribution = await db.execute<{ bucket: string; count: number }>(sql`
    SELECT
      CASE
        WHEN construction_m2 < 50 THEN '0-50'
        WHEN construction_m2 < 100 THEN '50-100'
        WHEN construction_m2 < 150 THEN '100-150'
        WHEN construction_m2 < 200 THEN '150-200'
        WHEN construction_m2 < 300 THEN '200-300'
        WHEN construction_m2 < 500 THEN '300-500'
        ELSE '500+'
      END AS bucket,
      COUNT(*)::int AS count
    FROM properties
    WHERE ${ACTIVE_STATUS_FILTER}
      AND construction_m2 IS NOT NULL
      AND construction_m2 > 0
      AND construction_m2 < 5000
    GROUP BY bucket
    ORDER BY MIN(construction_m2)
  `);

  const topAmenities = await db.execute<{
    name_es: string;
    category: string | null;
    count: number;
  }>(sql`
    SELECT a.name_es, a.category, COUNT(pa.property_id)::int AS count
    FROM amenities a
    JOIN property_amenities pa ON pa.amenity_id = a.id
    JOIN properties p ON p.id = pa.property_id
    WHERE ${FILTER_P}
    GROUP BY a.id, a.name_es, a.category
    ORDER BY count DESC
    LIMIT 20
  `);

  // ─────────────────────────────────────────────────────────
  // SECTION 4: Inteligencia de Desarrolladores (INTERNAL)
  // ─────────────────────────────────────────────────────────
  const topDevelopers = await db.execute<{
    developer_name: string;
    total_listings: number;
    presale_count: number;
    sale_count: number;
    median_price: number | null;
  }>(sql`
    SELECT
      MAX(developer_name) AS developer_name,
      COUNT(*)::int AS total_listings,
      COUNT(*) FILTER (WHERE listing_type = 'presale')::int AS presale_count,
      COUNT(*) FILTER (WHERE listing_type = 'sale')::int AS sale_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) FILTER (WHERE price_cents IS NOT NULL)::bigint AS median_price
    FROM properties
    WHERE ${ACTIVE_STATUS_FILTER}
      AND developer_name IS NOT NULL
      AND TRIM(developer_name) != ''
    GROUP BY lower(trim(developer_name))
    ORDER BY total_listings DESC
    LIMIT 25
  `);

  const topDevelopments = await db.execute<{
    development_name: string;
    developer_name: string | null;
    city: string;
    units: number;
    min_price: number | null;
    max_price: number | null;
    median_price: number | null;
  }>(sql`
    SELECT
      MAX(development_name) AS development_name,
      MAX(developer_name) AS developer_name,
      MAX(city) AS city,
      COUNT(*)::int AS units,
      MIN(price_cents) FILTER (WHERE price_cents IS NOT NULL)::bigint AS min_price,
      MAX(price_cents) FILTER (WHERE price_cents IS NOT NULL)::bigint AS max_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) FILTER (WHERE price_cents IS NOT NULL)::bigint AS median_price
    FROM properties
    WHERE ${ACTIVE_STATUS_FILTER}
      AND development_name IS NOT NULL
      AND TRIM(development_name) != ''
    GROUP BY lower(trim(development_name))
    ORDER BY units DESC
    LIMIT 30
  `);

  const [developerConcentration] = await db.execute<{
    unique_developers: number;
    top5_share_pct: number;
    total_with_dev: number;
  }>(sql`
    WITH dev_counts AS (
      SELECT lower(trim(developer_name)) AS dev, COUNT(*)::int AS c
      FROM properties
      WHERE ${ACTIVE_STATUS_FILTER}
        AND developer_name IS NOT NULL
        AND TRIM(developer_name) != ''
      GROUP BY lower(trim(developer_name))
    ),
    ranked AS (
      SELECT dev, c, ROW_NUMBER() OVER (ORDER BY c DESC) AS rn
      FROM dev_counts
    )
    SELECT
      (SELECT COUNT(*)::int FROM dev_counts) AS unique_developers,
      ROUND(
        100.0 * SUM(c) FILTER (WHERE rn <= 5)::numeric / NULLIF(SUM(c), 0),
        1
      )::float AS top5_share_pct,
      SUM(c)::int AS total_with_dev
    FROM ranked
  `);

  // ─────────────────────────────────────────────────────────
  // SECTION 5: Distribucion Geografica
  // ─────────────────────────────────────────────────────────
  const cityBreakdown = await db.execute<{
    city: string;
    total: number;
    presale_pct: number;
    rent_pct: number;
    median_price_mxn: number | null;
    median_m2_price_mxn: number | null;
    dominant_type: string;
  }>(sql`
    SELECT
      city,
      COUNT(*)::int AS total,
      ROUND(100.0 * COUNT(*) FILTER (WHERE listing_type = 'presale')::numeric / NULLIF(COUNT(*), 0), 1)::float AS presale_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE listing_type = 'rent')::numeric / NULLIF(COUNT(*), 0), 1)::float AS rent_pct,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents)
        FILTER (WHERE price_cents IS NOT NULL AND currency = 'MXN' AND listing_type = 'sale')::bigint AS median_price_mxn,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents::numeric / construction_m2)
        FILTER (WHERE price_cents IS NOT NULL AND construction_m2 > 0 AND currency = 'MXN' AND listing_type = 'sale')::bigint AS median_m2_price_mxn,
      mode() WITHIN GROUP (ORDER BY property_type) AS dominant_type
    FROM properties
    WHERE ${FILTER_NO_CITY}
    GROUP BY city
    ORDER BY total DESC
    LIMIT 20
  `);

  const neighborhoodBreakdown = await db.execute<{
    city: string;
    neighborhood: string;
    total: number;
    median_price: number | null;
  }>(sql`
    SELECT
      city,
      neighborhood,
      COUNT(*)::int AS total,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents)
        FILTER (WHERE price_cents IS NOT NULL AND currency = ${currency} AND listing_type = 'sale')::bigint AS median_price
    FROM properties
    WHERE ${ACTIVE_STATUS_FILTER}
      AND neighborhood IS NOT NULL
      AND TRIM(neighborhood) != ''
    GROUP BY city, neighborhood
    HAVING COUNT(*) >= 2
    ORDER BY city, total DESC
  `);

  // ─────────────────────────────────────────────────────────
  // SECTION 6: Rendimiento de Leads
  // ─────────────────────────────────────────────────────────
  const leadsOverTime = await db.execute<{
    week: string;
    whatsapp: number;
    form: number;
    phone: number;
    other: number;
  }>(sql`
    SELECT
      to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
      COUNT(*) FILTER (WHERE source = 'whatsapp_cta')::int AS whatsapp,
      COUNT(*) FILTER (WHERE source = 'contact_form')::int AS form,
      COUNT(*) FILTER (WHERE source = 'phone_click')::int AS phone,
      COUNT(*) FILTER (WHERE source NOT IN ('whatsapp_cta', 'contact_form', 'phone_click'))::int AS other
    FROM leads l
    ${hasPropertyFilters ? sql`INNER JOIN properties p ON p.id = l.property_id` : sql``}
    WHERE created_at >= NOW() - INTERVAL '12 weeks'
    ${hasPropertyFilters ? sql`AND ${buildFilter({ prefix: "p", skipStatus: true })}` : sql``}
    GROUP BY week
    ORDER BY week
  `);

  const leadConversion = await db.execute<{
    property_type: string;
    city: string;
    published_listings: number;
    total_leads: number;
    leads_per_listing: number;
  }>(sql`
    SELECT
      p.property_type,
      p.city,
      COUNT(DISTINCT p.id)::int AS published_listings,
      COUNT(l.id)::int AS total_leads,
      ROUND(COUNT(l.id)::numeric / NULLIF(COUNT(DISTINCT p.id), 0), 3)::float AS leads_per_listing
    FROM properties p
    LEFT JOIN leads l ON l.property_id = p.id
    WHERE p.status = 'published'
      AND ${buildFilter({ prefix: "p", skipStatus: true })}
    GROUP BY p.property_type, p.city
    HAVING COUNT(DISTINCT p.id) >= 3
    ORDER BY leads_per_listing DESC NULLS LAST
    LIMIT 20
  `);

  const leadsByLocale = await db.execute<{ locale: string; count: number }>(sql`
    SELECT locale, COUNT(*)::int AS count
    FROM leads l
    ${hasPropertyFilters ? sql`INNER JOIN properties p ON p.id = l.property_id WHERE ${buildFilter({ prefix: "p", skipStatus: true })}` : sql``}
    GROUP BY locale
    ORDER BY count DESC
  `);

  const [totalLeadsCount] = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM leads l
    ${hasPropertyFilters ? sql`INNER JOIN properties p ON p.id = l.property_id WHERE ${buildFilter({ prefix: "p", skipStatus: true })}` : sql``}
  `);

  // ─────────────────────────────────────────────────────────
  // SECTION 7: Salud de Datos
  // ─────────────────────────────────────────────────────────
  const [completeness] = await db.execute<{
    total: number;
    pct_price: number;
    pct_m2: number;
    pct_bedrooms: number;
    pct_neighborhood: number;
    pct_developer: number;
    pct_coords: number;
  }>(sql`
    SELECT
      COUNT(*)::int AS total,
      ROUND(100.0 * COUNT(price_cents)::numeric / NULLIF(COUNT(*), 0), 1)::float AS pct_price,
      ROUND(100.0 * COUNT(construction_m2) FILTER (WHERE construction_m2 > 0)::numeric / NULLIF(COUNT(*), 0), 1)::float AS pct_m2,
      ROUND(100.0 * COUNT(bedrooms)::numeric / NULLIF(COUNT(*), 0), 1)::float AS pct_bedrooms,
      ROUND(100.0 * COUNT(neighborhood) FILTER (WHERE neighborhood IS NOT NULL AND TRIM(neighborhood) != '')::numeric / NULLIF(COUNT(*), 0), 1)::float AS pct_neighborhood,
      ROUND(100.0 * COUNT(developer_name) FILTER (WHERE developer_name IS NOT NULL AND TRIM(developer_name) != '')::numeric / NULLIF(COUNT(*), 0), 1)::float AS pct_developer,
      ROUND(100.0 * COUNT(latitude)::numeric / NULLIF(COUNT(*), 0), 1)::float AS pct_coords
    FROM properties
    WHERE ${ACTIVE_STATUS_FILTER}
  `);

  const sourceCoverage = await db.execute<{
    domain: string;
    name: string;
    status: string;
    last_crawled_at: Date | null;
    total: number;
    with_price: number;
    with_m2: number;
    with_developer: number;
  }>(sql`
    SELECT
      s.domain,
      s.name,
      s.status,
      s.last_crawled_at,
      COUNT(p.id)::int AS total,
      COUNT(p.price_cents)::int AS with_price,
      COUNT(p.construction_m2) FILTER (WHERE p.construction_m2 > 0)::int AS with_m2,
      COUNT(p.developer_name) FILTER (WHERE p.developer_name IS NOT NULL AND TRIM(p.developer_name) != '')::int AS with_developer
    FROM sources s
    LEFT JOIN properties p ON p.source_id = s.id AND ${FILTER_P}
    GROUP BY s.id
    ORDER BY total DESC
  `);

  const freshness = await db.execute<{
    month: string;
    new_listings: number;
    archived_count: number;
  }>(sql`
    SELECT
      to_char(date_trunc('month', first_seen_at), 'YYYY-MM') AS month,
      COUNT(*)::int AS new_listings,
      COUNT(*) FILTER (WHERE status = 'archived')::int AS archived_count
    FROM properties
    WHERE first_seen_at >= NOW() - INTERVAL '12 months'
      AND ${buildFilter({ skipStatus: true })}
    GROUP BY month
    ORDER BY month
  `);

  // ─────────────────────────────────────────────────────────
  // Transform data for charts
  // ─────────────────────────────────────────────────────────
  const currencySymbol = currency === "MXN" ? "$" : "US$";

  const listingTypeMap: Record<string, Record<string, number>> = {};
  for (const row of inventoryByListingType) {
    const lt = row.listing_type;
    if (!listingTypeMap[lt]) listingTypeMap[lt] = { listingType: 0 as unknown as number };
    listingTypeMap[lt][row.property_type] = row.count;
  }
  const listingTypeChartData = Object.entries(listingTypeMap).map(([lt, types]) => ({
    listingType: translateListingType(lt),
    ...types,
  }));
  const propertyTypeKeys = Array.from(
    new Set(inventoryByListingType.map((r) => r.property_type)),
  );

  const bedroomsMap: Record<string, Record<string, number | string>> = {};
  for (const row of bedroomsByType) {
    const key = `${row.bedrooms} rec`;
    if (!bedroomsMap[key]) bedroomsMap[key] = { bedrooms: key };
    bedroomsMap[key][row.property_type] = row.count;
  }
  const bedroomsChartData = Object.values(bedroomsMap);
  const bedroomsTypes = Array.from(
    new Set(bedroomsByType.map((r) => r.property_type)),
  );

  const topNeighborhoods = pricePerM2ByNeighborhood.slice(0, 15);
  const bottomNeighborhoods = [...pricePerM2ByNeighborhood].reverse().slice(0, 15);

  // Group neighborhoods by city for expandable table
  type NeighborhoodRow = { city: string; neighborhood: string; total: number; median_price: number | null };
  const neighborhoodsByCity: Record<string, NeighborhoodRow[]> = {};
  for (const row of neighborhoodBreakdown) {
    if (!neighborhoodsByCity[row.city]) neighborhoodsByCity[row.city] = [];
    neighborhoodsByCity[row.city]!.push(row);
  }

  // Price change delta vs prev period
  const newCount = newLast30?.count ?? 0;
  const prevCount = newLast30?.prev ?? 0;
  const deltaPct = prevCount > 0 ? Math.round(((newCount - prevCount) / prevCount) * 100) : null;

  const hasActiveFilters = Boolean(cityFilter || typeFilter || listingFilter || statusFilter);

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estadisticas de Mercado</h1>
          <p className="text-sm text-muted-foreground">
            Inteligencia de mercado inmobiliario — {totalActive?.count ?? 0} propiedades
            {hasActiveFilters && " (filtradas)"}
          </p>
        </div>
        <StatsFilters
          cities={cityOptions}
          propertyTypes={propertyTypeOptions}
          current={{
            currency,
            city: cityFilter,
            propertyType: typeFilter,
            listingType: listingFilter,
            status: statusFilter,
          }}
        />
      </div>

      {/* ─────────────────────────────────────────────────────
          SECTION 1: Radiografia del Mercado
      ───────────────────────────────────────────────────── */}
      <Section
        title="Radiografia del Mercado"
        subtitle="Snapshot general del inventario activo"
      >
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Listings activos"
            value={(totalActive?.count ?? 0).toLocaleString()}
          />
          <StatCard
            label={`Precio mediano (${currency})`}
            value={
              medianPrice?.median
                ? `${currencySymbol}${formatPrice(Number(medianPrice.median))}`
                : "—"
            }
            sub={`${medianPrice?.priced_count ?? 0} venta`}
          />
          <StatCard
            label="Nuevos (30d)"
            value={newCount.toLocaleString()}
            sub={
              deltaPct === null
                ? undefined
                : `${deltaPct >= 0 ? "+" : ""}${deltaPct}% vs 30d prev`
            }
          />
          <StatCard
            label={`Precio/m2 mediano (${currency})`}
            value={
              medianPricePerM2?.median
                ? `${currencySymbol}${formatPrice(Number(medianPricePerM2.median))}`
                : "—"
            }
            sub="sobre construccion"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Inventario por tipo de listado</CardTitle>
            </CardHeader>
            <CardContent>
              {listingTypeChartData.length > 0 ? (
                <GroupedBarChart
                  data={listingTypeChartData}
                  keys={propertyTypeKeys}
                  labelKey="listingType"
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Propiedades por ciudad (top 15)</CardTitle>
            </CardHeader>
            <CardContent>
              {propertiesByCity.length > 0 ? (
                <HorizontalBarChart
                  data={propertiesByCity}
                  dataKey="count"
                  labelKey="city"
                  height={350}
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ─────────────────────────────────────────────────────
          SECTION 2: Inteligencia de Precios
      ───────────────────────────────────────────────────── */}
      <Section
        title="Inteligencia de Precios"
        subtitle={`Analisis de precios en ${currency} — solo ventas`}
      >
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Distribucion de precios por tipo</CardTitle>
              <p className="text-xs text-muted-foreground">Rango intercuartilico (Q1-Q3)</p>
            </CardHeader>
            <CardContent>
              {priceDistByType.length > 0 ? (
                <>
                  <PriceRangeBarChart
                    data={priceDistByType.map((r) => ({
                      type: r.property_type,
                      min: Number(r.min),
                      q1: Number(r.q1),
                      median: Number(r.median),
                      q3: Number(r.q3),
                      max: Number(r.max),
                    }))}
                  />
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Medianas:{" "}
                    {priceDistByType.map((r, i) => (
                      <span key={r.property_type}>
                        {i > 0 && " · "}
                        <span className="font-medium text-foreground">{r.property_type}</span>{" "}
                        {currencySymbol}
                        {formatPrice(Number(r.median))}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Precio/m2 mediano por ciudad</CardTitle>
              <p className="text-xs text-muted-foreground">Minimo 5 propiedades</p>
            </CardHeader>
            <CardContent>
              {pricePerM2ByCity.length > 0 ? (
                <HorizontalBarChart
                  data={pricePerM2ByCity.map((r) => ({
                    city: r.city,
                    "precio/m2": Math.round(Number(r.median_m2) / 100),
                  }))}
                  dataKey="precio/m2"
                  labelKey="city"
                  height={350}
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Precio/m2 por colonia</CardTitle>
            <p className="text-xs text-muted-foreground">Minimo 3 propiedades · izquierda: mas caras · derecha: mas accesibles</p>
          </CardHeader>
          <CardContent>
            {pricePerM2ByNeighborhood.length > 0 ? (
              <div className="grid grid-cols-2 gap-6">
                <NeighborhoodTable
                  title="Top 15 mas caras"
                  rows={topNeighborhoods}
                  currencySymbol={currencySymbol}
                />
                <NeighborhoodTable
                  title="Top 15 mas accesibles"
                  rows={bottomNeighborhoods}
                  currencySymbol={currencySymbol}
                />
              </div>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cambios de precio detectados</CardTitle>
            <p className="text-xs text-muted-foreground">Movimientos por semana (ultimos 6 meses)</p>
          </CardHeader>
          <CardContent>
            {priceChanges.length > 0 ? (
              <PriceChangeChart
                data={priceChanges.map((r) => ({
                  week: r.week,
                  increases: r.increases,
                  decreases: r.decreases,
                  avgPct: Number(r.avg_pct ?? 0),
                }))}
              />
            ) : (
              <EmptyState message="Sin historial de cambios de precio" />
            )}
          </CardContent>
        </Card>
      </Section>

      {/* ─────────────────────────────────────────────────────
          SECTION 3: Analisis de Oferta
      ───────────────────────────────────────────────────── */}
      <Section title="Analisis de Oferta" subtitle="Que se esta ofreciendo en el mercado">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Distribucion por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {typeDistribution.length > 0 ? (
                <DonutChart
                  data={typeDistribution}
                  dataKey="count"
                  labelKey="property_type"
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Recamaras por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {bedroomsChartData.length > 0 ? (
                <StackedBarChart
                  data={bedroomsChartData}
                  keys={bedroomsTypes}
                  labelKey="bedrooms"
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Distribucion de tamanos (m2)</CardTitle>
            </CardHeader>
            <CardContent>
              {sizeDistribution.length > 0 ? (
                <HistogramChart
                  data={sizeDistribution}
                  dataKey="count"
                  labelKey="bucket"
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top 20 amenidades</CardTitle>
            </CardHeader>
            <CardContent>
              {topAmenities.length > 0 ? (
                <HorizontalBarChart
                  data={topAmenities}
                  dataKey="count"
                  labelKey="name_es"
                  height={400}
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ─────────────────────────────────────────────────────
          SECTION 4: Inteligencia de Desarrolladores (INTERNAL)
      ───────────────────────────────────────────────────── */}
      <Section
        title="Inteligencia de Desarrolladores"
        subtitle="Solo uso interno — nombres anonimizados en publicacion"
        internal
      >
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard
            label="Desarrolladores unicos"
            value={(developerConcentration?.unique_developers ?? 0).toLocaleString()}
            sub={`${developerConcentration?.total_with_dev ?? 0} listings con desarrollador`}
          />
          <StatCard
            label="Market share top 5"
            value={
              developerConcentration?.top5_share_pct
                ? `${developerConcentration.top5_share_pct.toFixed(1)}%`
                : "—"
            }
            sub={
              developerConcentration?.top5_share_pct && developerConcentration.top5_share_pct > 50
                ? "mercado concentrado"
                : "mercado fragmentado"
            }
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 25 desarrolladores</CardTitle>
          </CardHeader>
          <CardContent>
            {topDevelopers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Desarrollador</TableHead>
                    <TableHead className="text-right">Listings</TableHead>
                    <TableHead className="text-right">Preventa</TableHead>
                    <TableHead className="text-right">Venta</TableHead>
                    <TableHead className="text-right">Precio mediano</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDevelopers.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.developer_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.total_listings}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {d.presale_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {d.sale_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.median_price ? `$${formatPrice(Number(d.median_price))}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 30 desarrollos</CardTitle>
          </CardHeader>
          <CardContent>
            {topDevelopments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Desarrollo</TableHead>
                    <TableHead>Desarrollador</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Rango precio</TableHead>
                    <TableHead className="text-right">Mediana</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDevelopments.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.development_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.developer_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{d.city}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.units}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {d.min_price && d.max_price
                          ? `$${formatPrice(Number(d.min_price))} – $${formatPrice(Number(d.max_price))}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.median_price ? `$${formatPrice(Number(d.median_price))}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </Section>

      {/* ─────────────────────────────────────────────────────
          SECTION 5: Distribucion Geografica
      ───────────────────────────────────────────────────── */}
      <Section title="Distribucion Geografica" subtitle="Analisis por ciudad y colonia">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Breakdown por ciudad</CardTitle>
            <p className="text-xs text-muted-foreground">Precios en MXN (solo venta)</p>
          </CardHeader>
          <CardContent>
            {cityBreakdown.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Preventa %</TableHead>
                    <TableHead className="text-right">Renta %</TableHead>
                    <TableHead className="text-right">Precio mediano</TableHead>
                    <TableHead className="text-right">Precio/m2</TableHead>
                    <TableHead>Tipo dominante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cityBreakdown.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.city}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={c.presale_pct > 40 ? "text-emerald-600 font-medium" : ""}>
                          {c.presale_pct?.toFixed(1) ?? "0.0"}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.rent_pct?.toFixed(1) ?? "0.0"}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.median_price_mxn ? `$${formatPrice(Number(c.median_price_mxn))}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.median_m2_price_mxn
                          ? `$${formatPrice(Math.round(Number(c.median_m2_price_mxn) / 100))}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {c.dominant_type}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ranking de colonias por ciudad</CardTitle>
            <p className="text-xs text-muted-foreground">Click para expandir</p>
          </CardHeader>
          <CardContent>
            {Object.keys(neighborhoodsByCity).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(neighborhoodsByCity).map(([city, rows]) => (
                  <details key={city} className="rounded-md border">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm hover:bg-muted/50">
                      <span className="font-medium">{city}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {rows.length} colonias · {rows.reduce((sum, r) => sum + r.total, 0)} propiedades
                      </span>
                    </summary>
                    <div className="border-t">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Colonia</TableHead>
                            <TableHead className="text-right">Propiedades</TableHead>
                            <TableHead className="text-right">Precio mediano ({currency})</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell>{r.neighborhood}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.median_price
                                  ? `${currencySymbol}${formatPrice(Number(r.median_price))}`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </Section>

      {/* ─────────────────────────────────────────────────────
          SECTION 6: Rendimiento de Leads
      ───────────────────────────────────────────────────── */}
      <Section
        title="Rendimiento de Leads"
        subtitle={`Total: ${totalLeadsCount?.count ?? 0} leads`}
      >
        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Volumen de leads (ultimas 12 semanas)</CardTitle>
            </CardHeader>
            <CardContent>
              {leadsOverTime.length > 0 ? (
                <StackedAreaChart
                  data={leadsOverTime}
                  keys={["whatsapp", "form", "phone", "other"]}
                  labelKey="week"
                />
              ) : (
                <EmptyState message="Sin leads en las ultimas 12 semanas" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Leads por idioma</CardTitle>
            </CardHeader>
            <CardContent>
              {leadsByLocale.length > 0 ? (
                <DonutChart
                  data={leadsByLocale}
                  dataKey="count"
                  labelKey="locale"
                />
              ) : (
                <EmptyState />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conversion por tipo y ciudad</CardTitle>
            <p className="text-xs text-muted-foreground">Minimo 3 listings publicados</p>
          </CardHeader>
          <CardContent>
            {leadConversion.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-right">Publicados</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Leads/listing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadConversion.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.property_type}</TableCell>
                      <TableCell>{r.city}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.published_listings}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_leads}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={
                            r.leads_per_listing > 0.5
                              ? "text-emerald-600 font-medium"
                              : r.leads_per_listing < 0.1
                                ? "text-muted-foreground"
                                : ""
                          }
                        >
                          {r.leads_per_listing?.toFixed(2) ?? "0.00"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState message="Aun no hay leads suficientes" />
            )}
          </CardContent>
        </Card>
      </Section>

      {/* ─────────────────────────────────────────────────────
          SECTION 7: Salud de Datos
      ───────────────────────────────────────────────────── */}
      <Section title="Salud de Datos" subtitle="Metricas operacionales del pipeline">
        <div className="grid grid-cols-3 gap-3">
          <CompletenessCard label="Con precio" value={completeness?.pct_price ?? 0} />
          <CompletenessCard label="Con m2" value={completeness?.pct_m2 ?? 0} />
          <CompletenessCard label="Con recamaras" value={completeness?.pct_bedrooms ?? 0} />
          <CompletenessCard label="Con colonia" value={completeness?.pct_neighborhood ?? 0} />
          <CompletenessCard label="Con desarrollador" value={completeness?.pct_developer ?? 0} />
          <CompletenessCard label="Con coordenadas" value={completeness?.pct_coords ?? 0} />
        </div>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cobertura por source</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceCoverage.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Properties</TableHead>
                    <TableHead className="text-right">% precio</TableHead>
                    <TableHead className="text-right">% m2</TableHead>
                    <TableHead className="text-right">% developer</TableHead>
                    <TableHead>Ultimo crawl</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceCoverage.map((s, i) => {
                    const lastCrawl = s.last_crawled_at ? new Date(s.last_crawled_at) : null;
                    const daysAgo = lastCrawl
                      ? Math.floor((Date.now() - lastCrawl.getTime()) / (1000 * 60 * 60 * 24))
                      : null;
                    const pctPrice = s.total > 0 ? (s.with_price / s.total) * 100 : 0;
                    const pctM2 = s.total > 0 ? (s.with_m2 / s.total) * 100 : 0;
                    const pctDev = s.total > 0 ? (s.with_developer / s.total) * 100 : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{s.domain}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{pctPrice.toFixed(0)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{pctM2.toFixed(0)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{pctDev.toFixed(0)}%</TableCell>
                        <TableCell>
                          {daysAgo === null ? (
                            <span className="text-muted-foreground">nunca</span>
                          ) : (
                            <span className={daysAgo > 7 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                              {daysAgo === 0 ? "hoy" : `hace ${daysAgo}d`}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Frescura del inventario (ultimos 12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            {freshness.length > 0 ? (
              <GroupedBarChart
                data={freshness}
                keys={["new_listings", "archived_count"]}
                labelKey="month"
              />
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  internal,
  children,
}: {
  title: string;
  subtitle?: string;
  internal?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {internal && (
          <Badge variant="secondary" className="text-[10px]">
            INTERNO
          </Badge>
        )}
      </div>
      {subtitle && <p className="mb-4 -mt-3 text-xs text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function CompletenessCard({ label, value }: { label: string; value: number }) {
  const color =
    value >= 90 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold tabular-nums">{value.toFixed(1)}%</div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full ${color}`}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function NeighborhoodTable({
  title,
  rows,
  currencySymbol,
}: {
  title: string;
  rows: Array<{ neighborhood: string; city: string; median_m2: number; count: number }>;
  currencySymbol: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Colonia</TableHead>
            <TableHead className="text-right">Precio/m2</TableHead>
            <TableHead className="text-right">N</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="font-medium">{r.neighborhood}</div>
                <div className="text-xs text-muted-foreground">{r.city}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {currencySymbol}
                {formatPrice(Math.round(Number(r.median_m2) / 100))}
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                {r.count}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState({ message = "Sin datos suficientes" }: { message?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function formatPrice(cents: number): string {
  const pesos = cents / 100;
  if (pesos >= 1_000_000) return `${(pesos / 1_000_000).toFixed(2)}M`;
  if (pesos >= 1_000) return `${(pesos / 1_000).toFixed(0)}K`;
  return pesos.toLocaleString();
}

function translateListingType(t: string): string {
  if (t === "sale") return "Venta";
  if (t === "rent") return "Renta";
  if (t === "presale") return "Preventa";
  return t;
}
