import Anthropic from "@anthropic-ai/sdk";
import {
  createLogger,
  detectForbidden,
  type StructuredContent,
} from "@mpgenesis/shared";
import { splitFactsFromProse, reassembleProse } from "./prose-splitter.js";

const logger = createLogger("paraphrase");

// Sonnet pricing per 1M tokens
const SONNET_INPUT_COST = 3.0 / 1_000_000;
const SONNET_OUTPUT_COST = 15.0 / 1_000_000;

export interface ParaphraseResult {
  content: StructuredContent;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

export interface ParaphraseInputs {
  originalTitle: string;
  originalDescription: string;
  city: string;
  state: string;
  neighborhood: string | null;
  propertyType: string;
  listingType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionM2: number | null;
  // Anonimato: names + source domain the LLM must NEVER mention in output.
  developerName: string | null;
  developmentName: string | null;
  sourceDomain: string | null;
}

const SYSTEM_PROMPT = `Eres un copywriter inmobiliario senior para el mercado de la Riviera Maya (Quintana Roo, Mexico). Escribes descripciones largas y estructuradas para un marketplace de SEO programatico.

IDIOMA: Español neutro mexicano (es-MX). Si el texto fuente esta en ingles o frances, traducelo. Usa terminologia inmobiliaria mexicana (departamento, recamaras, baños, alberca, terreno).

REGLA #1 — NO INVENTES DATOS:
- NO inventes distancias específicas a la playa, aeropuerto, restaurantes, cenotes
- NO inventes metros cuadrados, precios, capacidad de huéspedes, cap rate, ROI, ocupación, ADR
- NO inventes nombres de developers, fechas de entrega, marcas de acabados (porcelanato italiano, fixtures europeos, etc.)
- NO inventes amenidades que no esten en el texto original
- Si el texto original es vago, mantente en lo general — no llenes con falsos especificos
- NO modifiques los tokens {{PLACEHOLDER}} — mantenlos exactamente igual en cualquier campo

REGLA #2 — PALABRAS PROHIBIDAS (regla anti-humo):
NUNCA uses estas palabras o frases:
- "oportunidad unica", "garantizado" (como rendimiento), "potencial ilimitado"
- "increible", "el mejor", "la mejor", "unico en su tipo", "lujo extremo"
- "imperdible", "no te lo puedes perder"
- Superlativos vacios sin respaldo factual

REGLA #3 — ESPECIFICIDAD CONCRETA:
Cuando tengas datos concretos del texto fuente, USALOS textualmente. Datos vagos < datos concretos. Si el texto dice "vista al mar", manten "vista al mar". Si dice "alberca infinity", manten ese detalle.

REGLA #4 — FORMATO MOVIL:
- Parrafos cortos: 2-3 oraciones maximo
- Front-load la informacion mas importante en la primera oracion
- Tono profesional, calido, sin clichés

REGLA #5 — ESTRUCTURA DE 5 BLOQUES:
Debes producir una respuesta usando la herramienta write_listing con TODOS los campos:

1. hero.h1: Encabezado H1 corto (60-80 chars) — ver REGLA #8 para formato
2. hero.intro: 150-200 palabras de narrativa lifestyle. Engancha al comprador. Front-load.
3. features.heading: "Caracteristicas y acabados" (o similar)
4. features.body: 150-200 palabras describiendo el espacio interior, distribucion y acabados que SI estan en el texto fuente. Si el fuente es vago, manten el contenido general.
5. location.heading: "Ubicacion y zona"
6. location.body: 150-200 palabras sobre la zona/barrio/ciudad. Puedes hablar del caracter general de la zona (ej. Tulum como destino wellness, Playa del Carmen como hub turistico) PERO sin inventar distancias especificas en metros o minutos a menos que esten en el fuente.
7. lifestyle.heading: "Lifestyle y experiencia"
8. lifestyle.body: 100-150 palabras de narrativa sensorial. Un dia tipico, sensaciones, ambiente. Sin datos numericos inventados.
9. faq: 5-8 preguntas frecuentes. Cubre ambas personas (lifestyle + inversionista). Respuestas de 40-60 palabras cada una. Usa preguntas universales que puedas responder con los datos provistos:
   - ¿Que incluye la propiedad?
   - ¿Cuantas recamaras y baños tiene?
   - ¿Donde se encuentra?
   - ¿Pueden los extranjeros comprar esta propiedad? (responde sobre fideicomiso para zona costera)
   - ¿Es buena para Airbnb / renta vacacional? (general, sin cifras inventadas)
   - ¿Que tipo de propiedad es ideal para mi? (lifestyle vs inversion)
   - Etc.
   Si no tienes el dato, NO inventes — formula la pregunta de forma que la respuesta sea informativa pero general.
10. metaTitle: MAXIMO 55 chars (deja espacio para "| MPgenesis" que agregamos despues). Ver REGLA #8 para formato.
11. metaDescription: 150-160 chars, NI UNO MAS. ESTRUCTURA OBLIGATORIA: [verbo accion] + [tipo+recs] + [ubicacion] + [precio como texto literal] + [CTA "Agenda tu visita."]

REGLA #6 — LIMPIEZA DE CONTENIDO:
- El texto fuente puede contener basura del scraping (menus, "Compare Listings", footers, cookies, listings relacionados)
- Extrae SOLO informacion relevante de la propiedad descrita
- Ignora todo lo que sea navegacion del sitio fuente

REGLA #7 — ANONIMATO OBLIGATORIO (CRITICO):
NUNCA menciones en NINGUN campo del output (hero.h1, hero.intro, features, location, lifestyle, faq, metaTitle, metaDescription):
- El nombre del desarrollo/proyecto (te paso la lista en "NOMBRES PROHIBIDOS" del mensaje de usuario)
- El nombre del desarrollador/constructor/inmobiliaria
- Nombres propios de agentes, vendedores, corredores, personas especificas
- Nombres de portales de origen (plalla.com, realty, zillow, etc.)
- Telefonos, emails, URLs, direcciones de calle especificas

En lugar de nombres propios usa SIEMPRE descriptores genericos:
- "este desarrollo" / "este proyecto residencial"
- "este condominio boutique" / "este complejo privado"
- "esta propiedad" / "el conjunto" / "la residencia"
- "la zona" en lugar de nombrar el barrio si el barrio es una marca del developer
Esta regla es innegociable. Un solo nombre propio en el output invalida toda la respuesta.

REGLA #8 — TITULOS DESCRIPTIVOS SIN NOMBRES:
hero.h1 y metaTitle deben describir la propiedad por sus atributos reales:
[tipo] + [recamaras] + [feature destacado del texto fuente: vista, amenidad, privilegio de zona] + "en" + [ciudad]

El feature destacado sale SOLO del texto fuente (vista al mar, rooftop, alberca cenote, jardin privado, etc.), no de tu imaginacion. Si el texto fuente no menciona ningun feature distintivo, usa solo tipo + recamaras + ciudad.

EJEMPLOS MALOS (con nombres propios):
- "Departamento en Preventa Lumma Habitat Tulum"
- "Penthouse Mayakana Residences Bacalar"
- "Casa en Aldea Zama - Grupo Inmobiliario X"

EJEMPLOS BUENOS (descriptivos, sin nombres):
- "Departamento de 2 Recamaras en Preventa con Alberca Cenote en Tulum"
- "Penthouse Boutique con Vista al Lagoon en Bacalar"
- "Casa de 4 Recamaras en Comunidad Privada en Playa del Carmen"
- "Studio Amueblado con Rooftop en Playa del Carmen"

metaTitle puede incluir "| MPgenesis" al final si cabe.`;

export async function paraphraseProperty(
  inputs: ParaphraseInputs,
): Promise<ParaphraseResult> {
  // P1: Split facts from prose so the LLM never touches numbers/coordinates
  const { textWithPlaceholders, facts } = splitFactsFromProse(
    inputs.originalDescription,
  );

  const client = new Anthropic();

  const userMessage = buildUserMessage(inputs, textWithPlaceholders);
  let response = await callClaude(client, userMessage);
  let parsed = extractToolInput(response);
  if (!parsed) {
    logger.warn(
      { propertyTitle: inputs.originalTitle },
      "Paraphrase: no tool_use in first response, using raw fallback",
    );
    parsed = buildFallback(inputs, textWithPlaceholders);
  }

  // P1: Reassemble factual placeholders BEFORE forbidden-word check, so the
  // check sees the final text the user will read.
  let content = reassembleStructured(parsed, facts);

  // Forbidden words check + ONE retry with stronger instruction.
  // Includes the static anti-humo list AND the dynamic prohibited names
  // (developer, development, source domain).
  const prohibitedNames = collectProhibitedNames(inputs);
  const violations = detectForbiddenAcrossContent(content, prohibitedNames);
  let inputTokens = response.usage.input_tokens;
  let outputTokens = response.usage.output_tokens;
  if (violations.length > 0) {
    logger.warn(
      { propertyTitle: inputs.originalTitle, violations },
      "Paraphrase: forbidden words/names detected, retrying once",
    );
    const retryMessage = `${userMessage}\n\nIMPORTANTE: Tu intento anterior contenia las siguientes palabras o NOMBRES PROHIBIDOS: ${violations.join(", ")}. Reescribe TODO el contenido eliminando COMPLETAMENTE estas palabras y sus variantes. Usa descriptores genericos como "este desarrollo" o "esta propiedad" en su lugar. No los uses bajo ninguna circunstancia, ni siquiera como parte de una frase.`;
    response = await callClaude(client, retryMessage);
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    const retryParsed = extractToolInput(response);
    if (retryParsed) {
      const retryContent = reassembleStructured(retryParsed, facts);
      const retryViolations = detectForbiddenAcrossContent(
        retryContent,
        prohibitedNames,
      );
      if (retryViolations.length === 0) {
        content = retryContent;
      } else if (retryViolations.length < violations.length) {
        // Retry reduced violations but didn't eliminate them — take the
        // retry because it's strictly better than the first attempt.
        logger.warn(
          { propertyTitle: inputs.originalTitle, retryViolations },
          "Paraphrase: retry reduced violations but did not eliminate them",
        );
        content = retryContent;
      } else {
        // Retry is equal or worse than the first attempt — keep the
        // original content (which is the current value of `content`).
        logger.warn(
          {
            propertyTitle: inputs.originalTitle,
            firstViolations: violations,
            retryViolations,
          },
          "Paraphrase: retry no better than first attempt, keeping first",
        );
      }
    }
  }

  // Word-count warnings (non-fatal)
  validateWordCounts(content, inputs.originalTitle);

  const costUsd =
    inputTokens * SONNET_INPUT_COST + outputTokens * SONNET_OUTPUT_COST;

  logger.info(
    {
      inputTokens,
      outputTokens,
      costUsd: costUsd.toFixed(4),
      faqCount: content.faq.length,
    },
    "Paraphrase complete",
  );

  return {
    content,
    usage: { inputTokens, outputTokens, costUsd },
  };
}

/** Collect the dynamic list of proper names the LLM must NEVER mention
 * in the output. Includes developer name, development name, source
 * domain (e.g. "plalla.com"), and — defensively — the original title if
 * we suspect it contains a proper name that should be anonymized.
 */
function collectProhibitedNames(inputs: ParaphraseInputs): string[] {
  const list: string[] = [];
  if (inputs.developerName) list.push(inputs.developerName);
  if (inputs.developmentName) list.push(inputs.developmentName);
  if (inputs.sourceDomain) {
    list.push(inputs.sourceDomain);
    // Also add the domain without the TLD (e.g. "plalla" from "plalla.com")
    const root = inputs.sourceDomain.split(".")[0];
    if (root && root.length > 3) list.push(root);
  }
  return list;
}

function buildUserMessage(
  inputs: ParaphraseInputs,
  textWithPlaceholders: string,
): string {
  const facts: string[] = [
    `TIPO: ${inputs.propertyType}`,
    `OPERACION: ${inputs.listingType}`,
    `CIUDAD: ${inputs.city}`,
    `ESTADO: ${inputs.state}`,
  ];
  if (inputs.neighborhood) facts.push(`BARRIO: ${inputs.neighborhood}`);
  if (inputs.bedrooms) facts.push(`RECAMARAS: ${inputs.bedrooms}`);
  if (inputs.bathrooms) facts.push(`BAÑOS: ${inputs.bathrooms}`);
  if (inputs.constructionM2)
    facts.push(`CONSTRUCCION (m2): ${inputs.constructionM2}`);

  const prohibited = collectProhibitedNames(inputs);
  const prohibitedSection =
    prohibited.length > 0
      ? `\nNOMBRES PROHIBIDOS (NO USAR EN NINGUN CAMPO, NI SIQUIERA COMO PARTE DE UNA FRASE O SUGERENCIA):
${prohibited.map((n) => `- "${n}"`).join("\n")}

Estos nombres aparecen en el texto fuente pero NO deben aparecer en tu output. Referite a la propiedad con descriptores genericos como "este desarrollo", "este proyecto", "esta propiedad", "el conjunto". Reemplaza cualquier referencia al nombre del barrio si el barrio es una marca propietaria del developer.
`
      : "";

  return `Reescribe esta propiedad usando la herramienta write_listing. Manten todos los tokens {{PLACEHOLDER}} intactos.
${prohibitedSection}
CONTEXTO FACTUAL (usalo, no lo inventes):
${facts.join("\n")}

TITULO ORIGINAL (contiene nombres prohibidos que debes omitir):
${inputs.originalTitle}

TEXTO ORIGINAL (con placeholders factuales):
${textWithPlaceholders}`;
}

async function callClaude(
  client: Anthropic,
  userMessage: string,
): Promise<Anthropic.Messages.Message> {
  return await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [WRITE_LISTING_TOOL],
    tool_choice: { type: "tool", name: "write_listing" },
    messages: [{ role: "user", content: userMessage }],
  });
}

