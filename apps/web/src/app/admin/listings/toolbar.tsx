"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ALL_COLUMNS, type ColumnKey } from "./columns";

interface Props {
  currentStatus: string | undefined;
  currentCity: string | undefined;
  currentPropertyType: string | undefined;
  currentListingType: string | undefined;
  currentSource: string | undefined;
  currentSearch: string | undefined;
  currentPerPage: number;
  currentPipeline: string | undefined;
  currentSort: string | undefined;
  currentColumns: ColumnKey[];
  currentMinPrice: string | undefined;
  currentMaxPrice: string | undefined;
  currentBedrooms: string | undefined;
  statuses: string[];
  cities: string[];
  propertyTypes: string[];
  listingTypes: string[];
  sourceDomains: string[];
}

export function ListingsToolbar({
  currentStatus,
  currentCity,
  currentPropertyType,
  currentListingType,
  currentSource,
  currentSearch,
  currentPerPage,
  currentPipeline,
  currentSort,
  currentColumns,
  currentMinPrice,
  currentMaxPrice,
  currentBedrooms,
  statuses,
  cities,
  propertyTypes,
  listingTypes,
  sourceDomains,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showColumns, setShowColumns] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(
    !!(currentListingType || currentSource || currentMinPrice || currentMaxPrice || currentBedrooms),
  );

  const updateParam = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) {
        sp.set(key, value);
      } else {
        sp.delete(key);
      }
      sp.delete("page");
      router.push(`/admin/listings?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const updateMultipleParams = useCallback(
    (updates: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) sp.set(key, value);
        else sp.delete(key);
      }
      sp.delete("page");
      router.push(`/admin/listings?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push("/admin/listings");
  }, [router]);

  const toggleColumn = useCallback(
    (col: ColumnKey) => {
      const next = currentColumns.includes(col)
        ? currentColumns.filter((c) => c !== col)
        : [...currentColumns, col];
      updateParam("columns", next.join(","));
    },
    [currentColumns, updateParam],
  );

  const selectClass =
    "h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";
  const inputClass =
    "h-8 rounded-md border bg-background px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const btnClass =
    "h-8 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent";

  const hasFilters =
    currentStatus || currentCity || currentPropertyType || currentSearch ||
    currentPipeline || currentListingType || currentSource ||
    currentMinPrice || currentMaxPrice || currentBedrooms;

  return (
    <div className="space-y-2">
      {/* Row 1: Search + main filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search title, developer, development, address..."
          defaultValue={currentSearch ?? ""}
          className={`${inputClass} w-72`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParam("search", e.currentTarget.value);
            }
          }}
        />

        <select
          className={selectClass}
          value={currentStatus ?? ""}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={currentCity ?? ""}
          onChange={(e) => updateParam("city", e.target.value)}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={currentPropertyType ?? ""}
          onChange={(e) => updateParam("propertyType", e.target.value)}
        >
          <option value="">All types</option>
          {propertyTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          className={selectClass}
          value={currentPipeline ?? ""}
          onChange={(e) => updateParam("pipeline", e.target.value)}
        >
          <option value="">All pipeline</option>
          <option value="extracted">Only extracted</option>
          <option value="paraphrased">Paraphrased (no EN)</option>
          <option value="translated">Fully translated</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            className={btnClass}
            onClick={() => setShowMoreFilters((v) => !v)}
          >
            {showMoreFilters ? "Less filters" : "More filters"}
          </button>

          <button
            className={btnClass}
            onClick={() => setShowColumns((v) => !v)}
          >
            Columns
          </button>

          {hasFilters && (
            <button onClick={clearAll} className={btnClass}>
              Clear all
            </button>
          )}

          <select
            className={selectClass}
            value={currentPerPage}
            onChange={(e) => updateParam("perPage", e.target.value)}
          >
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
            <option value="200">200 / page</option>
            <option value="500">500 / page</option>
            <option value="1000">1000 / page</option>
          </select>
        </div>
      </div>

      {/* Row 2: More filters (collapsed by default) */}
      {showMoreFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <select
            className={selectClass}
            value={currentListingType ?? ""}
            onChange={(e) => updateParam("listingType", e.target.value)}
          >
            <option value="">All listing types</option>
            {listingTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            className={selectClass}
            value={currentSource ?? ""}
            onChange={(e) => updateParam("source", e.target.value)}
          >
            <option value="">All sources</option>
            {sourceDomains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            className={selectClass}
            value={currentBedrooms ?? ""}
            onChange={(e) => updateParam("bedrooms", e.target.value)}
          >
            <option value="">Any beds</option>
            <option value="1">1 bed</option>
            <option value="2">2 beds</option>
            <option value="3">3 beds</option>
            <option value="4">4+ beds</option>
          </select>

          <span className="text-xs text-muted-foreground">Price:</span>
          <input
            type="text"
            placeholder="Min"
            defaultValue={currentMinPrice ?? ""}
            className={`${inputClass} w-24`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateParam("minPrice", e.currentTarget.value);
              }
            }}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="text"
            placeholder="Max"
            defaultValue={currentMaxPrice ?? ""}
            className={`${inputClass} w-24`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateParam("maxPrice", e.currentTarget.value);
              }
            }}
          />

          <select
            className={selectClass}
            value={currentSort ?? ""}
            onChange={(e) => updateParam("sort", e.target.value)}
          >
            <option value="">Sort: newest first</option>
            <option value="oldest">Sort: oldest first</option>
            <option value="price_asc">Sort: price low→high</option>
            <option value="price_desc">Sort: price high→low</option>
            <option value="size_asc">Sort: size small→large</option>
            <option value="size_desc">Sort: size large→small</option>
            <option value="title_asc">Sort: title A→Z</option>
          </select>
        </div>
      )}

      {/* Column toggles */}
      {showColumns && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 px-3 py-2">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Show:</span>
          {ALL_COLUMNS.map((col) => {
            const active = currentColumns.includes(col.key);
            return (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border text-muted-foreground hover:bg-accent"
                }`}
              >
                {col.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
