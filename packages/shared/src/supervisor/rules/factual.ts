import type { SupervisorIssue } from "../../schemas/supervisor.js";
import type { PropertyForSupervisor } from "../property-input.js";

/** Property types that must not have bedrooms. Bathrooms are allowed on
 * office/commercial (client may need a WC). */
const NO_BEDROOMS_TYPES = new Set(["land", "office", "commercial"]);
const NO_BATHROOMS_TYPES = new Set(["land"]);
/** Types for which bedrooms are required (> 0) in a non-draft listing. */
const BEDROOMS_REQUIRED_TYPES = new Set([
  "apartment",
  "house",
  "villa",
  "penthouse",
]);

/** Quintana Roo bounding box (approx). Tight enough to catch typos and
 * source-swapped coords, loose enough to not flag legitimate inland
 * listings in Bacalar/FCP. */
const QROO_BBOX = {
  minLat: 17.5,
  maxLat: 21.7,
  minLng: -89.5,
  maxLng: -86.5,
};

const VALID_CURRENCIES = new Set(["MXN", "USD", "EUR"]);

/** Price sanity caps (heuristics, not hard rules). Triggered only to flag
 * for human review — never to auto-correct. */
const RENT_MXN_CAP = 500_000_00; // $500,000 MXN/mes — anything above is almost certainly a sale miscoded
const SALE_MXN_FLOOR = 100_000_00; // $100,000 MXN — below this is almost certainly a data error

export interface FactualRulesOptions {
  /** If true, skip rules that can only be evaluated against a non-draft
   * listing (e.g. priceZeroOrMissing). Defaults to false. */
  isDraft?: boolean;
}

