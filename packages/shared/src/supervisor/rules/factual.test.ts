import { describe, it, expect } from "vitest";
import { runFactualRules } from "./factual.js";
import type { PropertyForSupervisor } from "../property-input.js";

function base(overrides: Partial<PropertyForSupervisor> = {}): PropertyForSupervisor {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Departamento de 2 recamaras en Tulum",
    propertyType: "apartment",
    listingType: "sale",
    priceCents: 3_500_000_00,
    currency: "MXN",
    bedrooms: 2,
    bathrooms: 2,
    constructionM2: 80,
    landM2: null,
    parkingSpaces: 1,
    country: "MX",
    state: "Quintana Roo",
    city: "Tulum",
    neighborhood: "Aldea Zama",
    address: null,
    latitude: 20.2,
    longitude: -87.45,
    contentEs: null,
    contentEn: null,
    contentFr: null,
    rawData: {},
    ...overrides,
  };
}

describe("runFactualRules", () => {
  it("passes a clean apartment listing", () => {
    const issues = runFactualRules(base());
    expect(issues).toHaveLength(0);
  });

  it("flags land with bedrooms", () => {
    const issues = runFactualRules(
      base({
        propertyType: "land",
        title: "Terreno 500m2 en Bacalar",
        bedrooms: 3,
        bathrooms: 0,
        landM2: 500,
        constructionM2: null,
      }),
    );
    expect(issues.map((i) => i.rule)).toContain("type-has-bedrooms");
  });

  it("flags land with bathrooms", () => {
    const issues = runFactualRules(
      base({
        propertyType: "land",
        title: "Terreno",
        bedrooms: 0,
        bathrooms: 2,
        landM2: 500,
        constructionM2: null,
      }),
    );
    expect(issues.map((i) => i.rule)).toContain("type-has-bathrooms");
  });

  it("allows office with bathrooms (explicit user exception)", () => {
    const issues = runFactualRules(
      base({
        propertyType: "office",
        title: "Oficina",
        bedrooms: 0,
        bathrooms: 2,
      }),
    );
    expect(issues.map((i) => i.rule)).not.toContain("type-has-bathrooms");
  });

  it("flags office with bedrooms", () => {
    const issues = runFactualRules(
      base({
        propertyType: "office",
        title: "Oficina",
        bedrooms: 2,
        bathrooms: 1,
      }),
    );
    expect(issues.map((i) => i.rule)).toContain("type-has-bedrooms");
  });

  it("flags land with constructionM2 > 0", () => {
    const issues = runFactualRules(
      base({
        propertyType: "land",
        title: "Terreno",
        bedrooms: 0,
        bathrooms: 0,
        landM2: 500,
        constructionM2: 50,
      }),
    );
    expect(issues.map((i) => i.rule)).toContain("land-has-construction-m2");
  });

  it("flags construction > land for house", () => {
    const issues = runFactualRules(
      base({
        propertyType: "house",
        title: "Casa",
        constructionM2: 800,
        landM2: 300,
      }),
    );
    expect(issues.map((i) => i.rule)).toContain("construction-exceeds-land");
  });

  it("does not flag construction > land for apartment/penthouse", () => {
    const issues = runFactualRules(
      base({
        propertyType: "apartment",
        constructionM2: 300,
        landM2: 100,
      }),
    );
    expect(issues.map((i) => i.rule)).not.toContain("construction-exceeds-land");
  });

  it("flags coords outside QRoo", () => {
    const issues = runFactualRules(base({ latitude: 19.43, longitude: -99.13 }));
    expect(issues.map((i) => i.rule)).toContain("coords-outside-qroo");
  });

  it("passes coords inside QRoo bbox", () => {
    const issues = runFactualRules(base({ latitude: 20.62, longitude: -87.08 }));
    expect(issues.map((i) => i.rule)).not.toContain("coords-outside-qroo");
  });

  it("flags missing city", () => {
    const issues = runFactualRules(base({ city: "" }));
    expect(issues.map((i) => i.rule)).toContain("city-missing");
  });

  it("flags state != Quintana Roo as warning", () => {
    const issues = runFactualRules(base({ state: "CDMX" }));
    expect(issues.map((i) => i.rule)).toContain("state-not-qroo");
  });

  it("flags invalid currency", () => {
    const issues = runFactualRules(base({ currency: "COP" }));
    expect(issues.map((i) => i.rule)).toContain("currency-invalid");
  });

  it("flags zero price on non-draft", () => {
    const issues = runFactualRules(base({ priceCents: 0 }));
    expect(issues.map((i) => i.rule)).toContain("price-zero-or-missing");
  });

  it("does not flag zero price on draft", () => {
    const issues = runFactualRules(base({ priceCents: 0 }), { isDraft: true });
    expect(issues.map((i) => i.rule)).not.toContain("price-zero-or-missing");
  });

  it("flags rent price anomaly (huge MXN rent)", () => {
    const issues = runFactualRules(
      base({
        listingType: "rent",
        priceCents: 5_000_000_00,
        currency: "MXN",
      }),
    );
    expect(issues.map((i) => i.rule)).toContain("rent-price-anomaly");
  });

  it("flags sale price anomaly (tiny MXN sale)", () => {
    const issues = runFactualRules(
      base({ listingType: "sale", priceCents: 50_000_00, currency: "MXN" }),
    );
    expect(issues.map((i) => i.rule)).toContain("sale-price-anomaly");
  });

  it("flags title-type mismatch (title says casa but type is apartment)", () => {
    const issues = runFactualRules(
      base({ title: "Hermosa casa 3 recamaras en Tulum", propertyType: "apartment" }),
    );
    expect(issues.map((i) => i.rule)).toContain("title-type-mismatch");
  });

  it("does NOT flag when title has both terms (casa y departamento context)", () => {
    const issues = runFactualRules(
      base({
        title: "Departamento tipo casa en Tulum",
        propertyType: "apartment",
      }),
    );
    expect(issues.map((i) => i.rule)).not.toContain("title-type-mismatch");
  });

  it("flags title-rooms-mismatch", () => {
    const issues = runFactualRules(
      base({ title: "Departamento de 3 recamaras en Tulum", bedrooms: 1 }),
    );
    expect(issues.map((i) => i.rule)).toContain("title-rooms-mismatch");
  });

  it("matches accented 'recámaras' in title against bedrooms", () => {
    const issues = runFactualRules(
      base({ title: "Departamento de 3 recámaras en Tulum", bedrooms: 3 }),
    );
    expect(issues.map((i) => i.rule)).not.toContain("title-rooms-mismatch");
  });

  it("flags area out of range", () => {
    const issues = runFactualRules(base({ constructionM2: 2, landM2: null }));
    expect(issues.map((i) => i.rule)).toContain("area-out-of-range");
  });
});
