<!--
Sync Impact Report
==================
Version change: 1.0.0 → 2.0.0 (major restructure)

Modified principles:
  - P5 "Token Efficiency" → updated: removed Crawl4AI FitMarkdown
    reference (Python), now generic "clean HTML before LLM"
  - P7 "Observability" → updated: removed structlog (Python),
    now Pino-only (all-TS stack)

Added sections:
  - Section 0: Mission & Business Model (lead gen)
  - P8: Every Listing is a Lead Funnel
  - P9: Simplicity-First (2-person team constraint)
  - Section 2.1: Content Strategy (programmatic vs editorial)
  - Section 6: Phase-Gated Capabilities
  - Section 7: Team & Complexity Budget

Removed sections:
  - Python conventions (all-TS stack)
  - Payload CMS from phase 1-2 stack
  - Python from extraction stack (replaced with TS equivalents)

Renamed sections:
  - "Technology Stack" → "Technology Stack (All-TypeScript)"

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ updated
  - .specify/templates/spec-template.md ✅ updated
  - .specify/templates/tasks-template.md ✅ updated
  - .specify/templates/commands/constitution.md ✅ updated

Follow-up TODOs: None
-->

# MPgenesis — Project Constitution

> Governing principles and development guidelines for MPgenesis,
> a real estate marketplace clone system for lead generation in
> the Mexican market. This document is the authoritative source
> for architectural decisions, coding standards, and quality gates.
> All implementation work MUST comply with the permanent principles.
> Phase-gated capabilities apply only in their designated phase.

**Version**: 2.0.0
**Ratification date**: 2026-04-08
**Last amended**: 2026-04-08

---

## 0. Mission & Business Model

### What MPgenesis is

An extraction pipeline that scrapes Mexican real estate listings,
enriches them with original contextual content, and publishes a
multilingual marketplace (ES/EN/FR) optimized for organic traffic
in the Riviera Maya market.

### Business model: Lead Generation

Revenue comes from selling qualified buyer leads to real estate
agents and developers. Every architectural decision MUST be
evaluated against this question: **does this help capture or
qualify more leads?**

Lead flow:

```text
Organic traffic (SEO) → Listing page → CTA (WhatsApp / form)
  → Lead captured in DB → Sold to agent/developer
```

### Content strategy: two layers

1. **Programmatic microsites** (scraped + paraphrased): Property
   listings extracted from source sites, paraphrased to avoid
   duplicate content penalties, enriched with structured data.
   These are the volume play for long-tail SEO.

2. **Editorial content** (original, manual): Blog posts, zone
   guides, market reports, buyer guides. Written by humans, NOT
   generated from scraped content. These build E-E-A-T, domain
   authority, and trust. They link to microsites (hub-and-spoke)
   and provide the original value that justifies the site's
   existence to Google.

**Rule**: Programmatic pages MUST link to editorial content.
Editorial content MUST exist before any programmatic page is
indexed. A site with only paraphrased listings and zero original
content WILL be penalized.

### Target user

Foreign buyers (US, Canada, France) and Mexican investors looking
for property in Quintana Roo (Riviera Maya). Primary language
discovery: EN/FR for foreigners, ES for locals.

### Why not just use Inmuebles24/Lamudi

Those platforms own the lead. MPgenesis owns the lead and sells
it directly to the agent. The margin is in the disintermediation.

---

## 1. Permanent Principles

These apply to EVERY line of code, in EVERY phase, from day one.
Violating any of these means the code is wrong regardless of
context.

### P1 — Facts Never Touch the LLM

Factual data (price, m2, bedrooms, bathrooms, address,
coordinates, dates) MUST be extracted deterministically, stored
in typed PostgreSQL columns, and rendered via templates. Only
descriptive prose passes through Claude. Any prompt containing
a factual number MUST use placeholders instead.

**Rationale**: LLMs hallucinate numbers. A single wrong price
destroys user trust and creates legal liability.

**How to verify**: grep every LLM prompt for numeric literals
or currency symbols. If found, the prompt violates this principle.

### P2 — Extractor-Renderer Separation

The extraction pipeline MUST be agnostic to the source site's
UX. The rendering pipeline MUST follow the project's own brand
guidelines. There MUST be zero coupling between source UX and
clone UX.

**Rationale**: Source sites change layouts frequently. Decoupling
allows each side to evolve independently.

### P3 — YAGNI Agresivo

Features MUST NOT be implemented until the preceding phase
demonstrates the need with real data. If a capability is listed
in a later phase (Section 6), it does NOT exist yet.

