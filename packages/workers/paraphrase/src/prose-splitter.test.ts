import { describe, it, expect } from "vitest";
import { splitFactsFromProse, reassembleProse } from "./prose-splitter.js";

describe("splitFactsFromProse", () => {
  it("replaces prices with placeholders", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Beautiful apartment for $5,500,000 MXN in Playa del Carmen",
    );
    expect(textWithPlaceholders).not.toContain("5,500,000");
    expect(textWithPlaceholders).toMatch(/\{\{PRICE_\d+\}\}/);
    expect(Object.values(facts)).toContain("$5,500,000 MXN");
  });

  it("replaces areas with placeholders", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "This unit has 120 m² of construction and 200 m² of land",
    );
    expect(textWithPlaceholders).not.toContain("120");
    expect(Object.values(facts).some((v) => v.includes("120 m²"))).toBe(true);
    expect(Object.values(facts).some((v) => v.includes("200 m²"))).toBe(true);
  });

  it("replaces bedroom counts", () => {
    const { textWithPlaceholders } = splitFactsFromProse(
      "Offering 3 bedrooms and 2 bathrooms",
    );
    expect(textWithPlaceholders).not.toContain("3 bedrooms");
    expect(textWithPlaceholders).not.toContain("2 bathrooms");
  });

  it("preserves non-factual prose", () => {
    const { textWithPlaceholders } = splitFactsFromProse(
      "Stunning ocean views with modern finishes and luxury amenities",
    );
    expect(textWithPlaceholders).toBe(
      "Stunning ocean views with modern finishes and luxury amenities",
    );
  });
});

describe("reassembleProse", () => {
  it("replaces placeholders with original facts", () => {
    const result = reassembleProse(
      "A beautiful {{PRICE_0}} apartment with {{AREA_1}}",
      { "{{PRICE_0}}": "$5,500,000 MXN", "{{AREA_1}}": "120 m²" },
    );
    expect(result).toBe(
      "A beautiful $5,500,000 MXN apartment with 120 m²",
    );
  });
});