const WRITE_LISTING_TOOL: Anthropic.Messages.Tool = {
  name: "write_listing",
  description:
    "Escribe el listado estructurado de propiedad en 5 bloques + FAQ + meta tags",
  input_schema: {
    type: "object",
    properties: {
      heroH1: { type: "string", description: "H1 corto, 60-80 chars" },
      heroIntro: {
        type: "string",
        description: "Narrativa lifestyle, 150-200 palabras",
      },
      featuresHeading: { type: "string" },
      featuresBody: {
        type: "string",
        description: "Caracteristicas y acabados, 150-200 palabras",
      },
      locationHeading: { type: "string" },
      locationBody: {
        type: "string",
        description:
          "Ubicacion y zona, 150-200 palabras (sin inventar distancias)",
      },
      lifestyleHeading: { type: "string" },
      lifestyleBody: {
        type: "string",
        description: "Lifestyle y experiencia, 100-150 palabras",
      },
      faq: {
        type: "array",
        description: "5-8 preguntas frecuentes",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: {
              type: "string",
              description: "Respuesta de 40-60 palabras",
            },
          },
          required: ["question", "answer"],
        },
      },
      metaTitle: { type: "string", description: "50-60 chars" },
      metaDescription: {
        type: "string",
        description: "150-160 chars con precio+CTA",
      },
    },
    required: [
      "heroH1",
      "heroIntro",
      "featuresHeading",
      "featuresBody",
      "locationHeading",
      "locationBody",
      "lifestyleHeading",
      "lifestyleBody",
      "faq",
      "metaTitle",
      "metaDescription",
    ],
  },
};