**Rationale**: For a 2-person non-technical team, every premature
feature is maintenance debt that slows down what actually matters.

### P4 — Obligatory Idempotency

Every worker MUST use `source_id + source_listing_id` as natural
key with `ON CONFLICT DO UPDATE` semantics. Re-processing the
same input MUST produce the same output without creating
duplicates.

**Rationale**: Crawls re-visit pages. Workers retry on failure.
Without idempotency, the database accumulates duplicates.

### P5 — Token Efficiency as Cost Lever

HTML MUST be cleaned before sending to any LLM. Use DOM parsing
to strip nav, footer, ads, scripts, styles — send only the
listing content. Batch API (50% discount) MUST be used for all
non-realtime Claude calls. Prompt caching (90% discount) MUST be
enabled for stable system prompts.

**Rationale**: Raw HTML is 10-30x more tokens than clean content.
At scale, this is hundreds of dollars per month difference.

### P6 — Observability from Day One

Every BullMQ job MUST log: `source_id`, `crawl_run_id`,
`duration_ms`, `status`. LLM calls MUST track `input_tokens`,
`output_tokens`, `cost_usd` per job. Structured logging with
Pino (JSON to stdout) is mandatory. Sentry captures all failures.

**Rationale**: Without observability, cost overruns go unnoticed
and silent failures accumulate.

### P7 — Human Approval Gate

No property listing MUST be published without explicit human
approval. The pipeline ends at `status: 'review'`; only an
operator action transitions to `status: 'published'`.

**Rationale**: LLM paraphrasing can introduce subtle errors.
The human gate is the final quality check before content goes
live.

### P8 — Every Listing is a Lead Funnel

Every published listing page MUST include at least one lead
capture mechanism (WhatsApp CTA, contact form, or both). A
listing without a CTA is a page that generates traffic but
zero revenue. Lead data MUST be stored in a `leads` table with
`listing_id`, `source`, `contact_info`, `created_at`.

**Rationale**: This is a lead gen business. A beautiful page
with no conversion path is a cost center, not a revenue driver.

### P9 — Simplicity-First

When choosing between two approaches, ALWAYS pick the one with
fewer moving parts, fewer services, fewer languages, and fewer
abstractions. The team is 2 people with non-deep-technical
profiles. Complexity is the #1 project risk — not performance,
not scale, not feature completeness.

**Rationale**: The most common cause of project failure for small
teams is not technical limitations but abandonment due to
accumulated complexity and friction.

**How to verify**: Can both team members understand, debug, and
deploy every component? If not, simplify.

---

## 2. Technology Stack (All-TypeScript)

The entire backend and frontend run on a single language:
TypeScript. This is a deliberate constraint driven by P9
(Simplicity-First).

### Core stack

| Layer              | Technology                                     | Constraint                          |
| ------------------ | ---------------------------------------------- | ----------------------------------- |
| Runtime            | Node.js + TypeScript                           | NO Python in the main codebase      |
| Scraping           | Crawlee (TS) + PlaywrightCrawler               | NO Selenium/Puppeteer/Scrapy        |
| Proxies            | Decodo (Smartproxy) residential MX             | Bright Data only for hard targets   |
| Extraction T1      | cheerio + JSON.parse (JSON-LD/schema.org)      | Replaces extruct                    |
| Extraction T2      | One-time Claude call for CSS selectors         | Replaces Crawl4AI generate_schema   |
| Extraction T3      | Anthropic TS SDK + Zod schemas (tool_use)      | Replaces instructor (Python)        |
| Watermark          | IOPaint + LaMa on GPU spot (RunPod)            | External service, NOT in-process    |
| Paraphrase         | Claude Sonnet (Batch API)                      | NO Opus for batch                   |
| Translation        | Claude Sonnet ES->EN/FR (Batch API)            | Rewrite ES first, then translate    |
| Database           | PostgreSQL + PostGIS (Supabase Pro)            | Typed columns for facts, JSONB flex |
| Orchestration      | BullMQ + Redis                                 | NO Temporal/Inngest                 |
| Admin (ph 1-2)     | Next.js route group `/admin/` + Supabase Auth  | NO CMS until phase 3               |
| CMS (ph 3+)        | Payload CMS                                    | Only when operator UI needed        |
| Frontend           | Next.js 15 App Router + shadcn/ui + Tailwind 4 | NO Redux/Zustand (RSC + URL)        |
| Blog (ph 1-2)      | MDX files in repo                              | Git push to publish                 |
| Images             | Cloudflare R2                                  | NO S3/CloudFront                    |
| Maps               | Leaflet + OpenStreetMap                        | NO Google Maps                      |
| Search             | PostgreSQL FTS (phase 1)                       | NO Typesense until >10K             |
| SEO                | DataForSEO + IndexNow + Schema.org JSON-LD     | NO hardcoded keywords               |
| Logging            | Pino                                           | Structured JSON to stdout           |
| Errors             | Sentry                                         | Free tier initially                 |
| Testing            | Vitest                                         | Single test runner                  |
| Schema validation  | Zod                                            | Replaces Pydantic (all-TS)          |

