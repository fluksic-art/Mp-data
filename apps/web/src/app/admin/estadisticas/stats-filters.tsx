"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  cities: string[];
  propertyTypes: string[];
  current: {
    currency: string;
    city?: string;
    propertyType?: string;
    listingType?: string;
    status?: string;
  };
};

const CURRENCIES = ["MXN", "USD"] as const;
const LISTING_TYPES = [
  { value: "", label: "Todos" },
  { value: "sale", label: "Venta" },
  { value: "rent", label: "Renta" },
  { value: "presale", label: "Preventa" },
];
const STATUSES = [
  { value: "", label: "Activos" },
  { value: "published", label: "Solo publicados" },
  { value: "all", label: "Incluye archivados" },
];

export function StatsFilters({ cities, propertyTypes, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    params.set("currency", current.currency);
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasActiveFilters = Boolean(
    current.city || current.propertyType || current.listingType || current.status,
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
      <FilterSelect
        label="Ciudad"
        value={current.city ?? ""}
        onChange={(v) => updateParam("city", v)}
        options={[
          { value: "", label: "Todas" },
          ...cities.map((c) => ({ value: c, label: c })),
        ]}
      />

      <FilterSelect
        label="Tipo de propiedad"
        value={current.propertyType ?? ""}
        onChange={(v) => updateParam("type", v)}
        options={[
          { value: "", label: "Todos" },
          ...propertyTypes.map((t) => ({ value: t, label: t })),
        ]}
      />

      <FilterSelect
        label="Tipo de listado"
        value={current.listingType ?? ""}
        onChange={(v) => updateParam("listingType", v)}
        options={LISTING_TYPES}
      />

      <FilterSelect
        label="Estado"
        value={current.status ?? ""}
        onChange={(v) => updateParam("status", v)}
        options={STATUSES}
      />

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">Moneda</span>
        <div className="inline-flex gap-1 rounded-md border bg-background p-0.5">
          {CURRENCIES.map((c) => (
            <Button
              key={c}
              variant={current.currency === c ? "default" : "ghost"}
              size="xs"
              onClick={() => updateParam("currency", c)}
              className="h-7 px-3 text-xs"
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground invisible">
            .
          </span>
          <Button variant="outline" size="xs" onClick={clearAll} className="h-7">
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
