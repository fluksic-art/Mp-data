import { describe, it, expect } from "vitest";
import { extractTier1 } from "./tier1.js";

const jsonLdHtml = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "RealEstateListing",
  "name": "Departamento en Playacar",
  "offers": {
    "@type": "Offer",
    "price": "5500000",
    "priceCurrency": "MXN"
  },
  "address": {
    "@type": "PostalAddress",
    "addressCountry": "MX",
    "addressRegion": "Quintana Roo",
    "addressLocality": "Playa del Carmen",
    "streetAddress": "Playacar Fase 2"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 20.6296,
    "longitude": -87.0739
  },
  "floorSize": { "value": "120" },
  "numberOfRooms": 3,
  "numberOfBathroomsTotal": 2
}
</script>
</head><body></body></html>
`;

const ogHtml = `
<html><head>
<meta property="og:title" content="Casa en Tulum" />
<meta property="og:description" content="Beautiful house" />
<meta property="product:price:amount" content="3000000" />
<meta property="product:price:currency" content="USD" />
</head><body></body></html>
`;

const emptyHtml = `<html><head></head><body><p>Just a blog post</p></body></html>`;

describe("extractTier1", () => {
  it("extracts from JSON-LD RealEstateListing", () => {
    const result = extractTier1(jsonLdHtml, "https://example.com/prop/1");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Departamento en Playacar");
    expect(result!.priceCents).toBe(550000000);
    expect(result!.currency).toBe("MXN");
    expect(result!.state).toBe("Quintana Roo");
    expect(result!.city).toBe("Playa del Carmen");
    expect(result!.latitude).toBe(20.6296);
    expect(result!.longitude).toBe(-87.0739);
    expect(result!.constructionM2).toBe(120);
    expect(result!.bedrooms).toBe(3);
    expect(result!.bathrooms).toBe(2);
  });

  it("falls back to OpenGraph", () => {
    const result = extractTier1(ogHtml, "https://example.com/prop/2");

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Casa en Tulum");
    expect(result!.priceCents).toBe(300000000);
    expect(result!.currency).toBe("USD");
  });

  it("returns null for pages without structured data", () => {
    const result = extractTier1(emptyHtml, "https://example.com/blog");
    expect(result).toBeNull();
  });

  it("handles malformed JSON-LD gracefully", () => {
    const badHtml = `<html><head>
      <script type="application/ld+json">{ not valid json }</script>
    </head><body></body></html>`;

    const result = extractTier1(badHtml, "https://example.com/bad");
    expect(result).toBeNull();
  });
});