interface RawToolInput {
  heroH1: string;
  heroIntro: string;
  featuresHeading: string;
  featuresBody: string;
  locationHeading: string;
  locationBody: string;
  lifestyleHeading: string;
  lifestyleBody: string;
  faq: Array<{ question: string; answer: string }>;
  metaTitle: string;
  metaDescription: string;
}

function extractToolInput(
  response: Anthropic.Messages.Message,
): RawToolInput | null {
  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") return null;
  const input = toolBlock.input as Record<string, unknown>;
  // Minimal shape check
  if (
    typeof input["heroH1"] !== "string" ||
    typeof input["heroIntro"] !== "string" ||
    typeof input["featuresBody"] !== "string" ||
    typeof input["locationBody"] !== "string" ||
    typeof input["lifestyleBody"] !== "string" ||
    !Array.isArray(input["faq"])
  ) {
    return null;
  }
  return {
    heroH1: String(input["heroH1"]),
    heroIntro: String(input["heroIntro"]),
    featuresHeading: String(input["featuresHeading"] ?? "Características"),
    featuresBody: String(input["featuresBody"]),
    locationHeading: String(input["locationHeading"] ?? "Ubicación"),
    locationBody: String(input["locationBody"]),
    lifestyleHeading: String(input["lifestyleHeading"] ?? "Lifestyle"),
    lifestyleBody: String(input["lifestyleBody"]),
    faq: (input["faq"] as Array<Record<string, unknown>>)
      .map((f) => ({
        question: String(f["question"] ?? ""),
        answer: String(f["answer"] ?? ""),
      }))
      .filter((f) => f.question && f.answer),
    metaTitle: String(input["metaTitle"] ?? ""),
    metaDescription: String(input["metaDescription"] ?? ""),
  };
}

