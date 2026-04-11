import { describe, it, expect } from "vitest";
import {
  slugify,
  buildListingUrl,
  buildPropertyJsonLd,
  buildBreadcrumbJsonLd,
  buildHreflangLinks,
} from "./json-ld.js";
import { buildListingMeta, buildHubMeta } from "./meta-templates.js";

describe("slugify", () => {
  it("strips accents", () => {
    expect(slugify("Cancún")).toBe("cancun");
    expect(slugify("Playa del Carmen")).toBe("playa-del-carmen");
  });

  it("strips apostrophes", () => {
    expect(slugify("Xts'unu'um")).toBe("xtsunuum");
  });

  it("collapses dashes", () => {
    expect(slugify("Casa  ---  vista mar")).toBe("casa-vista-mar");
  });

  it("limits length to 80 chars", () => {
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });
});

describe("buildListingUrl", () => {
  it("builds a Spanish URL", () => {
    const url = buildListingUrl(
      "https://example.com",
      "es",
      "Quintana Roo",
      "Playa del Carmen",
      "apartment",
      "sale",
      "depto-playacar-123",
    );
    expect(url).toBe(
      "https://example.com/es/quintana-roo/playa-del-carmen/departamentos-en-venta/depto-playacar-123/",
    );
  });

  it("builds an English URL", () => {
    const url = buildListingUrl(
      "https://example.com",
      "en",
      "Quintana Roo",
      "Tulum",
      "villa",
      "presale",
      "villa-amanka",
    );
    expect(url).toBe(
      "https://example.com/en/quintana-roo/tulum/villas-pre-construction/villa-amanka/",
    );
  });

  it("builds a French URL", () => {
    const url = buildListingUrl(
      "https://example.com",
      "fr",
      "Quintana Roo",
      "Tulum",
      "house",
      "sale",
      "casa-tulum",
    );
    expect(url).toBe(
      "https://example.com/fr/quintana-roo/tulum/maisons-a-vendre/casa-tulum/",
    );
  });
});

describe("buildPropertyJsonLd", () => {
  const property = {
    id: "abc",
    title: "Departamento en Playacar",
    propertyType: "apartment",
    listingType: "sale",
    priceCents: 550000000,
    currency: "MXN",
    bedrooms: 3,
    bathrooms: 2,
    constructionM2: 120,
    landM2: null,
    country: "MX",
    state: "Quintana Roo",
    city: "Playa del Carmen",
    neighborhood: "Playacar",
    address: "Calle 10",
    postalCode: "77710",
    latitude: 20.6296,
    longitude: -87.0739,
    sourceUrl: "https://source.com/x",
  };

  it("includes required Schema.org fields", () => {
    const ld = buildPropertyJsonLd(property, {
      canonicalUrl: "https://example.com/es/qr/pdc/x",
      locale: "es",
      images: [{ url: "https://cdn/1.webp" }],
      description: "Hermoso departamento",
    });

    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("RealEstateListing");
    expect(ld["name"]).toBe("Departamento en Playacar");
    expect(ld["inLanguage"]).toBe("es");
    expect(ld["numberOfBedrooms"]).toBe(3);
    expect(ld["numberOfBathroomsTotal"]).toBe(2);
  });

  it("includes price as offer", () => {
    const ld = buildPropertyJsonLd(property, {
      canonicalUrl: "https://example.com/x",
      locale: "es",
      images: [],
      description: "x",
    });
    const offer = ld["offers"] as Record<string, unknown>;
    expect(offer["price"]).toBe("5500000");
    expect(offer["priceCurrency"]).toBe("MXN");
  });

  it("includes geo coordinates", () => {
    const ld = buildPropertyJsonLd(property, {
      canonicalUrl: "https://example.com/x",
      locale: "es",
      images: [],
      description: "x",
    });
    const geo = ld["geo"] as Record<string, unknown>;
    expect(geo["latitude"]).toBe(20.6296);
    expect(geo["longitude"]).toBe(-87.0739);
  });

  it("omits offer when no price", () => {
    const ld = buildPropertyJsonLd(
      { ...property, priceCents: null },
      {
        canonicalUrl: "https://example.com/x",
        locale: "es",
        images: [],
        description: "x",
      },
    );
    expect(ld["offers"]).toBeUndefined();
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("creates 4-level breadcrumb", () => {
    const ld = buildBreadcrumbJsonLd(
      "https://example.com",
      "es",
      { state: "Quintana Roo", city: "Tulum", title: "Villa Amanka" },
      "https://example.com/es/qr/tulum/villas/villa-amanka",
    );

    expect(ld["@type"]).toBe("BreadcrumbList");
    const items = ld["itemListElement"] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(4);
    expect(items[0]?.["name"]).toBe("Inicio");
    expect(items[1]?.["name"]).toBe("Quintana Roo");
    expect(items[2]?.["name"]).toBe("Tulum");
    expect(items[3]?.["name"]).toBe("Villa Amanka");
  });
});

describe("buildHreflangLinks", () => {
  it("generates links for all locales + x-default", () => {
    const links = buildHreflangLinks(
      "https://example.com",
      [
        { locale: "es", url: "https://example.com/es/x" },
        { locale: "en", url: "https://example.com/en/x" },
        { locale: "fr", url: "https://example.com/fr/x" },
      ],
      "es",
    );

    expect(links).toHaveLength(4); // 3 locales + x-default
    expect(links.find((l) => l.hrefLang === "es-mx")).toBeDefined();
    expect(links.find((l) => l.hrefLang === "en")).toBeDefined();
    expect(links.find((l) => l.hrefLang === "fr")).toBeDefined();
    expect(links.find((l) => l.hrefLang === "x-default")?.href).toBe(
      "https://example.com/es/x",
    );
  });
});

describe("buildListingMeta", () => {
  const inputs = {
    title: "Departamento en Playacar",
    city: "Playa del Carmen",
    state: "Quintana Roo",
    propertyType: "apartment",
    listingType: "sale",
    priceCents: 550000000,
    currency: "MXN",
    bedrooms: 3,
    bathrooms: 2,
    constructionM2: 120,
  };

  it("generates Spanish meta", () => {
    const meta = buildListingMeta(inputs, "es");
    expect(meta.title).toContain("Departamento en venta");
    expect(meta.title).toContain("Playa del Carmen");
    expect(meta.title.length).toBeLessThanOrEqual(60);
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.h1).toContain("Departamento en venta");
  });

  it("generates English meta", () => {
    const meta = buildListingMeta(inputs, "en");
    expect(meta.title).toContain("Apartment for sale");
    expect(meta.description).toContain("3 bed");
  });

  it("generates French meta", () => {
    const meta = buildListingMeta(inputs, "fr");
    expect(meta.title).toContain("Appartement à vendre");
  });

  it("respects 60 char title limit", () => {
    const meta = buildListingMeta(
      { ...inputs, city: "A".repeat(50) },
      "es",
    );
    expect(meta.title.length).toBeLessThanOrEqual(60);
  });
});

describe("buildHubMeta", () => {
  it("generates hub meta with count", () => {
    const meta = buildHubMeta(
      "Tulum",
      "Quintana Roo",
      "villa",
      "sale",
      42,
      "es",
    );
    expect(meta.title).toContain("42+");
    expect(meta.title).toContain("Tulum");
    expect(meta.title.length).toBeLessThanOrEqual(60);
  });
});
