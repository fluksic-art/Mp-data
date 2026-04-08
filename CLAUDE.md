# MPgenesis — Sistema de clonación de marketplaces inmobiliarios con SEO programático

## Qué es este proyecto

Extractor estructurado agnóstico al sitio fuente que alimenta PostgreSQL con datos de propiedades inmobiliarias y genera un marketplace multilingüe con SEO programático.

Pipeline: **crawl → extracción → watermark removal → paráfrasis → traducción → publicación multilingüe**

Geografía inicial: Quintana Roo (Riviera Maya). Idiomas: ES (primario), EN, FR.

## Documento de referencia

**Lee `PROJECT_CONSTITUTION.md` para contexto completo** — arquitectura, decisiones técnicas, stack, roadmap, costos. Este archivo es el resumen operativo.

## Principios innegociables

1. **Los hechos NUNCA tocan el LLM.** Precio, m², recámaras, dirección, coordenadas → columnas tipadas PostgreSQL → render por template. Solo la prosa descriptiva pasa por Claude. Si escribes un prompt con datos factuales, DETENTE y usa placeholders.
2. **Separación extractor vs renderizador.** Cero acoplamiento entre UX del fuente y UX del clon.
3. **Watermark removal desacoplado.** Subsistema independiente con bbox fija por sitio.
4. **YAGNI agresivo.** No implementes Florence-2, Typesense, ni self-hosted Postgres hasta que la fase anterior lo justifique con datos reales.
5. **Eficiencia de tokens.** HTML limpio antes del LLM (Crawl4AI FitMarkdown). Batch API (50% off). Prompt caching (90% off).
6. **Idempotencia obligatoria.** `source_id + source_listing_id` como key natural + `ON CONFLICT DO UPDATE` en todos los workers.

## Stack principal

| Capa | Tecnología |
|------|-----------|
| Scraping | Crawlee (TS) + PlaywrightCrawler + Decodo proxies |
| Extracción | extruct (Tier 1) → Crawl4AI (Tier 2) → instructor + Haiku (Tier 3) |
| Watermark | IOPaint + LaMa en GPU spot (RunPod) |
| Paráfrasis | Claude Sonnet (Batch API) con separación facts/prose |
| Traducción | Claude Sonnet ES→EN/FR (Batch API) |
| DB | PostgreSQL + PostGIS (Supabase Pro) |
| Orquestación | BullMQ + Redis |
| CMS | Payload CMS |
| Frontend | Next.js 15 App Router + shadcn/ui + Tailwind v4 |
| Imágenes | Cloudflare R2 |
| Mapas | Leaflet + OpenStreetMap |
| Búsqueda | PostgreSQL FTS (fase 1) |
| SEO | DataForSEO + IndexNow + Schema.org JSON-LD |

## Convenciones

- **Database**: snake_case
- **TypeScript**: camelCase vars/funciones, PascalCase tipos/componentes
- **Python**: snake_case (PascalCase classes)
- **URLs**: kebab-case
- **Env vars**: SCREAMING_SNAKE_CASE

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

```
/apps
  /web              # Next.js 15 frontend público
  /admin            # UI operador (Payload)
/packages
  /database         # Schema + migrations
  /extraction       # Tier 1/2/3 extractors (Python)
  /paraphrase       # Prompts + validation (Python)
  /workers          # BullMQ workers (crawl, extract, image-processing, paraphrase, translate, publish)
  /shared-types     # Tipos compartidos TS
/infra
  /docker           # Dockerfiles + docker-compose
```

## Qué NO hacer

- ✗ HTML crudo al LLM (siempre pre-limpiar)
- ✗ Números factuales al LLM (usar placeholders)
- ✗ Opus para batch (Sonnet basta)
- ✗ Florence-2 hasta que bbox fija falle en datos reales
- ✗ Selenium, Puppeteer, o Scrapy (usar Crawlee)
- ✗ S3/CloudFront (usar R2)
- ✗ Redux/Zustand (RSC + URL state)
- ✗ Auth custom en admin (Payload built-in o Supabase Auth)
- ✗ Búsqueda custom antes de PostgreSQL FTS
- ✗ Keywords SEO hardcodeadas (siempre templates + DataForSEO)

## Observabilidad

- Structured logging: Pino (TS), structlog (Python)
- Cada BullMQ job loggea: `source_id`, `crawl_run_id`, `duration_ms`, `status`
- Costos LLM por job: `input_tokens`, `output_tokens`, `cost_usd`
- Sentry para errores
