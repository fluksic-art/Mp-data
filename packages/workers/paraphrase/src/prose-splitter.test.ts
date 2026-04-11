import { describe, it, expect } from "vitest";
import { splitFactsFromProse, reassembleProse } from "./prose-splitter.js";

describe("splitFactsFromProse", () => {
  it("replaces prices with FACT placeholders", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Beautiful apartment for $5,500,000 MXN in Playa del Carmen",
    );
    expect(textWithPlaceholders).not.toContain("5,500,000");
    expect(textWithPlaceholders).toMatch(/\{\{FACT_\d+\}\}/);
    expect(Object.values(facts)).toContain("$5,500,000 MXN");
  });

  it("replaces areas with FACT placeholders", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "This unit has 120 m² of construction and 200 m² of land",
    );
    expect(textWithPlaceholders).not.toContain("120");
    expect(Object.values(facts).some((v) => v.includes("120 m²"))).toBe(true);
    expect(Object.values(facts).some((v) => v.includes("200 m²"))).toBe(true);
  });

  it("replaces bedroom counts with FACT placeholders", () => {
    const { textWithPlaceholders } = splitFactsFromProse(
      "Offering 3 bedrooms and 2 bathrooms",
    );
    expect(textWithPlaceholders).not.toContain("3 bedrooms");
    expect(textWithPlaceholders).not.toContain("2 bathrooms");
    expect(textWithPlaceholders).toMatch(/\{\{FACT_\d+\}\}/);
  });

  it("replaces phone numbers with PII placeholders (not stored in facts)", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Contact us at +52 984 123 4567 for details",
    );
    expect(textWithPlaceholders).not.toContain("984 123 4567");
    expect(textWithPlaceholders).toMatch(/\{\{PII_\d+\}\}/);
    // Phone is NOT stored in facts — it will be stripped on reassembly
    expect(Object.values(facts).some((v) => v.includes("984"))).toBe(false);
  });

  it("replaces email addresses with PII placeholders", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Email agent@realestate.com for information",
    );
    expect(textWithPlaceholders).not.toContain("agent@realestate.com");
    expect(textWithPlaceholders).toMatch(/\{\{PII_\d+\}\}/);
    expect(Object.values(facts).some((v) => v.includes("@"))).toBe(false);
  });

  it("replaces precise coordinates with PII placeholders", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Located at 20.6296, -87.0739 in the heart of Playacar",
    );
    expect(textWithPlaceholders).not.toContain("20.6296");
    expect(textWithPlaceholders).not.toContain("-87.0739");
    expect(Object.values(facts).some((v) => v.includes("20.6296"))).toBe(false);
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
  it("replaces FACT placeholders with original literal values", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "A beautiful $5,500,000 MXN apartment with 120 m²",
    );
    const result = reassembleProse(textWithPlaceholders, facts);
    expect(result).toBe("A beautiful $5,500,000 MXN apartment with 120 m²");
  });

  it("strips PII placeholders entirely (phones never come back)", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Amazing condo! Call +52 984 123 4567 today.",
    );
    const result = reassembleProse(textWithPlaceholders, facts);
    expect(result).not.toContain("984");
    expect(result).not.toContain("4567");
    expect(result).not.toMatch(/\{\{PII_\d+\}\}/);
    expect(result).toContain("Amazing condo");
    expect(result).toContain("today.");
  });

  it("strips email addresses entirely", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "For info email us at agent@realestate.com and we will help.",
    );
    const result = reassembleProse(textWithPlaceholders, facts);
    expect(result).not.toContain("@");
    expect(result).not.toContain("realestate.com");
    expect(result).not.toMatch(/\{\{PII_\d+\}\}/);
  });

  it("strips precise coordinates", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "GPS coordinates: 20.6296, -87.0739 in Playacar",
    );
    const result = reassembleProse(textWithPlaceholders, facts);
    expect(result).not.toContain("20.6296");
    expect(result).not.toContain("-87.0739");
  });

  it("cleans orphan whitespace left by stripped PII", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Contact  +52 984 123 4567  for a tour",
    );
    const result = reassembleProse(textWithPlaceholders, facts);
    // Should not have double spaces around the stripped phone
    expect(result).not.toMatch(/ {2,}/);
  });

  it("cleans orphan punctuation left by stripped PII", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Call us at +52 984 123 4567, we answer fast.",
    );
    const result = reassembleProse(textWithPlaceholders, facts);
    // No awkward ", we" with leading space-comma
    expect(result).not.toMatch(/\s,/);
  });

  it("reassembles facts while stripping PII in the same text", () => {
    const { textWithPlaceholders, facts } = splitFactsFromProse(
      "Beautiful 3 bedrooms condo for $5,500,000 MXN. Call +52 984 123 4567.",
    );
    const result = reassembleProse(textWithPlaceholders, facts);
    expect(result).toContain("$5,500,000 MXN");
    expect(result).toContain("3 bedrooms");
    expect(result).not.toContain("984");
    expect(result).not.toContain("4567");
  });
});