function reassembleStructured(
  raw: RawToolInput,
  facts: Record<string, string>,
): StructuredContent {
  const r = (s: string) => reassembleProse(s, facts);
  return {
    contentVersion: 2,
    hero: {
      h1: r(raw.heroH1),
      intro: r(raw.heroIntro),
    },
    features: {
      heading: r(raw.featuresHeading),
      body: r(raw.featuresBody),
    },
    location: {
      heading: r(raw.locationHeading),
      body: r(raw.locationBody),
    },
    lifestyle: {
      heading: r(raw.lifestyleHeading),
      body: r(raw.lifestyleBody),
    },
    faq: raw.faq.map((f) => ({
      question: r(f.question),
      answer: r(f.answer),
    })),
    metaTitle: r(raw.metaTitle),
    metaDescription: r(raw.metaDescription),
  };
}

function buildFallback(
  inputs: ParaphraseInputs,
  textWithPlaceholders: string,
): RawToolInput {
  return {
    heroH1: inputs.originalTitle,
    heroIntro: textWithPlaceholders.slice(0, 600),
    featuresHeading: "Características",
    featuresBody: textWithPlaceholders.slice(600, 1200),
    locationHeading: "Ubicación",
    locationBody: `${inputs.city}, ${inputs.state}.`,
    lifestyleHeading: "Lifestyle",
    lifestyleBody: "",
    faq: [],
    metaTitle: inputs.originalTitle.slice(0, 60),
    metaDescription: textWithPlaceholders.slice(0, 160),
  };
}

