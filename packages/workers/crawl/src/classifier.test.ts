import { describe, it, expect } from "vitest";
import { classifyUrl, isListingRelated } from "./classifier.js";

describe("classifyUrl", () => {
  it("classifies sitemap URLs", () => {
    expect(classifyUrl("https://example.com/sitemap.xml")).toBe("sitemap");
    expect(classifyUrl("https://example.com/wp-sitemap.xml")).toBe("sitemap");
    expect(classifyUrl("https://example.com/sitemap-post.xml")).toBe("sitemap");
  });

  it("classifies property detail URLs", () => {
    expect(classifyUrl("https://example.com/propiedad/123")).toBe("property_detail");
    expect(classifyUrl("https://example.com/inmueble/depto-playa")).toBe("property_detail");
    expect(classifyUrl("https://example.com/listing/abc-123")).toBe("property_detail");
    expect(classifyUrl("https://example.com/property/beach-villa")).toBe("property_detail");
    expect(classifyUrl("https://example.com/en-venta/depto-playacar")).toBe("property_detail");
  });

  it("classifies listing index URLs", () => {
    expect(classifyUrl("https://example.com/propiedades")).toBe("listing_index");
    expect(classifyUrl("https://example.com/inmuebles")).toBe("listing_index");
    expect(classifyUrl("https://example.com/listings")).toBe("listing_index");
    expect(classifyUrl("https://example.com/search")).toBe("listing_index");
    expect(classifyUrl("https://example.com/departamentos")).toBe("listing_index");
    expect(classifyUrl("https://example.com/casas")).toBe("listing_index");
  });

  it("skips non-listing pages", () => {
    expect(classifyUrl("https://example.com/about")).toBe("skip");
    expect(classifyUrl("https://example.com/contact")).toBe("skip");
    expect(classifyUrl("https://example.com/blog/post-1")).toBe("skip");
    expect(classifyUrl("https://example.com/privacy")).toBe("skip");
    expect(classifyUrl("https://example.com/wp-admin")).toBe("skip");
  });

  it("skips static assets", () => {
    expect(classifyUrl("https://example.com/styles.css")).toBe("skip");
    expect(classifyUrl("https://example.com/logo.png")).toBe("skip");
    expect(classifyUrl("https://example.com/brochure.pdf")).toBe("skip");
  });

  it("skips unknown URLs", () => {
    expect(classifyUrl("https://example.com/random-page")).toBe("skip");
    expect(classifyUrl("https://example.com/")).toBe("skip");
  });
});

describe("isListingRelated", () => {
  it("returns true for property details", () => {
    expect(isListingRelated("https://example.com/propiedad/123")).toBe(true);
  });

  it("returns true for listing indexes", () => {
    expect(isListingRelated("https://example.com/propiedades")).toBe(true);
  });

  it("returns false for skip pages", () => {
    expect(isListingRelated("https://example.com/about")).toBe(false);
    expect(isListingRelated("https://example.com/blog/post")).toBe(false);
  });
});
