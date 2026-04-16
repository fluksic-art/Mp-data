export const ALL_COLUMNS = [
  { key: "title", label: "Property", default: true },
  { key: "price", label: "Price", default: true },
  { key: "size", label: "Size", default: true },
  { key: "location", label: "Location", default: true },
  { key: "bedrooms", label: "Beds/Baths", default: false },
  { key: "source", label: "Source", default: false },
  { key: "developer", label: "Developer", default: false },
  { key: "development", label: "Development", default: false },
  { key: "neighborhood", label: "Neighborhood", default: false },
  { key: "images", label: "Images", default: true },
  { key: "pipeline", label: "Pipeline", default: true },
  { key: "supervisor", label: "Supervisor", default: false },
  { key: "status", label: "Status", default: true },
  { key: "firstSeen", label: "First Seen", default: false },
  { key: "lastSeen", label: "Last Seen", default: false },
] as const;

export type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];

/** Default column widths in px. Users can override via drag-resize and
 * the choice persists in localStorage (see resizable.tsx). */
export const COLUMN_DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  title: 280,
  price: 120,
  size: 110,
  location: 140,
  bedrooms: 100,
  source: 160,
  developer: 160,
  development: 160,
  neighborhood: 140,
  images: 60,
  pipeline: 170,
  supervisor: 130,
  status: 120,
  firstSeen: 110,
  lastSeen: 110,
};

const DEFAULT_COLUMNS = ALL_COLUMNS.filter((c) => c.default).map((c) => c.key);

export function parseVisibleColumns(param: string | undefined): ColumnKey[] {
  if (!param) return [...DEFAULT_COLUMNS];
  const keys = param.split(",") as ColumnKey[];
  return keys.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
}
