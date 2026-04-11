import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "@mpgenesis/shared";
import { splitFactsFromProse, reassembleProse } from "./prose-splitter.js";

const logger = createLogger("paraphrase");

// Sonnet pricing per 1M tokens
const SONNET_INPUT_COST = 3.0 / 1_000_000;
const SONNET_OUTPUT_COST = 15.0 / 1_000_000;

export interface ParaphraseResult {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

const SYSTEM_PROMPT = `Eres un copywriter inmobiliario profesional para el mercado de la Riviera Maya en Mexico. Tu trabajo es reescribir descripciones de propiedades para que sean unicas, atractivas y optimizadas para SEO.

IDIOMA DE SALIDA OBLIGATORIO: ESPAÑOL (es-MX)
- TODOS los campos del JSON deben estar escritos en español neutro mexicano
- Si el texto original esta en ingles o frances, TRADUCELO al español al reescribirlo
- Usa terminologia inmobiliaria comun en Mexico (departamento, recamaras, baños, terreno, alberca)

INSTRUCCIONES:
1. NO agregues informacion que no este en el texto original
2. NO inventes amenidades, caracteristicas o features
3. NO modifiques los tokens {{PLACEHOLDER}} — mantenlos exactamente igual
4. NO agregues opiniones subjetivas sobre el vecindario o el mercado
5. NO uses superlativos a menos que el texto original los use
6. SI puedes reorganizar parrafos para mejor flujo
7. SI puedes mejorar gramatica y legibilidad
8. SI puedes usar sinonimos manteniendo el significado
9. El tono debe ser profesional, lujoso e invitante
10. NO incluyas mensajes de cookies, formularios de login, "Compare Listings", footers, ni avisos legales del sitio fuente

LIMPIEZA DE CONTENIDO:
- El texto original puede contener basura del scraping (menus, listings relacionados, avisos de cookies, etc.)
- Extrae SOLO la informacion relevante de la propiedad descrita
- Ignora secciones de "Similar Properties", "Compare Listings", login, cookies, footers

Debes responder con un objeto JSON con estos campos (TODOS en español):
- title: Titulo reescrito (50-60 caracteres) en español
- description: Descripcion reescrita en español (3-6 parrafos limpios)
- metaTitle: Meta titulo SEO (50-60 caracteres) en español
- metaDescription: Meta descripcion SEO (120-160 caracteres) en español
- h1: Encabezado H1 de la pagina en español

Responde SOLO con el JSON, sin markdown, sin explicaciones.`;

export async function paraphraseProperty(
  originalTitle: string,
  originalDescription: string,
  city: string,
  propertyType: string,
): Promise<ParaphraseResult> {
  // P1: Split facts from prose
  const { textWithPlaceholders, facts } =
    splitFactsFromProse(originalDescription);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Rewrite this property listing. Keep all {{PLACEHOLDER}} tokens intact.

ORIGINAL TITLE: ${originalTitle}

ORIGINAL DESCRIPTION:
${textWithPlaceholders}

PROPERTY TYPE: ${propertyType}
CITY: ${city}

Respond with JSON only, no markdown.`,
      },
    ],
  });

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd =
    inputTokens * SONNET_INPUT_COST + outputTokens * SONNET_OUTPUT_COST;

  // Parse response
  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  let parsed: Record<string, string>;
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn({ text: text.slice(0, 200) }, "Failed to parse LLM JSON, using fallback");
    parsed = {
      title: originalTitle,
      description: textWithPlaceholders,
      metaTitle: originalTitle.slice(0, 60),
      metaDescription: textWithPlaceholders.slice(0, 160),
      h1: originalTitle,
    };
  }

  // P1: Reassemble facts into paraphrased prose
  const result: ParaphraseResult = {
    title: reassembleProse(parsed["title"] ?? originalTitle, facts),
    description: reassembleProse(
      parsed["description"] ?? textWithPlaceholders,
      facts,
    ),
    metaTitle: reassembleProse(
      parsed["metaTitle"] ?? originalTitle.slice(0, 60),
      facts,
    ),
    metaDescription: reassembleProse(
      parsed["metaDescription"] ?? textWithPlaceholders.slice(0, 160),
      facts,
    ),
    h1: reassembleProse(parsed["h1"] ?? originalTitle, facts),
    usage: { inputTokens, outputTokens, costUsd },
  };

  logger.info(
    { inputTokens, outputTokens, costUsd: costUsd.toFixed(4) },
    "Paraphrase complete",
  );

  return result;
}
