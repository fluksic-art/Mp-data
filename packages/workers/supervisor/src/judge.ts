import Anthropic from "@anthropic-ai/sdk";
import {
  JUDGE_SYSTEM_PROMPT,
  JUDGE_TOOL,
  supervisorJudgeOutputSchema,
  createLogger,
  type PropertyForSupervisor,
  type SupervisorJudgeOutput,
} from "@mpgenesis/shared";
import type { StructuredContent } from "@mpgenesis/shared";

const logger = createLogger("supervisor-judge");

// Haiku 4.5 pricing per 1M tokens (USD)
const HAIKU_INPUT_COST = 1.0 / 1_000_000;
const HAIKU_OUTPUT_COST = 5.0 / 1_000_000;
const HAIKU_CACHE_WRITE_COST = 1.25 / 1_000_000;
const HAIKU_CACHE_READ_COST = 0.1 / 1_000_000;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export interface JudgeResult {
  output: SupervisorJudgeOutput;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
  };
}

export interface JudgeInputs {
  property: PropertyForSupervisor;
  content: StructuredContent;
  manualMarkdown: string | null;
}

export async function judgeListing(
  inputs: JudgeInputs,
): Promise<JudgeResult> {
  const client = new Anthropic();
  const userMessage = buildUserMessage(inputs);

  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: JUDGE_SYSTEM_PROMPT },
  ];
  if (inputs.manualMarkdown) {
    systemBlocks.push({
      type: "text",
      text: `\n\n=== MANUAL PROPYTE DE DESCRIPCIONES ===\n${inputs.manualMarkdown}`,
      cache_control: { type: "ephemeral" },
    });
  } else {
    systemBlocks[0]!.cache_control = { type: "ephemeral" };
  }

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system: systemBlocks,
    tools: [JUDGE_TOOL as Anthropic.Messages.Tool],
    tool_choice: { type: "tool", name: "judge_listing_quality" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Judge did not return a tool_use block");
  }

  const parsed = supervisorJudgeOutputSchema.safeParse(toolBlock.input);
  if (!parsed.success) {
    logger.error(
      { raw: toolBlock.input, error: parsed.error.format() },
      "Judge output failed Zod validation",
    );
    throw new Error("Judge output did not match schema");
  }

  const usage = response.usage;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const costUsd =
    inputTokens * HAIKU_INPUT_COST +
    outputTokens * HAIKU_OUTPUT_COST +
    cacheReadTokens * HAIKU_CACHE_READ_COST +
    cacheWriteTokens * HAIKU_CACHE_WRITE_COST;

  return {
    output: parsed.data,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd,
    },
  };
}

function buildUserMessage(inputs: JudgeInputs): string {
  const p = inputs.property;
  const c = inputs.content;

  const facts: string[] = [
    `TIPO: ${p.propertyType}`,
    `OPERACION: ${p.listingType}`,
    `CIUDAD: ${p.city}`,
    `ESTADO: ${p.state}`,
  ];
  if (p.neighborhood) facts.push(`BARRIO: ${p.neighborhood}`);
  if (p.bedrooms) facts.push(`RECAMARAS: ${p.bedrooms}`);
  if (p.bathrooms) facts.push(`BANOS: ${p.bathrooms}`);
  if (p.constructionM2) facts.push(`CONSTRUCCION: ${p.constructionM2} m2`);
  if (p.landM2) facts.push(`TERRENO: ${p.landM2} m2`);
  if (p.priceCents && p.currency) {
    facts.push(
      `PRECIO: $${(p.priceCents / 100).toLocaleString("es-MX")} ${p.currency}`,
    );
  }

  return `Evalúa el siguiente listing ES contra el manual Propyte y la rúbrica. Usa la herramienta judge_listing_quality.

=== DATOS FACTUALES DE REFERENCIA ===
${facts.join("\n")}

=== CONTENIDO GENERADO (ES) ===
# ${c.hero.h1}

## Hero intro
${c.hero.intro}

## ${c.features.heading}
${c.features.body}

## ${c.location.heading}
${c.location.body}

## ${c.lifestyle.heading}
${c.lifestyle.body}

## FAQ (${c.faq.length} preguntas)
${c.faq.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join("\n\n")}

## SEO
metaTitle (${c.metaTitle.length} chars): ${c.metaTitle}
metaDescription (${c.metaDescription.length} chars): ${c.metaDescription}

=== INSTRUCCIONES ===
- Verifica que los facts del contenido coincidan con los DATOS FACTUALES DE REFERENCIA
- Si detectas un hecho inventado que NO esté en los DATOS FACTUALES ni en el fuente original, baja factualScore y agrega un issue category=factual
- Sé estricto con superlativos vacíos, clichés y contenido genérico
- Emite los scores usando la herramienta`;
}

export async function loadManual(
  manualPath?: string,
): Promise<string | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const candidates: string[] = [];
  if (manualPath) candidates.push(path.resolve(process.cwd(), manualPath));
  // Walk up from this file's location looking for docs/manual-descripciones.md.
  // packages/workers/supervisor/src/judge.ts → repo root is 5 levels up
  // at runtime (dist/judge.js may be 4 levels). Walk up until we find it.
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 8; i += 1) {
    candidates.push(path.join(dir, "docs", "manual-descripciones.md"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Also try CWD as last resort
  candidates.push(path.resolve(process.cwd(), "docs/manual-descripciones.md"));

  for (const c of candidates) {
    try {
      return await fs.readFile(c, "utf8");
    } catch {
      // try next
    }
  }
  return null;
}