### Why All-TypeScript

- **One language** = one set of tools, one mental model, one
  debugging workflow
- **Shared types** from DB schema to API to frontend (no
  translation layer)
- **Crawlee is TS-native** with AutoscaledPool, RequestQueue,
  SessionPool — no Python equivalent
- **BullMQ is TS-native** — Python BullMQ bindings are unofficial
- **2-person team** cannot afford maintaining 2 runtimes, 2 test
  frameworks, 2 Docker base images

### What we lose (and how we replace it)

| Python library          | TS replacement                        | Trade-off                                          |
| ----------------------- | ------------------------------------- | -------------------------------------------------- |
| extruct                 | cheerio + JSON.parse for JSON-LD      | Covers ~80% of T1; microdata parser npm for rest   |
| Crawl4AI generate_schema | Manual Claude call for CSS selectors | Same result, manual first 5-10 sites               |
| instructor + Pydantic   | Anthropic SDK + Zod + tool_use        | Native TS, same validation guarantees              |
| structlog               | Pino                                  | Industry standard for Node.js structured logging   |

### Watermark removal: external service exception

IOPaint + LaMa runs as an external HTTP service on GPU spot
instances (RunPod). This is NOT part of the TS codebase — it's
a Docker container that receives image + mask via HTTP and
returns the cleaned image. The TS worker calls it as an HTTP
client. No Python in our repo.

---

## 3. Conventions

### Naming

| Context                      | Convention                    | Example                             |
| ---------------------------- | ----------------------------- | ----------------------------------- |
| Database                     | snake_case                    | `price_cents`, `source_listing_id`  |
| TypeScript vars/functions    | camelCase                     | `extractListing`, `crawlRun`        |
| TypeScript types/components  | PascalCase                    | `PropertyListing`, `ListingCard`    |
| URLs                         | kebab-case                    | `/departamentos-en-venta/`          |
| Environment variables        | SCREAMING_SNAKE_CASE          | `ANTHROPIC_API_KEY`                 |
| Zod schemas                  | camelCase with Schema suffix  | `propertyListingSchema`             |

### TypeScript Strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Data Modeling

All structured data MUST use Zod schemas for validation.
Raw untyped objects are forbidden for data that crosses function
boundaries. Zod schemas are the single source of truth for both
runtime validation and TypeScript types (via `z.infer<>`).

### Monorepo Structure

```text
/apps
  /web                # Next.js 15: public frontend + /admin routes
/packages
  /database           # Drizzle schema + migrations
  /extraction         # Tier 1/2/3 extractors (all TS)
  /workers            # BullMQ workers
    /crawl
    /extract
    /image-processing
    /paraphrase
    /translate
    /publish
  /shared             # Shared types, Zod schemas, utils
/content
  /blog               # MDX blog posts (editorial)
  /guides             # MDX zone/buyer guides (editorial)
/infra
  /docker             # Dockerfiles + docker-compose
```

**Changes from v1**: Single `/apps/web` (no separate admin app).
No `/packages/extraction` in Python. No `/packages/paraphrase`
in Python. Added `/content` for editorial MDX.

---

## 4. Quality Gates

### Testing

- **Unit tests** (Vitest): address normalization, fact extraction
  regex, template rendering, dedup logic, Zod schema validation
- **Integration tests**: crawl->extract->DB flow,
  paraphrase->validate flow
- **E2E tests**: 1 site fixture in local HTML (never scrape in CI)

### Explicit Prohibitions

- HTML crudo al LLM (siempre limpiar con cheerio primero)
- Numeros factuales al LLM (usar placeholders)
- Opus para batch (Sonnet basta)
- Python en el codebase principal (all-TS)
- Selenium, Puppeteer, o Scrapy (usar Crawlee)
- S3/CloudFront (usar R2)
- Redux/Zustand (RSC + URL state)
- CMS en fase 1-2 (Next.js admin + Supabase Auth)
- Busqueda custom antes de PostgreSQL FTS
- Keywords SEO hardcodeadas (siempre templates + DataForSEO)
- Paginas programaticas sin CTA de lead capture
- Paginas programaticas sin link a contenido editorial
- Florence-2 hasta que bbox fija falle en datos reales

