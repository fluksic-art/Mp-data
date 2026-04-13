"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface Props {
  currentStatus: string | undefined;
  currentCity: string | undefined;
  currentPropertyType: string | undefined;
  currentSearch: string | undefined;
  currentPerPage: number;
  currentPipeline: string | undefined;
  statuses: string[];
  cities: string[];
  propertyTypes: string[];
}

export function ListingsToolbar({
  currentStatus,
  currentCity,
  currentPropertyType,
  currentSearch,
  currentPerPage,
  currentPipeline,
  statuses,
  cities,
  propertyTypes,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) {
        sp.set(key, value);
      } else {
        sp.delete(key);
      }
      sp.delete("page"); // reset to page 1 on filter change
      router.push(`/admin/listings?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push("/admin/listings");
  }, [router]);

  const selectClass =
    "h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";
  const inputClass =
    "h-8 w-48 rounded-md border bg-background px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  const hasFilters = currentStatus || currentCity || currentPropertyType || currentSearch || currentPipeline;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="Search title..."
        defaultValue={currentSearch ?? ""}
        className={inputClass}
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
        {hasFilters && (
          <button
            onClick={clearAll}
            className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent"
          >
            Clear filters
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
  );
}
