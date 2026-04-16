/** Rubric used by the LLM-as-judge to score descriptions against the
 * Propyte Manual de Descripciones.
 *
 * This rubric is the STRUCTURED form of the manual — it tells the judge
 * what dimensions to score and how. The manual itself (see
 * `docs/manual-descripciones.md` when available) is the source of truth; this
 * file just encodes the scoring surface.
 *
 * Until the manual file exists, this rubric is derived from:
 *   - packages/workers/paraphrase/src/paraphrase.ts SYSTEM_PROMPT (8 rules)
 *   - packages/shared/src/schemas/structured-content.ts block targets
 *   - packages/shared/src/seo/forbidden-words.ts anti-humo lists
 *
 * Bump SUPERVISOR_CHECK_VERSION in schemas/supervisor.ts when this rubric
 * materially changes so the nightly cron re-evaluates prior runs.
 */

export const RUBRIC_DIMENSIONS = [
  {
    key: "adherenceManual",
    label: "Adherencia al manual Propyte",
    weight: 0.3,
    description:
      "Sigue la estructura de 5 bloques (hero, features, location, lifestyle, FAQ). Bloques en rangos de palabras correctos. Tono mexicano neutro. Front-load en hero.intro.",
  },
  {
    key: "specificity",
    label: "Especificidad concreta",
    weight: 0.25,
    description:
      "Usa datos concretos del fuente (m2, recámaras, amenidades específicas, vistas). Penaliza genérico/relleno. Penaliza superlativos vacíos sin respaldo factual.",
  },
  {
    key: "contentScore",
    label: "Calidad editorial",
    weight: 0.25,
    description:
      "Prosa natural, párrafos cortos (2-3 oraciones), sin repetición entre bloques, FAQ útiles que responden con los datos disponibles. Sin clichés.",
  },
  {
    key: "leadConversionPotential",
    label: "Potencial de conversión a lead",
    weight: 0.2,
    description:
      "Gancha al comprador lifestyle o inversor. metaDescription incluye precio y CTA. hero.h1 descriptivo por atributos (no nombre). FAQ anticipan objeciones de compra.",
  },
] as const;

export const RUBRIC_WEIGHTS = Object.fromEntries(
  RUBRIC_DIMENSIONS.map((d) => [d.key, d.weight]),
);

export const JUDGE_SYSTEM_PROMPT = `Eres un editor senior del marketplace inmobiliario MPgenesis para Quintana Roo. Tu tarea es evaluar descripciones de propiedades generadas por el pipeline de paraphrase+translate contra el Manual Propyte de Descripciones y asignar scores 0-100 por dimensión.

CONTEXTO DEL PROYECTO (no se discute, solo se verifica adherencia):
- Público objetivo: compradores lifestyle (expats, inversores Airbnb) e inversores de patrimonio
- Idioma primario ES-MX; debe ser natural, no traducción robótica
- ANONIMATO: NUNCA mencionar nombres propios de developers, desarrollos, portales, agentes
- Sin datos inventados (distancias, cap rates, fechas de entrega, marcas de acabados)
- Sin palabras prohibidas anti-humo (oportunidad única, garantizado, increíble, el mejor, lujo extremo, etc.)

DIMENSIONES QUE DEBES SCORERE (0-100 cada una):

1. adherenceManual (30% peso): Sigue la estructura 5 bloques + FAQ + meta. Bloques en rangos de palabras (hero 150-200, features 150-200, location 150-200, lifestyle 100-150, FAQ 5-8 preguntas de 40-60 palabras, metaTitle ≤60 chars, metaDescription 150-160 chars con precio+CTA).

2. specificity (25%): ¿Usa datos concretos del fuente o es genérico? Presencia de m2, recámaras, amenidades específicas, ubicación clara, precio. Penaliza "hermoso departamento con todas las comodidades" (generic) y premia "departamento de 2 recámaras, 80 m2, con rooftop y alberca cenote" (específico).

3. contentScore (25%): Calidad editorial. Párrafos cortos, sin repetición cross-block, FAQ útiles, sin clichés, tono profesional cálido. Penaliza prosa mecánica o repetitiva.

4. leadConversionPotential (20%): ¿La descripción convierte visitante a lead? metaDescription con precio+CTA, hero.h1 por atributos no por marca, FAQ anticipan objeciones reales (fideicomiso, ROI, Airbnb, ubicación).

REGLAS DE SCORING:
- 90-100: Excelente, listo para publicar
- 75-89: Bueno, menores mejoras posibles
- 60-74: Aceptable pero con brechas claras (flaggear issues específicos)
- 40-59: Pobre, necesita re-paraphrase
- 0-39: Inaceptable, bloquear

Además, emite un array "issues" con cualquier problema concreto detectado (cliché, FAQ vaga, repetición, bloque débil) usando el shape:
{ category: "content", rule: "<kebab-case-rule>", severity: "error"|"warning"|"info", field?: string, message: string, evidence?: any }

factualScore es SIEMPRE 100 salvo que detectes un hecho inventado (distancia especifica fabricada, marca inventada, cifra no respaldada).

Escribe "summary" en ≤ 200 caracteres, en español, que el operador lee para decidir si revisa este listing.

Usa la herramienta judge_listing_quality para estructurar la respuesta.`;

export const JUDGE_TOOL = {
  name: "judge_listing_quality",
  description:
    "Evalúa la calidad de una descripción de listing inmobiliario contra el manual Propyte",
  input_schema: {
    type: "object" as const,
    properties: {
      factualScore: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description:
          "Score de veracidad factual 0-100. 100 = nada inventado; <100 = se detectó invención",
      },
      contentScore: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Calidad editorial 0-100",
      },
      adherenceManual: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Adherencia al manual Propyte 0-100",
      },
      specificity: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Especificidad vs generico 0-100",
      },
      leadConversionPotential: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Potencial de conversión a lead 0-100",
      },
      issues: {
        type: "array",
        description: "Issues concretos detectados",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["content", "factual"] },
            rule: { type: "string" },
            severity: {
              type: "string",
              enum: ["error", "warning", "info"],
            },
            field: { type: "string" },
            locale: { type: "string", enum: ["es", "en", "fr"] },
            message: { type: "string" },
            evidence: {},
          },
          required: ["category", "rule", "severity", "message"],
        },
      },
      summary: {
        type: "string",
        maxLength: 400,
        description: "≤200 chars, español, para el operador",
      },
    },
    required: [
      "factualScore",
      "contentScore",
      "adherenceManual",
      "specificity",
      "leadConversionPotential",
      "issues",
      "summary",
    ],
  },
};