### Alert Thresholds (from Phase 2+)

| Metric                        | Threshold                    |
| ----------------------------- | ---------------------------- |
| Extraction success rate       | < 90%                        |
| LLM latency p95              | > 10s                        |
| LLM cost per listing         | > $0.05                      |
| Queue depth                  | > 1000 pending               |
| Proxy error rate             | > 20%                        |
| Watermark removal success    | < 95%                        |
| Lead capture rate per listing | < 1% (page views to leads)   |

---

## 5. Content & SEO Strategy

### Programmatic pages (scraped)

Each listing microsite page includes:

- Structured data rendered from typed DB columns (P1)
- Paraphrased description (LLM, prose only)
- Schema.org JSON-LD (RealEstateListing)
- Lead capture CTA: WhatsApp button + contact form (P8)
- Links to relevant editorial content (zone guide, market report)
- Hreflang bidirectional (ES/EN/FR)

**Minimum content**: 250+ unique words per listing (paraphrased
prose + template-rendered contextual data).

### Editorial pages (original, manual)

Written by humans. NOT scraped. NOT LLM-generated. Types:

- **Zone guides**: "Vivir en Playacar: guia completa 2026"
- **Market reports**: "Precios por m2 en Tulum Q1 2026"
- **Buyer guides**: "Como comprar propiedad en Mexico siendo
  extranjero"
- **Blog posts**: News, trends, lifestyle

**Rule**: At least 3 editorial pages MUST be published before
the first programmatic listing goes live. These establish
E-E-A-T and give Google a reason to trust the domain.

### URL structure

```text
example.com/es/quintana-roo/playa-del-carmen/departamentos-en-venta/[slug]/
example.com/en/quintana-roo/playa-del-carmen/apartments-for-sale/[slug]/
example.com/fr/quintana-roo/playa-del-carmen/appartements-a-vendre/[slug]/
example.com/es/blog/[slug]/
example.com/es/guias/[zona-slug]/
```

### Internal linking (hub-and-spoke)

```text
Editorial hub (zone guide)
  └─ Location hub (Playa del Carmen)
      └─ Type hub (departamentos en venta)
          └─ Individual listings (programmatic)
```

Every programmatic page links UP to its hub. Every hub links
DOWN to its children and ACROSS to related hubs.

---

## 6. Phase-Gated Capabilities

These capabilities are FORBIDDEN until their phase begins.
They do NOT exist in the codebase until explicitly unlocked.

### Phase 1 — Foundation (weeks 1-4)

**Goal**: Crawl 1 real site, extract, store in DB, see in
admin UI.

**Build**:

- Monorepo setup (pnpm workspaces)
- PostgreSQL schema + migrations (Drizzle + Supabase)
- BullMQ + Redis
- Crawl worker (Crawlee + Playwright + Decodo)
- Extract worker: Tier 1 (cheerio JSON-LD) + Tier 3 (Claude + Zod)
- Admin UI: Next.js `/admin` with listing table + detail view
- Supabase Auth for admin access
- CLI: `pnpm crawl <domain>`
- 3 editorial MDX pages (zone guide, buyer guide, blog post)

**DO NOT build**: Paraphrase, translation, watermark removal,
SEO tooling, lead capture, public frontend beyond skeleton.

**Exit criteria**: 20+ properties from 1 real site visible in
admin UI.

### Phase 2 — Content Pipeline + MVP (weeks 5-8)

**Goal**: Complete content pipeline + publishable frontend with
lead capture.

**Build**:

- Paraphrase worker (Claude Sonnet, Batch API, fact/prose split)
- Translate workers (ES->EN, ES->FR, Batch API)
- Validation: regex fact-check + semantic similarity
- Watermark removal (IOPaint as external HTTP service)
- Admin: watermark bbox drawing (canvas component)
- Public frontend MVP (Next.js + shadcn/ui)
- Lead capture: WhatsApp CTA + contact form -> `leads` table
- Cloudflare R2 image pipeline
- Branding: name, domain, logo (Looka), brand guide, theme

**DO NOT build**: DataForSEO, IndexNow, advanced SEO, Typesense,
operator dashboard with metrics.