function concatContent(content: StructuredContent): string {
  return [
    content.hero.h1,
    content.hero.intro,
    content.features.body,
    content.location.body,
    content.lifestyle.body,
    content.metaTitle,
    content.metaDescription,
    ...content.faq.flatMap((f) => [f.question, f.answer]),
  ].join("\n");
}

function detectForbiddenAcrossContent(
  content: StructuredContent,
  prohibitedNames: string[] = [],
): string[] {
  const all = concatContent(content);
  const staticViolations = detectForbidden(all, "es");
  const dynamicViolations = detectProhibitedNames(all, prohibitedNames);
  return [...staticViolations, ...dynamicViolations];
}

/** Case-insensitive, accent-folded substring match for the dynamic
 * suppress list (developer name, development name, source domain).
 * Returns the list of names found in the text.
 */
function detectProhibitedNames(
  text: string,
  names: string[],
): string[] {
  if (names.length === 0) return [];
  const haystack = foldAccents(text.toLowerCase());
  const found: string[] = [];
  for (const name of names) {
    if (!name || name.length < 3) continue;
    const needle = foldAccents(name.toLowerCase());
    if (haystack.includes(needle)) {
      found.push(name);
    }
  }
  return found;
}

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function validateWordCounts(
  content: StructuredContent,
  propertyTitle: string,
): void {
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const checks: Array<{ name: string; words: number; min: number; max: number }> = [
    { name: "hero.intro", words: wc(content.hero.intro), min: 100, max: 250 },
    {
      name: "features.body",
      words: wc(content.features.body),
      min: 100,
      max: 250,
    },
    {
      name: "location.body",
      words: wc(content.location.body),
      min: 100,
      max: 250,
    },
    {
      name: "lifestyle.body",
      words: wc(content.lifestyle.body),
      min: 70,
      max: 200,
    },
  ];
  for (const c of checks) {
    if (c.words < c.min || c.words > c.max) {
      logger.warn(
        { propertyTitle, block: c.name, words: c.words, min: c.min, max: c.max },
        "Paraphrase: word count out of target range",
      );
    }
  }
  if (content.faq.length < 5 || content.faq.length > 8) {
    logger.warn(
      { propertyTitle, faqCount: content.faq.length },
      "Paraphrase: FAQ count out of target range (5-8)",
    );
  }
  if (content.metaTitle.length > 60) {
    logger.warn(
      { propertyTitle, metaTitleLen: content.metaTitle.length },
      "Paraphrase: metaTitle > 60 chars",
    );
  }
  if (content.metaDescription.length > 160) {
    logger.warn(
      { propertyTitle, metaDescLen: content.metaDescription.length },
      "Paraphrase: metaDescription > 160 chars",
    );
  }
}
