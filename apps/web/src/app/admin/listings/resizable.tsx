"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "listings-col-widths-v1";

type Widths = Record<string, number>;

function loadWidths(): Widths {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveWidths(widths: Widths) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Renders a <colgroup> with a <col> per column. Hydrates widths from
 * localStorage on mount so the columns keep their user-chosen size
 * across navigations / refreshes.
 */
export function ResizableColgroup({
  columnKeys,
  defaults,
}: {
  columnKeys: readonly string[];
  defaults: Record<string, number>;
}) {
  useEffect(() => {
    const saved = loadWidths();
    for (const key of columnKeys) {
      const width = saved[key] ?? defaults[key];
      if (!width) continue;
      const col = document.querySelector<HTMLTableColElement>(
        `col[data-col-key="${key}"]`,
      );
      if (col) col.style.width = `${width}px`;
    }
  }, [columnKeys, defaults]);

  return (
    <colgroup>
      {columnKeys.map((key) => (
        <col
          key={key}
          data-col-key={key}
          style={{ width: `${defaults[key] ?? 120}px` }}
        />
      ))}
    </colgroup>
  );
}

/**
 * Drag handle to place inside a <TableHead>. On drag, resizes the
 * matching <col> directly via DOM; on release, persists all column
 * widths to localStorage.
 */
export function ResizeHandle({ columnKey }: { columnKey: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const col = document.querySelector<HTMLTableColElement>(
      `col[data-col-key="${columnKey}"]`,
    );
    if (!col) return;

    const startX = e.clientX;
    const startWidth = col.getBoundingClientRect().width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (me: MouseEvent) => {
      const newWidth = Math.max(48, startWidth + me.clientX - startX);
      col.style.width = `${newWidth}px`;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const widths: Widths = loadWidths();
      document
        .querySelectorAll<HTMLTableColElement>("col[data-col-key]")
        .forEach((c) => {
          const key = c.dataset.colKey;
          if (key) widths[key] = Math.round(c.getBoundingClientRect().width);
        });
      saveWidths(widths);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // reset this column only — clears saved width so default applies
    const col = document.querySelector<HTMLTableColElement>(
      `col[data-col-key="${columnKey}"]`,
    );
    if (!col) return;
    col.style.width = "";
    const widths = loadWidths();
    delete widths[columnKey];
    saveWidths(widths);
  };

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        // Wider hit area (4px) positioned slightly past the right edge so
        // it is easy to grab; a 1px divider inside is always visible.
        "group/resize absolute -right-0.5 top-0 z-10 flex h-full w-1 cursor-col-resize select-none items-stretch",
      )}
      title="Drag to resize — double-click to reset"
    >
      <span
        aria-hidden
        className={cn(
          "mx-auto block w-px bg-border transition-all",
          "group-hover/resize:w-1 group-hover/resize:bg-primary",
          "group-active/resize:w-1 group-active/resize:bg-primary",
        )}
      />
    </div>
  );
}
