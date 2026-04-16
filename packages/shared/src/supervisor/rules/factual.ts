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

interface Bbox { minLat: number; maxLat: number; minLng: number; maxLng: number }

const STATE_BBOXES: Record<string, Bbox> = {
  "quintana roo":       { minLat: 17.5,  maxLat: 21.7,  minLng: -89.5,  maxLng: -86.5  },
  "yucatan":            { minLat: 19.5,  maxLat: 21.7,  minLng: -91.0,  maxLng: -87.4  },
  "campeche":           { minLat: 17.8,  maxLat: 20.9,  minLng: -92.5,  maxLng: -89.0  },
  "jalisco":            { minLat: 18.9,  maxLat: 22.8,  minLng: -105.7, maxLng: -101.5 },
  "nayarit":            { minLat: 20.6,  maxLat: 23.1,  minLng: -105.8, maxLng: -103.7 },
  "baja california sur": { minLat: 22.8, maxLat: 28.1,  minLng: -115.1, maxLng: -109.2 },
  "baja california":    { minLat: 28.0,  maxLat: 32.8,  minLng: -117.2, maxLng: -112.7 },
  "nuevo leon":         { minLat: 23.1,  maxLat: 27.8,  minLng: -101.2, maxLng: -98.4  },
  "ciudad de mexico":   { minLat: 19.1,  maxLat: 19.6,  minLng: -99.4,  maxLng: -98.9  },
  "estado de mexico":   { minLat: 18.3,  maxLat: 20.3,  minLng: -100.6, maxLng: -98.5  },
  "guerrero":           { minLat: 16.3,  maxLat: 18.9,  minLng: -102.2, maxLng: -98.0  },
  "oaxaca":             { minLat: 15.6,  maxLat: 18.7,  minLng: -98.8,  maxLng: -93.5  },
  "puebla":             { minLat: 17.8,  maxLat: 20.6,  minLng: -99.1,  maxLng: -96.7  },
  "queretaro":          { minLat: 20.0,  maxLat: 21.7,  minLng: -100.6, maxLng: -99.0  },
  "guanajuato":         { minLat: 19.9,  maxLat: 21.9,  minLng: -102.1, maxLng: -99.6  },
  "veracruz":           { minLat: 17.1,  maxLat: 22.5,  minLng: -98.7,  maxLng: -93.6  },
  "sinaloa":            { minLat: 22.5,  maxLat: 27.1,  minLng: -109.5, maxLng: -105.4 },
  "sonora":             { minLat: 26.3,  maxLat: 32.5,  minLng: -115.1, maxLng: -108.4 },
  "tabasco":            { minLat: 17.2,  maxLat: 18.7,  minLng: -94.1,  maxLng: -90.9  },
  "colima":             { minLat: 18.6,  maxLat: 19.6,  minLng: -104.7, maxLng: -103.4 },
  "morelos":            { minLat: 18.3,  maxLat: 19.1,  minLng: -99.5,  maxLng: -98.6  },
  "chiapas":            { minLat: 14.5,  maxLat: 17.6,  minLng: -94.2,  maxLng: -90.4  },
  "aguascalientes":     { minLat: 21.6,  maxLat: 22.5,  minLng: -103.0, maxLng: -101.8 },
  "tamaulipas":         { minLat: 22.2,  maxLat: 27.7,  minLng: -100.4, maxLng: -97.1  },
  "coahuila":           { minLat: 24.5,  maxLat: 29.9,  minLng: -104.0, maxLng: -99.8  },
  "chihuahua":          { minLat: 25.6,  maxLat: 31.8,  minLng: -109.1, maxLng: -103.3 },
  "durango":            { minLat: 22.3,  maxLat: 26.9,  minLng: -107.2, maxLng: -103.4 },
  "san luis potosi":    { minLat: 21.1,  maxLat: 24.5,  minLng: -102.3, maxLng: -98.3  },
  "michoacan":          { minLat: 17.9,  maxLat: 20.4,  minLng: -103.8, maxLng: -100.0 },
  "hidalgo":            { minLat: 19.6,  maxLat: 21.4,  minLng: -99.9,  maxLng: -97.9  },
  "tlaxcala":           { minLat: 19.1,  maxLat: 19.8,  minLng: -98.7,  maxLng: -97.6  },
  "zacatecas":          { minLat: 21.0,  maxLat: 25.1,  minLng: -104.4, maxLng: -101.2 },
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
  if (!p.state || p.state.trim().length === 0) {
    issues.push({
      category: "factual",
      rule: "state-missing",
      severity: "warning",
      field: "state",
      message: "state vacío — no se pueden validar coordenadas sin referencia",
    });
  }
  if (p.latitude !== null && p.longitude !== null && p.state) {
    const stateKey = p.state.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const bbox = STATE_BBOXES[stateKey];
    if (bbox) {
      if (
        p.latitude < bbox.minLat ||
        p.latitude > bbox.maxLat ||
        p.longitude < bbox.minLng ||
        p.longitude > bbox.maxLng
      ) {
        issues.push({
          category: "factual",
          rule: "coords-outside-state",
          severity: "error",
          field: "latitude",
          message: `Coordenadas (${p.latitude}, ${p.longitude}) fuera del bbox de ${p.state}`,
          evidence: {
            latitude: p.latitude,
            longitude: p.longitude,
            state: p.state,
            bbox,
          },
        });
      }
    }
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
