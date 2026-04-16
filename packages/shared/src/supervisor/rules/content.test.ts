import { describe, it, expect } from "vitest";
import { runContentRules } from "./content.js";
import type { StructuredContent } from "../../schemas/structured-content.js";
import type { PropertyForSupervisor } from "../property-input.js";

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  const para = (w: number) => Array(w).fill("palabra").join(" ");
  return {
    contentVersion: 2,
    hero: {
      h1: "Departamento de 2 recamaras con vista en Tulum",
      intro: `${para(150)} 80 m2 2 recamaras 2 banos $3,500,000 MXN`,
    },
    features: {
      heading: "Características",
      body: `${para(150)} 80 m2 2 recamaras 2 banos`,
    },
    location: {
      heading: "Ubicación",
      body: `${para(150)} centro de Tulum`,
    },
    lifestyle: {
      heading: "Lifestyle",
      body: `${para(100)} playa 10 min`,
    },
    faq: Array.from({ length: 6 }, (_, i) => ({
      question: `Pregunta ${i + 1}?`,
      answer: `${para(45)}`,
    })),
    metaTitle: "Depto 2 Recs en Tulum | MPgenesis",
    metaDescription: `Departamento de 2 recamaras en Tulum desde $3,500,000 MXN con vista al mar y amenidades. Agenda tu visita.${" "}`.slice(0, 155),
    ...overrides,
  };
}

function baseProp(
  content: StructuredContent | null,
  overrides: Partial<PropertyForSupervisor> = {},
): PropertyForSupervisor {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Departamento",
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
    neighborhood: null,
    address: null,
    latitude: 20.2,
    longitude: -87.45,
    contentEs: content,
    contentEn: content,
    contentFr: content,
    rawData: {},
    ...overrides,
  };
}

describe("runContentRules", () => {
  it("passes a clean content blob", () => {
    const issues = runContentRules(baseProp(makeContent()));
    // Accept specificity warnings as long as no errors
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("flags missing ES content as info (supervisor ran too early)", () => {
    const p = baseProp(null);
    p.contentEs = null;
    p.contentEn = null;
    p.contentFr = null;
    const issues = runContentRules(p);
    expect(issues.map((i) => i.rule)).toContain("content-missing-es");
  });

  it("flags unresolved FACT placeholders", () => {
    const bad = makeContent({
      hero: {
        h1: "H1 aquí",
        intro: `Departamento con {{FACT_1}} recamaras y {{FACT_2}} m2 ${"relleno ".repeat(100)}`,
      },
    });
    const issues = runContentRules(baseProp(bad));
    expect(issues.map((i) => i.rule)).toContain("unresolved-placeholders");
  });

  it("flags forbidden marketing words", () => {
    const bad = makeContent({
      hero: {
        h1: "Oportunidad única en Tulum",
        intro: `Oportunidad unica ${"relleno ".repeat(120)}`,
      },
    });
    const issues = runContentRules(baseProp(bad));
    expect(
      issues.find((i) => i.rule === "forbidden-words-present"),
    ).toBeDefined();
  });

  it("flags low word count on hero.intro", () => {
    const bad = makeContent({
      hero: { h1: "H1", intro: "Muy corto." },
    });
    const issues = runContentRules(baseProp(bad));
    const lowCounts = issues.filter(
      (i) => i.rule === "word-count-low" && i.field === "hero.intro",
    );
    expect(lowCounts.length).toBeGreaterThan(0);
  });

  it("flags FAQ count < 5", () => {
    const bad = makeContent({
      faq: [
        { question: "A?", answer: "B." },
        { question: "C?", answer: "D." },
      ],
    });
    const issues = runContentRules(baseProp(bad));
    expect(issues.map((i) => i.rule)).toContain("faq-count-low");
  });

  it("flags metaTitle too long", () => {
    const bad = makeContent({
      metaTitle:
        "Departamento muy largo que pasa los sesenta caracteres permitidos por SEO",
    });
    const issues = runContentRules(baseProp(bad));
    expect(issues.map((i) => i.rule)).toContain("meta-title-too-long");
  });

  it("flags fallback hero (prefix matches source description)", () => {
    const sourceDesc =
      "Hermoso departamento ubicado en el corazón de Tulum con vista al mar y acceso a todas las amenidades del desarrollo. Este es un texto largo de relleno que viene del source original.";
    const bad = makeContent({
      hero: {
        h1: "H1",
        intro: `${sourceDesc} ${"relleno ".repeat(100)}`,
      },
    });
    const p = baseProp(bad, { rawData: { descripcion: sourceDesc } });
    const issues = runContentRules(p);
    expect(issues.map((i) => i.rule)).toContain("hero-from-fallback");
  });
});
