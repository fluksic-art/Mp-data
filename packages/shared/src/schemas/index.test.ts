import { describe, it, expect } from "vitest";
import {
  propertyTypeSchema,
  listingTypeSchema,
  currencySchema,
  sourceSchema,
  crawlRunSchema,
  propertySchema,
  extractedPropertySchema,
  propertyImageSchema,
  leadSchema,
  createLeadSchema,
} from "./index.js";

describe("enums", () => {
  it("accepts valid property types", () => {
    expect(propertyTypeSchema.parse("apartment")).toBe("apartment");
    expect(propertyTypeSchema.parse("villa")).toBe("villa");
  });

  it("rejects invalid property types", () => {
    expect(() => propertyTypeSchema.parse("castle")).toThrow();
  });

  it("accepts valid listing types", () => {
    expect(listingTypeSchema.parse("sale")).toBe("sale");
    expect(listingTypeSchema.parse("presale")).toBe("presale");
  });

  it("accepts valid currencies", () => {
    expect(currencySchema.parse("MXN")).toBe("MXN");
    expect(currencySchema.parse("USD")).toBe("USD");
  });
});

describe("sourceSchema", () => {
  it("parses a valid source", () => {
    const source = sourceSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      domain: "example.com",
      name: "Example RE",
      createdAt: "2026-01-15T10:30:00Z",
    });
    expect(source.status).toBe("pending");
    expect(source.watermarkConfig.enabled).toBe(false);
  });
});

describe("crawlRunSchema", () => {
  it("parses with defaults", () => {
    const run = crawlRunSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440001",
      sourceId: "550e8400-e29b-41d4-a716-446655440000",
      startedAt: "2026-01-15T10:30:00Z",
    });
    expect(run.status).toBe("running");
    expect(run.pagesCrawled).toBe(0);
  });
});

describe("propertySchema", () => {
  const validProperty = {
    id: "550e8400-e29b-41d4-a716-446655440002",
    sourceId: "550e8400-e29b-41d4-a716-446655440000",
    sourceListingId: "listing-123",
    sourceUrl: "https://example.com/propiedad/123",
    title: "Departamento en Playa del Carmen",
    propertyType: "apartment",
    listingType: "sale",
    priceCents: 550000000,
    currency: "MXN",
    state: "Quintana Roo",
    city: "Playa del Carmen",
    contentHash: "abc123",
    firstSeenAt: "2026-01-15T10:30:00Z",
    lastSeenAt: "2026-01-15T10:30:00Z",
  };

  it("parses a valid property", () => {
    const prop = propertySchema.parse(validProperty);
    expect(prop.propertyType).toBe("apartment");
    expect(prop.status).toBe("draft");
    expect(prop.country).toBe("MX");
  });

  it("rejects missing required fields", () => {
    expect(() =>
      propertySchema.parse({ ...validProperty, title: undefined }),
    ).toThrow();
  });

  it("rejects invalid property type", () => {
    expect(() =>
      propertySchema.parse({ ...validProperty, propertyType: "castle" }),
    ).toThrow();
  });
});

describe("extractedPropertySchema", () => {
  it("parses extraction output", () => {
    const extracted = extractedPropertySchema.parse({
      sourceListingId: "listing-123",
      sourceUrl: "https://example.com/propiedad/123",
      title: "Depto en PDC",
      propertyType: "apartment",
      listingType: "sale",
      priceCents: 550000000,
      currency: "MXN",
      state: "Quintana Roo",
      city: "Playa del Carmen",
    });
    expect(extracted.sourceListingId).toBe("listing-123");
  });
});

describe("propertyImageSchema", () => {
  it("parses with defaults", () => {
    const img = propertyImageSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440003",
      propertyId: "550e8400-e29b-41d4-a716-446655440002",
      position: 0,
      originalUrl: "https://example.com/img/1.jpg",
      createdAt: "2026-01-15T10:30:00Z",
    });
    expect(img.hasWatermarkRemoved).toBe(false);
    expect(img.cleanUrl).toBeNull();
  });
});

describe("leadSchema", () => {
  it("parses a full lead", () => {
    const lead = leadSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440004",
      propertyId: "550e8400-e29b-41d4-a716-446655440002",
      source: "whatsapp_cta",
      name: "John Doe",
      email: "john@example.com",
      phone: "+1234567890",
      message: "Interested in this property",
      locale: "en",
      createdAt: "2026-01-15T10:30:00Z",
    });
    expect(lead.source).toBe("whatsapp_cta");
  });

  it("createLeadSchema omits id and createdAt", () => {
    const input = createLeadSchema.parse({
      propertyId: "550e8400-e29b-41d4-a716-446655440002",
      source: "contact_form",
      name: "Jane",
      email: "jane@example.com",
    });
    expect(input.source).toBe("contact_form");
    expect("id" in input).toBe(false);
  });
});