export function runFactualRules(
  p: PropertyForSupervisor,
  opts: FactualRulesOptions = {},
): SupervisorIssue[] {
  const issues: SupervisorIssue[] = [];

  // --- Type vs rooms ---
  const type = p.propertyType.toLowerCase();
  if (NO_BEDROOMS_TYPES.has(type) && (p.bedrooms ?? 0) > 0) {
    issues.push({
      category: "factual",
      rule: "type-has-bedrooms",
      severity: "error",
      field: "bedrooms",
      message: `propertyType="${p.propertyType}" no debe tener bedrooms; se encontraron ${p.bedrooms}`,
      evidence: { propertyType: p.propertyType, bedrooms: p.bedrooms },
    });
  }
  if (NO_BATHROOMS_TYPES.has(type) && (p.bathrooms ?? 0) > 0) {
    issues.push({
      category: "factual",
      rule: "type-has-bathrooms",
      severity: "error",
      field: "bathrooms",
      message: `propertyType="${p.propertyType}" no debe tener bathrooms; se encontraron ${p.bathrooms}`,
      evidence: { propertyType: p.propertyType, bathrooms: p.bathrooms },
    });
  }
  if (BEDROOMS_REQUIRED_TYPES.has(type) && !opts.isDraft) {
    if (p.bedrooms === null || p.bedrooms <= 0) {
      issues.push({
        category: "factual",
        rule: "bedrooms-required-missing",
        severity: "warning",
        field: "bedrooms",
        message: `propertyType="${p.propertyType}" debería tener bedrooms pero está vacío`,
        evidence: { propertyType: p.propertyType, bedrooms: p.bedrooms },
      });
    }
  }

  // --- Areas ---
  if (type === "land" && (p.constructionM2 ?? 0) > 0) {
    issues.push({
      category: "factual",
      rule: "land-has-construction-m2",
      severity: "warning",
      field: "constructionM2",
      message: `Terreno con constructionM2=${p.constructionM2} (debería ser 0 o null)`,
      evidence: { constructionM2: p.constructionM2 },
    });
  }
  if (
    p.constructionM2 !== null &&
    p.landM2 !== null &&
    p.constructionM2 > p.landM2 &&
    type !== "apartment" &&
    type !== "penthouse"
  ) {
    issues.push({
      category: "factual",
      rule: "construction-exceeds-land",
      severity: "error",
      field: "constructionM2",
      message: `constructionM2=${p.constructionM2} > landM2=${p.landM2}`,
      evidence: { constructionM2: p.constructionM2, landM2: p.landM2 },
    });
  }
  for (const area of [
    { name: "constructionM2", value: p.constructionM2 },
    { name: "landM2", value: p.landM2 },
  ]) {
    if (area.value !== null && (area.value < 10 || area.value > 100_000)) {
      issues.push({
        category: "factual",
        rule: "area-out-of-range",
        severity: "warning",
        field: area.name,
        message: `${area.name}=${area.value} fuera de rango razonable [10, 100000]`,
        evidence: { [area.name]: area.value },
      });
    }
  }

  // --- Location ---
  if (p.latitude !== null && p.longitude !== null) {
    if (
      p.latitude < QROO_BBOX.minLat ||
      p.latitude > QROO_BBOX.maxLat ||
      p.longitude < QROO_BBOX.minLng ||
      p.longitude > QROO_BBOX.maxLng
    ) {
      issues.push({
        category: "factual",
        rule: "coords-outside-qroo",
        severity: "error",
        field: "latitude",
        message: `Coordenadas (${p.latitude}, ${p.longitude}) fuera del bbox de Quintana Roo`,
        evidence: {
          latitude: p.latitude,
          longitude: p.longitude,
          bbox: QROO_BBOX,
        },
      });
    }
  }
  if (p.state && p.state.toLowerCase() !== "quintana roo") {
    issues.push({
      category: "factual",
      rule: "state-not-qroo",
      severity: "warning",
      field: "state",
      message: `state="${p.state}" (esperado "Quintana Roo" en fase 1-2)`,
      evidence: { state: p.state },
    });
  }
  if (!p.city || p.city.trim().length === 0) {
    issues.push({
      category: "factual",
      rule: "city-missing",
      severity: "error",
      field: "city",
      message: `city vacío`,
    });
  }

  // --- Price / currency ---
  if (!opts.isDraft) {
    if (p.priceCents === null || p.priceCents <= 0) {
      issues.push({
        category: "factual",
        rule: "price-zero-or-missing",
        severity: "error",
        field: "priceCents",
        message: `priceCents=${p.priceCents} inválido para un listing no-draft`,
        evidence: { priceCents: p.priceCents, status: "non-draft" },
      });
    }
  }
  if (!VALID_CURRENCIES.has(p.currency)) {
    issues.push({
      category: "factual",
      rule: "currency-invalid",
      severity: "error",
      field: "currency",
      message: `currency="${p.currency}" no es válido (MXN|USD|EUR)`,
      evidence: { currency: p.currency },
    });
  }
  if (
    p.priceCents !== null &&
    p.priceCents > 0 &&
    p.listingType === "rent" &&
    p.currency === "MXN" &&
    p.priceCents > RENT_MXN_CAP
  ) {
    issues.push({
      category: "factual",
      rule: "rent-price-anomaly",
      severity: "warning",
      field: "priceCents",
      message: `Renta en MXN por ${(p.priceCents / 100).toLocaleString("es-MX")} — posible sale mal codificado`,
      evidence: { priceCents: p.priceCents, listingType: p.listingType },
    });
  }
  if (
    p.priceCents !== null &&
    p.priceCents > 0 &&
    p.listingType === "sale" &&
    p.currency === "MXN" &&
    p.priceCents < SALE_MXN_FLOOR
  ) {
    issues.push({
      category: "factual",
      rule: "sale-price-anomaly",
      severity: "warning",
      field: "priceCents",
      message: `Venta en MXN por ${(p.priceCents / 100).toLocaleString("es-MX")} — posible error de dato`,
      evidence: { priceCents: p.priceCents, listingType: p.listingType },
    });
  }

  // --- Title vs data ---
  const titleLower = foldAccents(p.title.toLowerCase());

  // Type mismatch: title says "casa" but propertyType=apartment, etc.
  const typeKeywords: Record<string, string[]> = {
    house: ["casa", "house"],
    apartment: ["departamento", "apartment", "apto", "depto"],
    villa: ["villa"],
    penthouse: ["penthouse", "ph"],
    land: ["terreno", "lote", "land", "parcel"],
    office: ["oficina", "office"],
    commercial: ["local comercial", "commercial"],
  };
  const actualKeywords = typeKeywords[type] ?? [];
  const conflictingTypes: string[] = [];
  for (const [otherType, kws] of Object.entries(typeKeywords)) {
    if (otherType === type) continue;
    for (const kw of kws) {
      const pattern = new RegExp(`\\b${kw}\\b`);
      if (pattern.test(titleLower)) {
        // If the title ALSO contains one of the actual-type keywords, skip.
        const alsoActual = actualKeywords.some((k) =>
          new RegExp(`\\b${k}\\b`).test(titleLower),
        );
        if (!alsoActual) {
          conflictingTypes.push(otherType);
        }
        break;
      }
    }
  }
  if (conflictingTypes.length > 0) {
    issues.push({
      category: "factual",
      rule: "title-type-mismatch",
      severity: "warning",
      field: "title",
      message: `Título sugiere "${conflictingTypes.join(", ")}" pero propertyType="${p.propertyType}"`,
      evidence: { title: p.title, propertyType: p.propertyType },
    });
  }

  // Rooms mismatch: title says "N recámaras" with bedrooms != N
  const roomsMatch = titleLower.match(
    /\b(\d{1,2})\s*(recamaras?|recamara|habitaciones?|habitacion|bedrooms?|bedroom|brs?|br)\b/,
  );
  if (roomsMatch && roomsMatch[1] && p.bedrooms !== null) {
    const titleRooms = Number(roomsMatch[1]);
    if (Number.isFinite(titleRooms) && titleRooms !== p.bedrooms) {
      issues.push({
        category: "factual",
        rule: "title-rooms-mismatch",
        severity: "warning",
        field: "bedrooms",
        message: `Título menciona ${titleRooms} recámaras pero bedrooms=${p.bedrooms}`,
        evidence: { titleRooms, bedrooms: p.bedrooms, title: p.title },
      });
    }
  }

  return issues;
}

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
