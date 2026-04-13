"use client";

import { updatePropertyStatus } from "./actions";

export function DuplicateActions({ propertyId }: { propertyId: string }) {
  return (
    <div className="flex gap-1">
      <button
        onClick={() => updatePropertyStatus(propertyId, "draft")}
        className="rounded border border-green-600 px-1.5 py-0.5 text-[10px] text-green-600 hover:bg-green-50"
      >
        Approve
      </button>
      <button
        onClick={() => updatePropertyStatus(propertyId, "archived")}
        className="rounded border border-red-600 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
      >
        Archive
      </button>
    </div>
  );
}
