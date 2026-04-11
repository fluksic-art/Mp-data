import { describe, it, expect } from "vitest";
import {
  slugify,
  buildListingUrl,
  buildPropertyJsonLd,
  buildBreadcrumbJsonLd,
  buildHreflangLinks,
  buildFaqJsonLd,
  buildListingSlug,
} from "./json-ld.js";
import { buildListingMeta, buildHubMeta } from "./meta-templates.js";
import {
  detectForbidden,
  FORBIDDEN_WORDS_ES,
  FORBIDDEN_WORDS_EN,
  FORBIDDEN_WORDS_FR,
} from "./forbidden-words.js";
import {
  translateAdjective,
  isSlugAdjectiveKey,
  SLUG_ADJECTIVE_KEYS,
} from "./slug-adjectives.js";

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
    // New format: "Discover this 3-bedroom apartment for sale in ..."
    expect(meta.description).toContain("3-bedroom");
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

  // Manual Parte 5.4: price + CTA must always survive truncation.
  it("always includes price and CTA in description (ES)", () => {
    const meta = buildListingMeta(inputs, "es");
    expect(meta.description).toContain("MXN");
    expect(meta.description).toContain("Agenda tu visita.");
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it("always includes price and CTA in description (EN)", () => {
    const meta = buildListingMeta(inputs, "en");
    expect(meta.description).toContain("MXN");
    expect(meta.description).toContain("Schedule a tour.");
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it("always includes price and CTA in description (FR)", () => {
    const meta = buildListingMeta(inputs, "fr");
    expect(meta.description).toContain("MXN");
    expect(meta.description).toContain("Planifiez une visite.");
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it("trims state first when description overflows", () => {
    const longState = {
      ...inputs,
      state: "A Very Long State Name For Testing Truncation Logic",
    };
    const meta = buildListingMeta(longState, "es");
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.description).toContain("Agenda tu visita.");
    expect(meta.description).toContain("MXN");
  });

  it("includes CTA even without price", () => {
    const meta = buildListingMeta({ ...inputs, priceCents: null }, "es");
    expect(meta.description).toContain("Agenda tu visita.");
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it("uses singular bedroom in English when bedrooms=1", () => {
    const meta = buildListingMeta({ ...inputs, bedrooms: 1 }, "en");
    expect(meta.description).toContain("1-bedroom");
  });
});

describe("buildListingSlug", () => {
  it("builds ES slug with adjective", () => {
    const slug = buildListingSlug({
      propertyType: "apartment",
      city: "Tulum",
      slugAdjective: "frente-al-mar",
      idPrefix: "fb64c047",
      locale: "es",
    });
    expect(slug).toBe("departamento-tulum-frente-al-mar-fb64c047");
  });

  it("builds EN slug with translated adjective", () => {
    const slug = buildListingSlug({
      propertyType: "apartment",
      city: "Tulum",
      slugAdjective: "frente-al-mar",
      idPrefix: "fb64c047",
      locale: "en",
    });
    expect(slug).toBe("apartment-tulum-beachfront-fb64c047");
  });

  it("builds FR slug with translated adjective", () => {
    const slug = buildListingSlug({
      propertyType: "house",
      city: "Playa del Carmen",
      slugAdjective: "con-alberca",
      idPrefix: "abc12345",
      locale: "fr",
    });
    expect(slug).toBe("maison-playa-del-carmen-avec-piscine-abc12345");
  });

  it("omits adjective when null", () => {
    const slug = buildListingSlug({
      propertyType: "villa",
      city: "Bacalar",
      slugAdjective: null,
      idPrefix: "xyz00000",
      locale: "es",
    });
    expect(slug).toBe("villa-bacalar-xyz00000");
  });

  it("never contains developer or development names", () => {
    // The slug only takes propertyType, city, adjective, idPrefix.
    // There is no way to leak a proper name through this API.
    const slug = buildListingSlug({
      propertyType: "apartment",
      city: "Tulum",
      slugAdjective: "penthouse",
      idPrefix: "fb64c047",
      locale: "es",
    });
    expect(slug).not.toContain("lumma");
    expect(slug).not.toContain("habitat");
    expect(slug).not.toContain("mayakana");
    expect(slug).not.toContain("plalla");
  });
});

describe("translateAdjective", () => {
  it("translates every key across all 3 locales", () => {
    for (const key of SLUG_ADJECTIVE_KEYS) {
      expect(translateAdjective(key, "es")).toBeTruthy();
      expect(translateAdjective(key, "en")).toBeTruthy();
      expect(translateAdjective(key, "fr")).toBeTruthy();
    }
  });

  it("returns null for null input", () => {
    expect(translateAdjective(null, "es")).toBeNull();
    expect(translateAdjective(null, "en")).toBeNull();
    expect(translateAdjective(null, "fr")).toBeNull();
  });
});

describe("isSlugAdjectiveKey", () => {
  it("accepts valid keys", () => {
    expect(isSlugAdjectiveKey("frente-al-mar")).toBe(true);
    expect(isSlugAdjectiveKey("penthouse")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isSlugAdjectiveKey("invalid")).toBe(false);
    expect(isSlugAdjectiveKey(null)).toBe(false);
    expect(isSlugAdjectiveKey(123)).toBe(false);
    expect(isSlugAdjectiveKey(undefined)).toBe(false);
  });
});

describe("buildFaqJsonLd", () => {
  it("generates FAQPage with question/answer pairs", () => {
    const faqs = [
      { question: "¿Acepta extranjeros?", answer: "Sí, vía fideicomiso." },
      { question: "¿Cuántas recámaras tiene?", answer: "Tres recámaras." },
    ];
    const ld = buildFaqJsonLd(faqs);
    expect(ld["@type"]).toBe("FAQPage");
    const main = ld["mainEntity"] as Array<Record<string, unknown>>;
    expect(main).toHaveLength(2);
    expect(main[0]?.["@type"]).toBe("Question");
    expect(main[0]?.["name"]).toBe("¿Acepta extranjeros?");
    const answer0 = main[0]?.["acceptedAnswer"] as Record<string, unknown>;
    expect(answer0["@type"]).toBe("Answer");
    expect(answer0["text"]).toBe("Sí, vía fideicomiso.");
  });

  it("handles empty FAQ list", () => {
    const ld = buildFaqJsonLd([]);
    expect(ld["mainEntity"]).toEqual([]);
  });
});

describe("detectForbidden", () => {
  it("flags Spanish anti-humo phrases", () => {
    const text =
      "Esta es una oportunidad única que no te puedes perder, con rendimiento garantizado.";
    const found = detectForbidden(text, "es");
    expect(found).toContain("oportunidad única");
    expect(found.some((f) => f.includes("garantizado"))).toBe(true);
  });

  it("matches accent-folded Spanish variants", () => {
    const text = "una oportunidad unica con potencial ilimitado";
    const found = detectForbidden(text, "es");
    expect(found.length).toBeGreaterThan(0);
  });

  it("flags English Zillow value-destroying words", () => {
    const text = "Amazing fixer with unlimited potential. A must see!";
    const found = detectForbidden(text, "en");
    expect(found).toContain("amazing");
    expect(found).toContain("fixer");
    expect(found).toContain("unlimited potential");
    expect(found.some((f) => f.includes("must"))).toBe(true);
  });

  it("flags French anti-humo phrases", () => {
    const text =
      "Une opportunité unique à ne pas manquer avec un rendement garanti.";
    const found = detectForbidden(text, "fr");
    expect(found.length).toBeGreaterThan(0);
  });

  it("returns empty array for clean text", () => {
    const text = "Departamento de tres recámaras a 10 minutos del centro.";
    expect(detectForbidden(text, "es")).toEqual([]);
  });

  it("does not flag substrings inside other words (single-word terms)", () => {
    // "fixer" should not match "transfixerized" — boundary protection
    const text = "We use a transfixerized algorithm for processing.";
    expect(detectForbidden(text, "en")).not.toContain("fixer");
  });

  it("export lists are non-empty", () => {
    expect(FORBIDDEN_WORDS_ES.length).toBeGreaterThan(5);
    expect(FORBIDDEN_WORDS_EN.length).toBeGreaterThan(5);
    expect(FORBIDDEN_WORDS_FR.length).toBeGreaterThan(3);
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
