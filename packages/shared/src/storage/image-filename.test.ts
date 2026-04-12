import { describe, it, expect } from "vitest";
import { buildImageFilename, buildImageStoragePath } from "./image-filename.js";

describe("buildImageFilename", () => {
  const base = {
    city: "Tulum",
    bedrooms: 3,
    propertyType: "apartment",
    slugAdjective: "frente-al-mar" as const,
    propertyId: "fb64c047-1234-5678-9abc-def012345678",
    position: 1,
    originalUrl: "https://plalla.com/images/vista-aerea.jpg",
  };

  it("builds full filename with all fields", () => {
    expect(buildImageFilename(base)).toBe(
      "tulum-3rec-departamento-frente-al-mar-fb64c047-01.jpg",
    );
  });

  it("skips bedrooms for land", () => {
    expect(
      buildImageFilename({ ...base, propertyType: "land", bedrooms: null }),
    ).toBe("tulum-terreno-frente-al-mar-fb64c047-01.jpg");
  });

  it("skips bedrooms when null (non-land)", () => {
    expect(buildImageFilename({ ...base, bedrooms: null })).toBe(
      "tulum-departamento-frente-al-mar-fb64c047-01.jpg",
    );
  });

  it("skips adjective when null", () => {
    expect(
      buildImageFilename({ ...base, slugAdjective: null, bedrooms: 2 }),
    ).toBe("tulum-2rec-departamento-fb64c047-01.jpg");
  });

  it("handles city with accents and spaces", () => {
    expect(
      buildImageFilename({ ...base, city: "Playa del Carmen" }),
    ).toBe(
      "playa-del-carmen-3rec-departamento-frente-al-mar-fb64c047-01.jpg",
    );
  });

  it("zero-pads position", () => {
    expect(buildImageFilename({ ...base, position: 0 })).toBe(
      "tulum-3rec-departamento-frente-al-mar-fb64c047-00.jpg",
    );
  });

  it("handles position >= 10", () => {
    expect(buildImageFilename({ ...base, position: 12 })).toBe(
      "tulum-3rec-departamento-frente-al-mar-fb64c047-12.jpg",
    );
  });

  it("extracts png extension from URL", () => {
    expect(
      buildImageFilename({
        ...base,
        originalUrl: "https://example.com/photo.png",
      }),
    ).toBe("tulum-3rec-departamento-frente-al-mar-fb64c047-01.png");
  });

  it("extracts webp extension from URL", () => {
    expect(
      buildImageFilename({
        ...base,
        originalUrl: "https://example.com/photo.webp?w=800",
      }),
    ).toBe("tulum-3rec-departamento-frente-al-mar-fb64c047-01.webp");
  });

  it("defaults to jpg for unknown extension", () => {
    expect(
      buildImageFilename({
        ...base,
        originalUrl: "https://example.com/image",
      }),
    ).toBe("tulum-3rec-departamento-frente-al-mar-fb64c047-01.jpg");
  });

  it("handles villa type", () => {
    expect(
      buildImageFilename({
        ...base,
        propertyType: "villa",
        slugAdjective: "de-lujo",
      }),
    ).toBe("tulum-3rec-villa-de-lujo-fb64c047-01.jpg");
  });
});

describe("buildImageStoragePath", () => {
  it("builds path with id8 prefix", () => {
    expect(
      buildImageStoragePath(
        "fb64c047-1234-5678-9abc-def012345678",
        "tulum-3rec-departamento-01.jpg",
      ),
    ).toBe("fb64c047/tulum-3rec-departamento-01.jpg");
  });
});
