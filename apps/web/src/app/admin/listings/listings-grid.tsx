import { ViewTransition } from "react";
import { PropertyCard } from "@/components/property-card";
import { EmptyState } from "@/components/empty-state";
import { ImageOff } from "lucide-react";

export interface GridListing {
  id: string;
  title: string;
  priceCents: number | null;
  currency: string | null;
  city: string | null;
  state: string | null;
  propertyType: string | null;
  listingType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionM2: number | null;
  landM2: number | null;
  status: string;
  primaryImageUrl: string | null;
  imageCount: number | null;
  contentEs: string | null;
  contentEn: string | null;
  contentFr: string | null;
}

function formatPrice(priceCents: number | null, currency: string | null): string {
  if (!priceCents) return "—";
  const amount = priceCents / 100;
  const code = currency?.toUpperCase() ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}

function decodeHtml(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}

export function ListingsGrid({ listings }: { listings: GridListing[] }) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff className="size-5" />}
        title="Sin resultados"
        description="No encontramos listings con los filtros activos. Prueba limpiarlos o ampliar la búsqueda."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((l) => {
        const priceDisplay = formatPrice(l.priceCents, l.currency);
        const location = [l.city, l.state].filter(Boolean).join(", ");
        const title = decodeHtml(l.title);

        const badges: Array<{ label: string; tone?: "default" | "success" | "warning" | "info" }> = [];
        if (l.status === "published") badges.push({ label: "Publicado", tone: "success" });
        else if (l.status === "review") badges.push({ label: "En review", tone: "warning" });
        else if (l.status === "failed") badges.push({ label: "Failed", tone: "default" });
        if (l.listingType) badges.push({ label: l.listingType, tone: "default" });

        const meta: { label: string; value: string }[] = [];
        if (l.bedrooms != null) meta.push({ label: "Rec", value: String(l.bedrooms) });
        if (l.bathrooms != null) meta.push({ label: "Ba", value: String(l.bathrooms) });
        if (l.constructionM2 != null) meta.push({ label: "m²", value: String(l.constructionM2) });
        if (l.propertyType) meta.push({ label: "Tipo", value: l.propertyType });

        return (
          <ViewTransition key={l.id} name={`listing-${l.id}`}>
            <PropertyCard
              id={l.id}
              href={`/admin/listings/${l.id}`}
              title={title}
              priceDisplay={priceDisplay}
              priceSubtitle={l.imageCount ? `${l.imageCount} fotos` : undefined}
              location={location || undefined}
              imageUrl={l.primaryImageUrl}
              imageAlt={title}
              badges={badges.slice(0, 2)}
              meta={meta.slice(0, 4)}
            />
          </ViewTransition>
        );
      })}
    </div>
  );
}
