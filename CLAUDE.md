# MPgenesis — Marketplace inmobiliario de lead generation con SEO programático

## Qué es este proyecto

Extractor estructurado agnóstico al sitio fuente que alimenta PostgreSQL con datos de propiedades inmobiliarias y genera un marketplace multilingüe con SEO programático. **Modelo de negocio: venta de leads calificados a agentes y desarrolladores.**

Pipeline: **crawl → extracción → watermark removal → paráfrasis → traducción → publicación multilingüe**

Geografía inicial: Quintana Roo (Riviera Maya). Idiomas: ES (primario), EN, FR.

## Documentos de referencia

- **`PROJECT_CONSTITUTION.md`** — Documento original detallado (arquitectura, decisiones, stack, roadmap, costos)
- **`.specify/memory/constitution.md`** — Constitución operativa v2.0.0 (principios validados, stack actualizado, fases)

## Principios permanentes (aplican siempre, en toda fase)

1. **P1 — Los hechos NUNCA tocan el LLM.** Precio, m², recámaras, dirección, coordenadas → columnas tipadas PostgreSQL → render por template. Solo prosa descriptiva pasa por Claude. Si escribes un prompt con datos factuales, DETENTE y usa placeholders.
2. **P2 — Separación extractor vs renderizador.** Cero acoplamiento entre UX del fuente y UX del clon.
3. **P3 — YAGNI agresivo.** No implementes nada hasta que la fase anterior lo justifique con datos reales. Si está en una fase posterior, NO EXISTE aún.
4. **P4 — Idempotencia obligatoria.** `source_id + source_listing_id` como key natural + `ON CONFLICT DO UPDATE` en todos los workers.
5. **P5 — Eficiencia de tokens.** HTML limpio antes del LLM (cheerio DOM parsing). Batch API (50% off). Prompt caching (90% off).
6. **P6 — Observabilidad desde día 1.** Pino structured logging. Token tracking por job. Sentry para errores.
7. **P7 — Aprobación humana obligatoria.** Nada se publica sin review del operador.
8. **P8 — Cada listing es un funnel de leads.** Toda página publicada DEBE tener CTA (WhatsApp + formulario). Sin CTA = sin revenue.
9. **P9 — Simplicidad primero.** Equipo de 2 personas no-técnicas. Siempre elegir la opción con menos partes móviles.

## Stack principal (All-TypeScript)

| Capa | Tecnología |
| ---- | ---------- |
| Scraping | Crawlee (TS) + PlaywrightCrawler + Decodo proxies |
| Extracción T1 | cheerio + JSON.parse (JSON-LD/schema.org) |
| Extracción T2 | Claude call one-time → CSS selectors reutilizables |
| Extracción T3 | Anthropic TS SDK + Zod schemas (tool_use) |
| Watermark | IOPaint + LaMa en GPU spot (RunPod) — servicio HTTP externo |
| Paráfrasis | Claude Sonnet (Batch API) con separación facts/prose |
| Traducción | Claude Sonnet ES→EN/FR (Batch API) |
| DB | PostgreSQL + PostGIS (Supabase Pro) |
| Orquestación | BullMQ + Redis |
| Admin (fase 1-2) | Next.js route group `/admin/` + Supabase Auth |
| CMS (fase 3+) | Payload CMS (cuando se justifique) |
| Frontend | Next.js 15 App Router + shadcn/ui + Tailwind v4 |
| Blog (fase 1-2) | MDX files en el repo |
| Imágenes | Cloudflare R2 |
| Mapas | Leaflet + OpenStreetMap |
| Búsqueda | PostgreSQL FTS (fase 1) |
| SEO | DataForSEO + IndexNow + Schema.org JSON-LD |
| Testing | Vitest |
| Validación | Zod (reemplaza Pydantic) |
| Logging | Pino (structured JSON) |
| Errores | Sentry |

## Convenciones

- **Database**: snake_case
- **TypeScript vars/funciones**: camelCase
- **TypeScript tipos/componentes**: PascalCase
- **URLs**: kebab-case
- **Env vars**: SCREAMING_SNAKE_CASE
- **Zod schemas**: camelCase con sufijo Schema

## TypeScript estricto

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Estructura monorepo

```text
/apps
  /web              # Next.js 15: frontend público + /admin routes
/packages
  /database         # Drizzle schema + migrations
  /extraction       # Tier 1/2/3 extractors (all TS)
  /workers          # BullMQ workers (crawl, extract, image-processing, paraphrase, translate, publish)
  /shared           # Tipos compartidos, Zod schemas, utils
/content
  /blog             # MDX blog posts (editorial, manual)
  /guides           # MDX guías de zona/comprador (editorial, manual)
/infra
  /docker           # Dockerfiles + docker-compose
```

## Contenido: dos capas

1. **Programático** (scrapeado + parafraseado): Listings de micrositios. Volumen SEO long-tail.
2. **Editorial** (original, manual): Blog, guías de zona, reportes de mercado. Construye E-E-A-T y autoridad. DEBE existir ANTES de publicar páginas programáticas.

## Qué NO hacer

- HTML crudo al LLM (siempre limpiar con cheerio)
- Números factuales al LLM (usar placeholders)
- Python en el codebase principal (all-TypeScript)
- Opus para batch (Sonnet basta)
- Florence-2 hasta que bbox fija falle en datos reales
- Selenium, Puppeteer, o Scrapy (usar Crawlee)
- S3/CloudFront (usar R2)
- Redux/Zustand (RSC + URL state)
- CMS en fase 1-2 (Next.js admin + Supabase Auth)
- Búsqueda custom antes de PostgreSQL FTS
- Keywords SEO hardcodeadas (siempre templates + DataForSEO)
- Páginas programáticas sin CTA de lead capture
- Páginas programáticas sin link a contenido editorial

## Fases

- **Fase 1** (sem 1-4): Crawl 1 sitio → extract → DB → admin UI. NO paráfrasis/traducción/watermark/SEO.
- **Fase 2** (sem 5-8): Pipeline completo + frontend MVP + lead capture + branding.
- **Fase 3** (sem 9-12): SEO completo + operator UI + escalar a 5 sitios.
- **Fase 4** (mes 4+): 20→100+ sitios, optimización costos. Typesense, Payload CMS, self-hosted PG solo si justificado.

## Observabilidad

- Structured logging: Pino (JSON to stdout)
- Cada BullMQ job loggea: `source_id`, `crawl_run_id`, `duration_ms`, `status`
- Costos LLM por job: `input_tokens`, `output_tokens`, `cost_usd`
- Sentry para errores