**Exit criteria**: 1 site fully processed (crawl->extract->
paraphrase->translate->publish), leads being captured.

### Phase 3 — SEO + Operator UI (weeks 9-12)

**Goal**: SEO-complete site + operator UI for scaling.

**Build**:

- Schema.org JSON-LD generator
- Hreflang via XML sitemaps
- Dynamic sitemaps with `<lastmod>`
- IndexNow integration
- Meta templates (title, description, H1)
- DataForSEO keyword research integration
- Operator dashboard (crawl status, costs, lead metrics)
- Scale to 5 sites
- GA4 + Meta Pixel
- Evaluate Payload CMS migration

**Exit criteria**: 5 sites live, organic traffic measurable,
leads being generated.

### Phase 4 — Scale (month 4+)

**Goal**: 20 to 100+ sites, cost optimization.

**Unlock when justified by data**:

- Tier 2 extraction (CSS schema auto-generation)
- Typesense (if FTS too slow at >10K listings)
- Payload CMS (if editorial workflow needs it)
- Self-hosted Postgres (if Supabase Pro hits limits)
- Florence-2 watermark fallback (if bbox fails)
- Grafana dashboards
- Lead scoring and qualification pipeline

---

## 7. Team & Complexity Budget

### Team profile

- **Person 1**: Developer, non-deep-technical profile.
  Can write code with AI assistance, manage deployments,
  debug with guidance.
- **Person 2**: Technical amateur. Can operate admin UI,
  review listings, manage sources, write editorial content.

### Complexity budget

Every new service, dependency, or abstraction spends from a
finite complexity budget. Before adding anything, answer:

1. Can both team members understand it?
2. Can both team members debug it when it breaks at 2 AM?
3. Is there a simpler alternative that's 80% as good?

If the answer to 1 or 2 is "no", do NOT add it.

### Current complexity inventory

| Component              | Complexity  | Justifiable?                          |
| ---------------------- | ----------- | ------------------------------------- |
| Next.js 15             | Medium      | Yes — SSR/ISR/RSC essential for SEO   |
| Crawlee + Playwright   | Medium      | Yes — core value prop                 |
| BullMQ + Redis         | Low-Medium  | Yes — pipeline orchestration          |
| Supabase (Postgres)    | Low         | Yes — managed DB                      |
| Cloudflare R2          | Low         | Yes — zero-egress images              |
| IOPaint (external)     | Low         | Yes — HTTP call only                  |
| Pino + Sentry          | Low         | Yes — observability                   |

**Total services in Phase 1**: Next.js + BullMQ + Redis +
Supabase + Sentry = 5 services. This is the maximum acceptable
for this team size.

---

## 8. Cost Estimates (Realistic)

### Phase 1 — Piloto (1-5 sites)

| Item                              | Monthly cost    |
| --------------------------------- | --------------- |
| Supabase Pro                      | $25             |
| Hetzner CPX22 (workers + Redis)   | ~$8             |
| Decodo proxies                    | $10-20          |
| Anthropic API (extraction only)   | $10-20          |
| Vercel (free tier)                | $0              |
| Domain                            | ~$1 (amortized) |
| Sentry (free tier)                | $0              |
| **Total**                         | **$55-75/month** |

### Phase 2 — Content Pipeline (5-20 sites)

Add: Anthropic paraphrase/translate ($50-150), R2 ($3-10),
GPU spot ($5-20), Looka branding ($65 one-time).
**Total**: ~$150-290/month.

### Phase 3+ — Scale

Per PROJECT_CONSTITUTION.md estimates, adjusted for all-TS
stack (slightly lower infra due to single runtime):
**Total**: ~$250-1,500/month depending on site count.

---

## 9. Governance

### Amendment Procedure

1. Propose change with rationale and impact analysis.
2. Update version (SemVer):
   - **MAJOR**: principle removal or incompatible redefinition
   - **MINOR**: new principle or material expansion
   - **PATCH**: wording, typos, non-semantic changes
3. Update `Last amended` date.
4. Propagate to dependent templates.
5. Update sync impact report at top of file.

### Compliance Review

Every PR that touches pipeline workers, LLM prompts, database
schema, or lead capture MUST be verified against:

- P1 (facts/LLM separation)
- P4 (idempotency)
- P6 (observability)
- P8 (lead funnel present)
- P9 (simplicity check)
- No prohibited technology introduced
- No phase-gated capability built prematurely

### Versioning Policy

Semantic versioning (MAJOR.MINOR.PATCH). The sync impact report
at the top of this file MUST be refreshed on each change.
