# Constitución de proyecto: sistema de clonación de marketplaces inmobiliarios con SEO programático (v2)

> **Documento de referencia para Claude Code.** Este archivo define la arquitectura completa, decisiones técnicas, stack recomendado y roadmap de implementación. Colocar en la raíz del repositorio como `CLAUDE.md` o `PROJECT_CONSTITUTION.md`.

## Resumen ejecutivo

**El núcleo del sistema es un extractor estructurado agnóstico al sitio fuente que alimenta una base de datos relacional PostgreSQL con datos de propiedades inmobiliarias; el sitio web renderizado es un subproducto SEO.**

Pipeline end-to-end: **crawl → extracción → watermark removal → paráfrasis → traducción → publicación multilingüe**.

- **Costo operacional**: ~$45/mes piloto (5 sitios) → ~$1,690/mes (100+ sitios)
- **Geografía inicial**: Quintana Roo (Riviera Maya), expansión a nivel nacional México
- **Idiomas de salida**: Español (primario), inglés, francés
- **Marca**: paraguas única, a crear desde cero
- **Re-crawl**: manual on-demand (no programado)
- **Aprobación humana**: obligatoria antes de publicar

### Principios arquitectónicos innegociables

1. **Los hechos nunca tocan el LLM.** Datos factuales (precio, m², recámaras, dirección, coordenadas) se extraen determinísticamente, se almacenan en columnas tipadas de PostgreSQL, y se renderizan por template. Solo la prosa descriptiva pasa por Claude.
2. **Separación estricta extractor vs renderizador.** El extractor es agnóstico al sitio fuente; el renderizador sigue lineamientos de marca propios. Cero acoplamiento entre UX del fuente y UX del clon.
3. **Watermark removal desacoplado.** Subsistema independiente con bbox fija por sitio, permite apuntar al supply completo de inmobiliarias (con o sin watermark) a costo marginal.
4. **YAGNI agresivo.** Florence-2 fallback, Typesense, self-hosted Postgres → todos se implementan solo cuando la fase anterior demuestra la necesidad con datos reales.
5. **Eficiencia de tokens como palanca principal.** HTML limpio antes del LLM reduce costos 10-30x. Batch API añade 50% descuento. Prompt caching añade 90% descuento en system prompts.

---

## A) Web scraping: Crawlee + Playwright

### Framework principal

**Crawlee (Node.js/TypeScript) con PlaywrightCrawler** como motor principal. MIT license, 20K+ GitHub stars.

Componentes clave:
- **AutoscaledPool**: ajusta concurrencia según CPU/memoria en tiempo real
- **RequestQueue**: persiste en disco para recuperación ante crashes
- **SessionPool**: vincula proxies a contextos de navegador manteniendo "usuarios" consistentes
- **Router**: clasifica peticiones por tipo (SITEMAP → LISTING_INDEX → PROPERTY_DETAIL → MEDIA_DOWNLOAD)

### Estrategia adaptativa

```
1. Intentar CheerioCrawler primero (HTTP-only, 10-50x más eficiente)
2. Escalar a PlaywrightCrawler solo si:
   - El HTML inicial no contiene los datos (SPA)
   - Hay protección anti-bot detectada
   - Se requiere interacción (scroll, click)
```

El 70%+ de sitios inmobiliarios pequeños en México usan WordPress con protección mínima → CheerioCrawler basta. Cada instancia Chrome consume ~500MB RAM; AutoscaledPool previene OOM.

### Stealth y evasión anti-bot

Integración nativa vía `playwright-extra` + `puppeteer-extra-plugin-stealth`:
- Parchea `navigator.webdriver`, WebGL, plugins, viewport
- Rota fingerprints por defecto en PlaywrightCrawler
- Delays aleatorios 2-8s + scroll behavioral

**Descarte explícito**: Puppeteer (stealth plugin deprecado feb 2025), Selenium (180 req/min vs miles con Crawlee), Scrapy (no renderiza JS nativo, `scrapy-playwright` añade complejidad).

### Proxies residenciales

| Proveedor | Pool IPs | México | Precio/GB | Tasa éxito | Uso |
|-----------|----------|--------|-----------|------------|-----|
| **Decodo (Smartproxy)** ★ | 65M+ | City-level MX | $1.50-2.20 | 99.68% | **Primario** |
| IPRoyal | 32M+ | Disponible | $1.75-2.50 | ~98% | Backup dev |
| Bright Data | 150M+ | Extenso MX | $2.50-8.40 | 99.17% | Targets difíciles |
| Oxylabs | 100M+ | 5M IPs MX | $8-10 | 99.95% | No usar (caro) |

Para 500 sitios/~25K páginas mensuales: **~$75-190/mes en proxies**.

### CAPTCHAs

- **Primario**: CapSolver (AI-first, excelente Cloudflare Turnstile, $2-3/1K solves)
- **Fallback**: 2Captcha
- **Costo**: <$1/mes con rotación adecuada (<1% de requests)

### Rate limiting

- 2-5 requests concurrentes por dominio
- 3-8 segundos aleatorios entre requests
- Máximo 10-15 req/min por sitio

### Estrategia de crawl

**Fase 1 — Discovery**:
```
1. GET /sitemap.xml
2. GET /wp-sitemap.xml
3. Parsear /robots.txt para referencias de sitemap
4. Si no hay sitemap → crawl desde homepage siguiendo links internos
```

**Fase 2 — Identificación de listings**:
- URL patterns regex: `/propiedad/`, `/inmueble/`, `/venta/`, `/listing/`
- Heurísticas HTML: presencia de `$`, `MXN`, `USD`, galerías, datos m²
- Filtrado negativo: `/about`, `/contact`, `/blog`, `/careers`

**Fase 3 — Paginación**:
- Detectar `?page=`, `/page/N/`
- Infinite scroll: Playwright scroll-to-bottom + wait-for-new-content

### Descarga de medios

```typescript
// Interceptar network requests para imágenes
page.on('response', async (response) => {
  if (response.request().resourceType() === 'image') {
    // Capturar URL + descargar
  }
});

// Parsear DOM renderizado
- <img src>, <img srcset>
- background-image en CSS computed
- Videos: iframes youtube.com/embed/, player.vimeo.com/video/
- Tours virtuales: regex /(matterport\.com|kuula\.co|roundme\.com|captur3d)/
- PDFs: <a href> terminando en .pdf con texto "brochure", "ficha", "folleto"
```

---

## A.1) Watermark removal: IOPaint + bbox fija por sitio

### Decisión estratégica

**SÍ apuntar a sitios con watermark.** Limitarse a sitios sin watermark elimina el 40-60% de las fuentes potenciales en Quintana Roo, incluyendo las agencias medianas/grandes con mayor inventario. Las inmobiliarias sin watermark tienen típicamente 20-50 propiedades; las que cuidan branding con logo tienen 200-1,000+.

### Contexto técnico

Los watermarks en sitios inmobiliarios mexicanos son técnicamente triviales:
- Logos de agencia ~150×80px en esquinas fijas
- Fondos simples (cielo, mar, fachadas, interiores)
- Opacidad moderada
- **Posicionalmente consistentes por sitio** (siempre misma esquina, mismo tamaño)

LaMa los resuelve en ~800ms por foto en GPU T4 con calidad indistinguible.

### Arquitectura: 3 fases

**Fase 1 — Onboarding por sitio (humano, ~5 min)**

Al agregar un nuevo dominio, el operador:
1. Visualiza 3-5 fotos de muestra en UI admin
2. Dibuja bounding box sobre el watermark con componente canvas
3. Config se guarda en `sources.watermark_config`

```json
{
  "enabled": true,
  "strategy": "fixed-bbox",
  "bbox": {"x": 0.78, "y": 0.88, "width": 0.20, "height": 0.10},
  "anchor": "bottom-right",
  "relative": true,
  "validated_at": "2026-01-15T10:30:00Z",
  "validated_by": "operator_id",
  "sample_approved_count": 10
}
```

El `relative: true` expresa la bbox en porcentajes para manejar fotos de dimensiones variables. Si el sitio no tiene watermark: `enabled: false` y skip del inpainting.

**Fase 2 — Procesamiento batch (automático)**

El `image-processing-worker` consume de BullMQ post-crawl:
1. Lee `watermark_config` del source
2. Genera máscara binaria con bbox escalada a dimensiones reales
3. Envía imagen + máscara a servidor IOPaint local
4. Almacena resultado en R2 como `_clean.webp`
5. Retiene original como `_raw.webp` para audit trail

**Fase 3 — Validación (humano, ~1 min por sitio)**

Spot-check de 10 fotos random post-inpainting en UI admin. Si pasa, sitio aprobado. Si hay artefactos, fallback Florence-2 o descarte.

### Stack

- **Primario**: [IOPaint](https://github.com/Sanster/IOPaint) (fork productivo de Lama Cleaner, Apache 2.0) corriendo modelo LaMa de Samsung AI como servidor HTTP local
- **Fallback (YAGNI)**: [WatermarkRemover-AI](https://github.com/D-Ogi/WatermarkRemover-AI) (MIT) con Florence-2 + LaMa para sitios con posición variable
- **Descartadas**: Dewatermark.ai, WatermarkRemover.io ($0.05-0.20/imagen, TOS prohibitivo)

### Infraestructura GPU

**RunPod** o **Vast.ai** con RTX 3090/4090 a **$0.20-0.40/hora**. Se renta durante corridas batch post-crawl, se apaga al terminar.

| Volumen | Fotos | Tiempo GPU T4 | Costo GPU spot |
|---------|-------|---------------|----------------|
| 1 sitio | 1,000 | ~14 min | ~$0.10 |
| 5 sitios | 5,000 | ~1.1 hr | ~$0.40 |
| 20 sitios | 20,000 | ~4.5 hr | ~$1.60 |
| 100 sitios | 100,000 | ~22 hr | ~$8 |

Costo incremental mensual: **$5-50**.

### Schema changes

```sql
ALTER TABLE sources ADD COLUMN watermark_config JSONB DEFAULT '{"enabled": false}';

ALTER TABLE property_images
  ADD COLUMN original_url TEXT,
  ADD COLUMN clean_url TEXT,
  ADD COLUMN has_watermark_removed BOOLEAN DEFAULT FALSE,
  ADD COLUMN watermark_removal_version TEXT;
```

### Integración BullMQ

```
CRAWL (Playwright + download raw images)
  →
EXTRACT (structured data + image metadata)
  →
IMAGE-PROCESSING (watermark removal + resize + WebP + R2 upload)
  →
PARAPHRASE (text only)
  →
TRANSLATE
  →
PUBLISH (human review gate)
```

El image-processing worker es independiente del crawl worker (CPU-heavy Playwright) y LLM workers (IO-bound). Container Docker separado con acceso a GPU spot durante ventanas batch.

---

## B) Extracción estructurada: 3 tiers

Cada tier se invoca solo si el anterior no produce resultados.

### Tier 1 — Determinista (cero costo LLM)

**`extruct`** (Python) extrae:
- JSON-LD
- Microdata
- OpenGraph
- RDFa
- Dublin Core

Cuando existe `Schema.org RealEstateListing` (o `Apartment`, `House`, `SingleFamilyResidence`), mapping directo a DB. Instantáneo y gratis.

### Tier 2 — Schema CSS autogenerado (costo LLM one-time)

**[Crawl4AI](https://github.com/unclecode/crawl4ai)** (Apache 2.0, 50K+ stars) ofrece `generate_schema()`:
1. Alimenta HTML de muestra a un LLM UNA vez
2. Genera schema CSS/XPath reutilizable
3. Extracciones subsecuentes son LLM-free

Ideal para re-crawl: pagar una vez, reutilizar indefinidamente.

También ofrece: `JsonCssExtractionStrategy`, `RegexExtractionStrategy`, `BM25` content filtering, y el crucial `FitMarkdown` para limpiar HTML antes de enviar al LLM.

### Tier 3 — LLM extraction con Pydantic (fallback)

**[instructor](https://github.com/instructor-ai/instructor)** (11K+ stars, 3M+ descargas mensuales) envuelve la API de Anthropic con validación Pydantic + reintentos automáticos.

```python
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional

class PropertyType(str, Enum):
    APARTMENT = "apartment"
    HOUSE = "house"
    LAND = "land"
    VILLA = "villa"
    PENTHOUSE = "penthouse"
    OFFICE = "office"
    COMMERCIAL = "commercial"

class Operation(str, Enum):
    SALE = "sale"
    RENT = "rent"
    PRESALE = "presale"

class Address(BaseModel):
    street: Optional[str]
    colonia: Optional[str]
    city: str
    state: str
    postal_code: Optional[str]
    country: str = "MX"

class PropertyListing(BaseModel):
    title: str
    property_type: PropertyType
    operation: Operation
    price: float
    currency: str = Field(..., pattern="^(MXN|USD|EUR)$")
    bedrooms: Optional[int]
    bathrooms: Optional[float]
    construction_m2: Optional[float]
    land_m2: Optional[float]
    parking_spaces: Optional[int]
    address: Address
    description: str
    amenities: list[str] = []
    images: list[str] = []
    source_url: str
```

### Eficiencia de tokens (CRÍTICO)

**Siempre enviar texto pre-limpiado, nunca HTML crudo.**

- HTML property page: ~15,000-50,000 tokens
- Markdown limpio: ~1,000-3,000 tokens
- **Reducción 10-30x = reducción 10-30x en costo**

Usar `FitMarkdown` de Crawl4AI para strip de nav, footer, ads, scripts, styles.

### Detección de tipo de página

```
URL patterns (regex gratis) → clasificación
  /propiedad/\d+, /listing/[\w-]+, /inmueble/ → property_detail
  /propiedades, /search, /listings → listing_index
  /contacto, /contact → contact
  /blog, /news → blog

Haiku fallback para ~5% ambiguas (~$0.0001/clasificación)
```

### Deduplicación

Cuatro señales combinadas:

1. **Normalización de direcciones MX**
   - "Col." → "Colonia", "Av." → "Avenida"
   - Normalizar acentos
   - Geocoding → lat/lng canónico

2. **Composite key matching**
   - `normalized_address|property_type|bedrooms|bathrooms|m2`

3. **Fuzzy matching** con `rapidfuzz`
   - Jaro-Winkler ≥ 0.85
   - Precio ±5%
   - Área ±10%

4. **Image-based dedup** con `imagehash`
   - Perceptual hash (pHash)
   - Hamming distance < 10 = probable duplicado

---

## C) Pipeline de paráfrasis: los hechos nunca tocan el LLM

### Principio central

```
extraer datos factuales determinísticamente
  →
almacenar en columnas tipadas PostgreSQL
  →
separar prosa de hechos
  →
enviar SOLO prosa al LLM
  →
re-ensamblar por template
```

**Datos factuales** (precio, m², recámaras, baños, dirección, fechas, coordenadas): regex + parsing → columnas tipadas → render por template. **Nunca pasan por el LLM.**

**Prosa descriptiva** ("Hermoso departamento con acabados de lujo..."): va al LLM. Antes de enviar, reemplazar valores factuales por placeholders:

```
Input: "Hermoso departamento de 120 m² con 3 recámaras en Playacar a $5,500,000 MXN"
Pre-procesado: "Hermoso {{property_type}} de {{construction_m2}} con {{bedrooms}} en {{neighborhood}} a {{price}}"
Output LLM: "Exclusivo {{property_type}} de {{construction_m2}} ofreciendo {{bedrooms}} en el prestigioso {{neighborhood}} por {{price}}"
Post-render: "Exclusivo departamento de 120 m² ofreciendo 3 recámaras en el prestigioso Playacar por $5,500,000 MXN"
```

### Selección de modelo por capa

| Tarea | Modelo | Costo/listing |
|-------|--------|---------------|
| Clasificación tipo página | Haiku 4.5 | ~$0.0001 |
| Extracción con schema | Haiku 4.5 | ~$0.002-0.005 |
| Extracción compleja | Sonnet | ~$0.01-0.03 |
| Reescritura prosa (ES) | Sonnet | ~$0.01-0.02 |
| Traducción ES→EN | Sonnet | ~$0.01-0.02 |
| Traducción ES→FR | Sonnet | ~$0.01-0.02 |
| Validación calidad | Haiku 4.5 | ~$0.001 |
| **Total estándar (3 idiomas)** | | **~$0.05-0.15** |
| **Con Batch API (50% off)** | | **~$0.025-0.08** |
| **Con Batch + Cache** | | **~$0.015-0.05** |

**Reglas de oro**:
- Batch API siempre que sea posible (50% descuento, 24h entrega)
- Prompt caching para system prompts (90% descuento)
- Opus NO se justifica → Sonnet logra 95%+ de calidad a fracción del costo

A 10,000 listings/mes: **~$150-500/mes pipeline completo**.

### Estrategia multilingüe

**Reescribir en español primero, luego traducir** (NO reescrituras independientes por idioma):

```
1. Extraer datos + prosa ES del fuente
2. Reescribir prosa ES con Sonnet (1 llamada)
3. Traducir prosa ES→EN con Sonnet (1 llamada)
4. Traducir prosa ES→FR con Sonnet (1 llamada)
5. Template-render hechos en cada idioma
```

Ventajas: consistencia factual garantizada entre idiomas, 2-3x más económico.

Keywords SEO por idioma se inyectan via template de mapeo:
```python
KEYWORDS = {
    "apartment_sale": {
        "es": "departamento en venta",
        "en": "apartment for sale",
        "fr": "appartement à vendre"
    },
    # ...
}
```

### Validación post-paráfrasis (4 capas)

1. **Verificación determinística de hechos**
   - Regex matching: ¿el precio original aparece intacto?
   - ¿m² está preservado?
   - ¿Coordenadas coinciden?

2. **NLI-based faithfulness**
   - ModernBERT-base-nli
   - 76-162ms overhead
   - Inferencia local (no API)

3. **Semantic similarity**
   - Embedding cosine similarity
   - Aceptar si > 0.85
   - Flag si < 0.7 (demasiado diferente) o > 0.95 (copia literal)

4. **LLM-as-Judge**
   - Haiku para spot-check del ~10% de outputs
   - Prompt: "¿Este texto contiene información que no está en el original?"

### Instrucciones negativas críticas en el prompt

```
INSTRUCCIONES NO-NEGOCIABLES:
1. NO añadas información que no esté en el texto original
2. NO inventes amenidades, features o características
3. NO modifiques números, fechas, ni datos factuales (ya están como placeholders)
4. NO añadas opiniones subjetivas sobre el vecindario o mercado
5. NO uses superlativos sin base en el texto original
6. SÍ puedes reorganizar párrafos para mejor flujo
7. SÍ puedes mejorar la gramática y legibilidad
8. SÍ puedes usar sinónimos manteniendo el significado
```

---

## D) SEO programático

### Contexto crítico 2025-2026

Post-actualizaciones Helpful Content, Google requiere que cada página proporcione **valor que justifique su existencia independientemente**. Real estate es ideal para pSEO porque cada listing tiene datos inherentemente únicos. Páginas "thin" son penalizadas a nivel sitio completo. E-E-A-T es crítico (real estate = YMYL).

### Modelo Zillow como referencia

- 33M+ visitas orgánicas mensuales
- ~100M+ URLs indexadas
- Taxonomía de dos niveles: ubicación → tipo
- URL pattern: `zillow.com/{state}-{city}/` → `zillow.com/homedetails/{address}/{zpid}_zpid/`
- Cada página incluye datos de mercado local únicos
- Blog <1,000 páginas; 99.9%+ son programáticas
- **80% de usuarios llegan orgánicamente**

**Lección**: transformar datos crudos en recursos ricos en contexto. No basta con precio y fotos → inyectar datos de vecindario, estadísticas de precio por zona, amenidades cercanas.

### Estructura URL y hreflang

**Subdirectorios (NO subdominios, NO ccTLDs)**:

```
example.com/es/quintana-roo/playa-del-carmen/departamentos-en-venta/[slug]/
example.com/en/quintana-roo/playa-del-carmen/apartments-for-sale/[slug]/
example.com/fr/quintana-roo/playa-del-carmen/appartements-a-vendre/[slug]/
```

Razón: concentra autoridad de dominio en un solo dominio (vs subdominios que construyen autoridad por separado, vs ccTLDs que fragmentan completamente).

**Hreflang bidireccional obligatorio**:

```html
<link rel="alternate" hreflang="es-mx" href="https://example.com/es/..." />
<link rel="alternate" hreflang="en" href="https://example.com/en/..." />
<link rel="alternate" hreflang="fr" href="https://example.com/fr/..." />
<link rel="alternate" hreflang="x-default" href="https://example.com/es/..." />
```

**Reglas críticas**:
- Cada página referencia TODAS sus variantes idiomáticas Y a sí misma
- `x-default` → versión ES (primaria para México)
- 75% de implementaciones tienen errores; un solo error rompe el cluster COMPLETO
- Implementar via XML sitemaps con `<xhtml:link>` para sitios grandes

### Schema.org markup obligatorio

Cada listing emite JSON-LD:

```json
{
  "@context": "https://schema.org",
  "@type": "RealEstateListing",
  "name": "Departamento en Playacar con vista al mar",
  "url": "https://example.com/es/.../slug",
  "image": ["https://cdn.../1.webp", "..."],
  "offers": {
    "@type": "Offer",
    "price": "5500000",
    "priceCurrency": "MXN",
    "availability": "https://schema.org/InStock"
  },
  "address": {
    "@type": "PostalAddress",
    "addressCountry": "MX",
    "addressRegion": "Quintana Roo",
    "addressLocality": "Playa del Carmen",
    "streetAddress": "..."
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 20.6296,
    "longitude": -87.0739
  },
  "floorSize": {
    "@type": "QuantitativeValue",
    "value": "120",
    "unitCode": "MTK"
  },
  "numberOfRooms": 3,
  "numberOfBathroomsTotal": 2
}
```

Capas adicionales: `BreadcrumbList`, `FAQPage` por ubicación, `VideoObject` para tours virtuales.

**Impacto**: properties con schema completo ven **15-30% incremento en CTR orgánico**.

### Internal linking hub-and-spoke

```
México (hub principal)
  └─ Quintana Roo (sub-hub)
      └─ Playa del Carmen (sub-hub)
          └─ Playacar (neighborhood)
              └─ Listings individuales
```

Cross-linking:
- Location pages → subpáginas por tipo (departamentos, casas, condos)
- Location pages → rangos de precio
- Listings → link back al hub
- Breadcrumbs: `Home > Quintana Roo > Playa del Carmen > Departamentos en Venta > [Título]`

### Prevención de thin content

- **Mínimo 250+ palabras únicas** por listing
- **Mínimo 500+ palabras** para hub pages con market data
- Inyectar datos dinámicos: conteo de propiedades, rango de precios, features únicos, fecha de actualización

### Meta templates

```python
# Título: 50-60 caracteres
title = f"{property_type} en {location} - {price} | {brand}"

# Description: 120-160 caracteres
description = (
    f"Encuentra {count}+ {tipo} en {ubicación}. "
    f"{feature_destacado}. "
    f"Precios desde ${min} hasta ${max}. "
    f"{cta}"
)
```

### Indexación rápida

**IndexNow** para Bing/Yandex:
- Protocolo gratuito, 60M+ websites
- Batch submission 10K URLs/request
- Indexación en horas (a veces minutos)
- Google NO lo soporta

**Para Google**:
- XML sitemaps dinámicos con `<lastmod>`
- Google Search Console API para submission
- Strong internal linking (nuevos listings enlazados desde hubs inmediatamente)
- Google Indexing API oficial solo JobPosting/VideoObject (aunque devs reportan éxito con otros)

---

## E) Stack frontend

### Next.js 15 App Router con ISR

**Next.js 15 con App Router** (no Pages Router).

Razones:
- React Server Components generan HTML completo server-side (crawlers lo reciben sin JS)
- Metadata API type-safe jerárquica
- Partial Prerendering experimental (shells estáticos + streaming dinámico)

**Estrategia de rendering: ISR con revalidación on-demand**

| Tipo | Estrategia | Revalidación |
|------|-----------|--------------|
| Homepage | ISR | `revalidate: 300` (5 min) |
| Hub pages (ubicación) | ISR | `revalidate: 300` |
| Listing detail | ISR | Webhook on-demand desde CMS |
| Static (about, contact) | SSG | Build time |

Razón: SSG puro con 10K+ páginas produce builds de 30-60+ min; SSR tiene costo/request variable. ISR pre-construye las populares, sirve cacheadas (TTFB < 50ms), regenera al publish.

### CMS: Payload CMS

**Payload CMS** sobre Sanity/Strapi/Directus/Contentful.

Razones decisivas:
- **$0 de licencia** (self-hosted, 100% open-source)
- Integración nativa Next.js (mismo codebase, un deployment)
- TypeScript-native (auto-genera tipos desde models)
- i18n built-in a nivel campo (sin plugins)
- Visual editing (click-to-edit en sitio live)
- Schemas relacionales complejos (listings → agents → locations)
- Adquirido por Figma en junio 2025

Descartes:
- **Strapi v5**: content versioning y live preview solo en planes pagados
- **Sanity**: cloud-only, $15/usuario/mes
- **Contentful**: $300+/mes
- **Directus**: más DB admin que CMS content-first

### Imágenes y CDN

**Cloudflare R2**:
- $0 egress (gratuito)
- $0.015/GB/mes storage
- S3-compatible API
- 330+ edge locations

Escenario 10K listings × 10 fotos × 2MB = 200GB storage + ~500GB egress/mes:
- R2: **~$3/mes**
- S3+CloudFront: ~$50/mes
- Cloudinary: ~$89+/mes

**Backup**: Bunny CDN + Bunny Storage (~$8-11/mes) si se necesita control LATAM específico.

### Pipeline de imágenes

```
imagen original (raw del sitio fuente)
  →
[opcional] IOPaint inpainting (clean)
  →
Sharp: resize, compress, generar thumbnails (200/600/1200px)
  →
WebP/AVIF conversion (AVIF 45-65% más pequeño que JPEG)
  →
Upload a R2 con ambas versiones: _raw.webp y _clean.webp
```

Usar `next/image` con:
- Auto WebP/AVIF
- Lazy loading nativo
- Blur-up placeholders
- Width/height requeridos (previene CLS)

### Mapas

**Fase 1**: Leaflet + OpenStreetMap ($0)
**Fase 2**: MapLibre GL JS para vector tiles custom ($0)
**Descarte**: Google Maps ($7/1K cargas tras $200 crédito), Mapbox (solo si se necesita personalización avanzada)

### Búsqueda

**Fase 1**: PostgreSQL FTS (0-10K listings, $0)
**Fase 2**: Typesense self-hosted (10K-100K+, $20/mes VPS)

Typesense features clave para marketplace:
- Sub-50ms responses
- Geo search nativo
- Faceted filtering
- Typo tolerance
- Field-level relevancy weighting

### UI components

**shadcn/ui + Tailwind CSS v4 + Radix UI** ($0, MIT).

No es una librería de componentes → es una colección copy-paste que vive en tu codebase (cero dependency risk). Visual builder en `ui.shadcn.com/create`.

Componentes clave marketplace:
- DataGrid (grids de listings)
- Cards (property cards)
- Carousel (galerías de fotos)
- Command palette (búsqueda)
- Dialog (formularios de contacto)
- Slider (rango de precios)
- Sheet (filtros mobile)

### Tracking

Auto-inject en el layout raíz:
- Google Analytics 4
- Meta Pixel
- (Opcional) Hotjar, Clarity

---

## F) Base de datos: PostgreSQL + PostGIS

### Schema híbrido typed + JSONB

**Columnas tipadas para campos universales filtrables**:
```sql
price_cents BIGINT
bedrooms SMALLINT
bathrooms SMALLINT
area_m2 NUMERIC
property_type TEXT
listing_type TEXT
location GEOGRAPHY(POINT, 4326)  -- PostGIS
```

**JSONB para campos variables por fuente**:
```sql
raw_data JSONB
extracted_data JSONB
```

Razón: Postgres no mantiene estadísticas sobre contenidos JSONB → planes de query pobres a escala. Los campos de filtrado críticos DEBEN ser columnas tipadas con índices B-tree.

### Tablas core

```sql
-- Fuentes (sitios que clonamos)
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  crawl_config JSONB NOT NULL DEFAULT '{}',
  watermark_config JSONB NOT NULL DEFAULT '{"enabled": false}',
  extraction_schema JSONB,  -- schema CSS autogenerado Tier 2
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|active|paused|archived
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_crawled_at TIMESTAMPTZ
);

-- Sesiones de crawl
CREATE TABLE crawl_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',  -- running|completed|failed
  pages_crawled INT DEFAULT 0,
  listings_extracted INT DEFAULT 0,
  errors JSONB DEFAULT '[]'
);

-- Propiedades (core)
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  source_listing_id TEXT NOT NULL,  -- ID en el sitio fuente
  source_url TEXT NOT NULL,

  -- Columnas tipadas (filtrables)
  title TEXT NOT NULL,
  property_type TEXT NOT NULL,  -- apartment|house|land|villa|penthouse|...
  listing_type TEXT NOT NULL,  -- sale|rent|presale
  price_cents BIGINT,
  currency TEXT DEFAULT 'MXN',
  bedrooms SMALLINT,
  bathrooms NUMERIC(3,1),
  construction_m2 NUMERIC,
  land_m2 NUMERIC,
  parking_spaces SMALLINT,

  -- Ubicación
  country TEXT DEFAULT 'MX',
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  neighborhood TEXT,
  address TEXT,
  postal_code TEXT,
  location GEOGRAPHY(POINT, 4326),

  -- Contenido flexible
  raw_data JSONB NOT NULL DEFAULT '{}',
  extracted_data JSONB NOT NULL DEFAULT '{}',

  -- Contenido paraphraseado (por idioma)
  content_es JSONB,  -- {title, description, meta_title, meta_description, h1}
  content_en JSONB,
  content_fr JSONB,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'draft',  -- draft|review|published|archived
  content_hash TEXT NOT NULL,  -- para detectar cambios entre crawls

  -- Tracking
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_crawl_run_id UUID REFERENCES crawl_runs(id),
  published_at TIMESTAMPTZ,

  -- Full-text search
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish',
      coalesce(title, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(neighborhood, '') || ' ' ||
      coalesce(extracted_data->>'description', '')
    )
  ) STORED,

  UNIQUE(source_id, source_listing_id)
);

-- Imágenes
CREATE TABLE property_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,

  -- URLs
  original_url TEXT NOT NULL,  -- URL en sitio fuente
  raw_url TEXT,  -- R2: foto original descargada
  clean_url TEXT,  -- R2: foto post-watermark removal

  -- Metadatos
  alt_text TEXT,
  width INT,
  height INT,
  has_watermark_removed BOOLEAN DEFAULT FALSE,
  watermark_removal_version TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Amenities normalizadas
CREATE TABLE amenities (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_es TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  category TEXT  -- interior|exterior|community|security|...
);

CREATE TABLE property_amenities (
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  amenity_id INT REFERENCES amenities(id),
  PRIMARY KEY (property_id, amenity_id)
);

-- Changelog entre crawls
CREATE TABLE property_changes (
  id BIGSERIAL PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id),
  crawl_run_id UUID NOT NULL REFERENCES crawl_runs(id),
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Índices críticos

```sql
-- Geo queries (PostGIS)
CREATE INDEX properties_location_idx ON properties USING GIST (location);

-- Full-text search
CREATE INDEX properties_search_idx ON properties USING GIN (search_vector);

-- Filtros marketplace comunes
CREATE INDEX properties_browse_idx
  ON properties (listing_type, city, property_type)
  WHERE status = 'published';

-- JSONB queries flexibles
CREATE INDEX properties_raw_data_idx ON properties USING GIN (raw_data);

-- Lookup por fuente
CREATE INDEX properties_source_idx ON properties (source_id, source_listing_id);

-- Price range queries
CREATE INDEX properties_price_idx
  ON properties (listing_type, price_cents)
  WHERE status = 'published';
```

Performance esperado: geo queries point-in-radius en **15-25ms sobre 3M filas**.

### Hosting

**Fase inicial**: Supabase Pro ($25/mes)
- PostGIS nativo
- Auth built-in (útil para dashboard admin)
- Storage
- REST API
- PgBouncer connection pooling

**Cuando se necesite más compute**: Self-hosted PostgreSQL en Hetzner CCX23
- 4 vCPU dedicados
- 16GB RAM
- ~€28/mes
- PostGIS + control total de extensiones

**Descarte**: Neon (cold starts problemáticos para producción siempre-on)

---

## G) Orquestación: BullMQ + Redis

### Framework

**BullMQ** sobre Temporal, Inngest, Trigger.dev.

Razones:
- Pipeline lineal crawl → extract → image-processing → paraphrase → translate → review → publish mapea directamente a FlowProducer (parent-child)
- Self-hosted sobre Redis sin vendor lock-in
- Throughput: 15K msg/sec
- MIT license
- Workers Python (scraping/image-processing) y Node.js (LLM) comparten colas

Descartes:
- **Temporal**: superior para state machines complejas con human-in-the-loop de días, pero añade complejidad operacional innecesaria (4+ servicios propios)
- **Inngest/Trigger.dev**: mejores para serverless; para Docker workers con browser automation pesado, BullMQ + Redis es más simple

### Estructura de workers

**3 tipos de workers en containers Docker separados**:

1. **Crawl workers** (Playwright)
   - ~300-500MB RAM + ~1 vCPU
   - CPU/RAM heavy

2. **LLM workers** (Claude API)
   - ~50-100MB RAM
   - CPU mínimo
   - IO-bound

3. **Image-processing workers** (IOPaint)
   - On-demand GPU spot
   - No consumen VPS base entre corridas

### Reliability patterns

- **Reintentos exponenciales**: 2s → 4s → 8s → 16s → 32s (5 intentos)
- **Dead Letter Queue**: jobs fallidos se retienen para inspección
- **Idempotencia**: `source_id + source_listing_id` como key natural + `ON CONFLICT DO UPDATE`
- **Circuit breaker**: para pools de proxy y API LLM

### Monitoreo

- **Logs**: Pino structured logging → JSON → stdout
- **Metrics**: Prometheus + Grafana (self-hosted)
- **Errors**: Sentry (free tier: 5K errores/mes)
- **Queues**: Bull Board para monitoreo visual

**Métricas clave con alerts**:
| Métrica | Alert threshold |
|---------|-----------------|
| Tasa éxito extracción | < 90% |
| Latencia LLM p95 | > 10s |
| Costo LLM por listing | > $0.05 |
| Profundidad de cola | > 1000 pending |
| Tasa error proxy | > 20% |
| Tasa éxito watermark removal | < 95% |

### Escalamiento

| Escala | Sitios | Workers | Infra | Proxies | LLM API | GPU spot | **Total/mes** |
|--------|--------|---------|-------|---------|---------|----------|---------------|
| Piloto | 1-5 | 2-3 | Hetzner CPX22 €8 | $10-20 | $20-50 | $5 | **~$45-85** |
| Pequeño | 5-20 | 5-10 | Hetzner CPX42 €29 | $30-60 | $50-150 | $10-20 | **~$150-290** |
| Mediano | 20-50 | 10-25 | 2× CPX42 €58 + Redis €4 | $60-120 | $100-300 | $20-30 | **~$270-540** |
| Grande | 100+ | 50-100+ | 3-5× CCX43 €180-300 | $150-300 | $300-1000 | $30-50 | **~$690-1,690** |

---

## H) Marca: desde cero en 5 días

### Naming principles

- **Nombre inventado/coined** (NO descriptivo)
- Referencias: Zillow, Trulia, Redfin, Compass, Lamudi, Properati
- 1-2 palabras ideal
- El nombre DEBE ser la URL: "alguien debería poder escribir tu nombre entre www. y .com"
- Verificar dominio + handles sociales ANTES de enamorarse del nombre
- Neutralidad lingüística (sin connotaciones negativas en ES/FR)

### Logo rápido

- **Primario**: Looka Premium ($65) → logo SVG/PNG + brand kit (business cards, social, email)
- **Alternativa**: Brandmark ($25-175) con ediciones ilimitadas
- **MVP gratis**: Hatchful by Shopify
- **Hybrid**: Looka concept → refinamiento Fiverr ($200-500) si se necesita diferenciación luxury

### Paleta luxury Riviera Maya

60/30/10 rule:
- **60% dominante**: white abundante
- **30% secundario**: navy/charcoal
- **10% acento**: gold o deep green

Referencias: Century 21 (gold-on-black), Compass (black/white minimal).

### Tipografía

**Pair primario**: Playfair Display (serif headings, luxury) + Inter (sans body, legibilidad)

**Alternativas**:
- Cormorant Garamond + Lato (clásico + limpio)
- Montserrat + Source Sans Pro (moderno profesional)

**Regla**: máximo 2-3 fonts en todos los materiales.

### Timeline de implementación (5 días)

| Día | Tarea |
|-----|-------|
| 1 | 100 nombres con Claude → poll 5-10 personas → verificar .com → registrar dominio |
| 1-2 | Looka Premium ($65) → logo SVG/PNG color/B&W/mono |
| 2 | Seleccionar 5-6 colores (hex), 2 Google Fonts, one-page brand guide |
| 3-5 | Deploy shadcn/ui con tema customizado via `ui.shadcn.com/create` |

---

## I) Contexto legal

### Disclaimer

**Este proyecto asume postura agresiva de scraping**: ignora robots.txt, descarga y rehostea fotos, remueve watermarks. El análisis legal abajo es contexto factual, no asesoría legal.

### México: landscape

- **No hay ley federal que aborde explícitamente web scraping**
- **LFPDPPP actualizada marzo 2025**: disolvió INAI, transfirió funciones a Secretaría de Anticorrupción, amplió definición de datos personales, reforzó consentimiento
- Multas LFPDPPP: 100 a 320,000 días UMA (~$1,206 a ~$3.86M USD)
- **Ley Federal del Derecho de Autor** aplica a fotos rehosteadas

### Precedente internacional relevante

**hiQ Labs v. LinkedIn**:
- Ninth Circuit (reafirmado abril 2022 post-remand): scraping de datos públicos NO viola CFAA
- PERO hiQ pagó $500K settlement porque la corte encontró violación de TOS de LinkedIn (breach of contract)
- **Lección dual**: acceso público no es delito federal, pero claims contractuales SÍ pueden tener éxito

### Matriz de riesgo

| Actividad | Riesgo | Notas |
|-----------|--------|-------|
| Scraping datos factuales públicos | **MODERADO** | Tolerado pero TOS violation posible |
| Scraping y rehosting fotos | **ALTO** | Infracción copyright; fotógrafos RE litigan |
| Remover watermarks de fotos rehosteadas | **MARGINAL sobre el base** | Si ya hay rehosting, delta pequeño |
| Scraping datos personales (contactos agentes) | **ALTO** | Viola LFPDPPP 2025 |
| Crear cuentas falsas | **MUY ALTO** | Criminal CFAA + breach |
| Bypass medidas técnicas (CAPTCHA) | **ALTO** | DMCA anti-circumvention + CFAA |
| Partnerships con agentes que suben | **BAJO** | Industry standard |

### Estrategias de mitigación

1. **DMCA notice-and-takedown** procedure implementado
2. **Aviso de Privacidad** compliant LFPDPPP 2025
3. **Uploaders certifican derechos** sobre imágenes cuando se añaden manualmente
4. **Estructura dual**: US LLC (tech/hosting) + entidad MX (ops locales)
5. **Atribución con link** al listing original en cada página
6. **NO scrapear datos personales** de agentes (solo datos de propiedades)

### Nota específica sobre watermark removal

El riesgo del watermark removal es **marginal sobre el riesgo base del rehosting**. Si el rehosting de la foto ya es el riesgo dominante de copyright, el delta legal de remover el logo sobrepuesto es pequeño. La decisión legal que importa es **rehosting sí/no**, no **watermark sí/no**.

---

## J) Por qué build custom

**~80% del sistema requiere custom build**. Herramientas existentes evaluadas:

| Herramienta | Problema |
|-------------|----------|
| HTTrack/wget | Solo HTML estático, inútil para SPAs |
| Firecrawl | Markdown sin schemas inmobiliarios |
| Apify actors real estate | Site-specific (Zillow, Realtor); no para sitios MX arbitrarios |
| Browse AI | Carece de extracción estructurada compleja |
| Octoparse/ParseHub | No-code limitados en customización y escala |

**Limitación fundamental** de todas las no-code: extraen datos pero no proveen:
- Pipeline LLM de paráfrasis
- Traducción multilingüe
- Watermark removal
- SEO programático multilingüe

**Componentes "comprables"** (integrar, no reinventar):
- Proxies: Decodo
- CAPTCHAs: CapSolver
- GPU spot: RunPod
- Crawling primitive: Crawlee + Crawl4AI como librerías

**Componentes custom** (core value prop):
- Pipeline de extracción 3-tier
- Pipeline de paráfrasis con separación facts/prose
- Pipeline SEO multilingüe
- UI de operador
- Integración end-to-end

---

## K) Keyword research: DataForSEO

### API principal

**DataForSEO**:
- **70-90% más económico** que Semrush/Ahrefs
- Pay-as-you-go con $50 depósito sin expiración
- ~$0.0006/SERP (standard queue)

Endpoints clave:
- **Keyword Data API**: volúmenes Google Ads MX, CPC, competencia
- **DataForSEO Labs API**: hasta 4,680 sugerencias/seed, keyword difficulty
- **SERP API**: análisis real-time de competencia
- **Google Autocomplete API**: long-tail discovery
- **Clickstream Data API**: volúmenes enhanced

### Long-tail discovery gratis

**Google Autocomplete scraping** directo:
```
https://suggestqueries.google.com/complete/search?client=firefox&hl=es&gl=mx&q={query}
```

Para cada seed + letras a-z + dígitos 0-9 = ~370 variaciones.
50 seeds = 20,000 keywords long-tail en <60 segundos.

### Matriz de keywords hyperlocales

Combinatoria programática:
```python
KEYWORD_DIMENSIONS = {
    "property_type": ["departamento", "casa", "terreno", "villa", "penthouse"],
    "operation": ["en venta", "en renta", "preventa"],
    "location_level_1": ["Quintana Roo"],
    "location_level_2": ["Cancún", "Playa del Carmen", "Tulum"],
    "location_level_3": ["Playacar", "Aldea Zamá", "Zona Hotelera", ...],
    "features": ["cerca de la playa", "con alberca", "vista al mar", "amueblado"],
    "bedrooms": ["1 recámara", "2 recámaras", "3 recámaras", "4+ recámaras"],
}

# Genera combinaciones como:
# "departamento en venta en Playa del Carmen cerca de la playa"
# "penthouse en renta en Cancún zona hotelera"
# "casa en venta en Tulum Aldea Zamá con alberca"
```

### Integración al pipeline

```
Nuevo listing llega a DB con datos estructurados
  →
Keyword generator combina:
  - Primary: {property_type} en venta en {city}
  - Secondary: {property_type} en {neighborhood} {bedrooms}
  - Long-tail: {property_type} con {amenity} en {city}
  →
DataForSEO API enriquece con volúmenes y dificultad
  →
Priorización: volume × (1/difficulty)
  →
Inyección a:
  - Meta tags (title, description)
  - H1s, H2s
  - Body text (via template)
```

### Costos estimados

- **Setup inicial**: $150-200 (10K seeds × autocomplete + enrichment)
- **Ongoing**: ~$50-100/mes (tracking + discovery incremental)
- **Rank tracking**: top 500-1,000 keywords semanales a $0.0006/check = ~$25/mes

**Total SEO tooling**: ~$100-200/mes (fracción de Semrush $550+ o Ahrefs $949+).

---

## Arquitectura completa del sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLI + WEB UI (OPERADOR)                       │
│  Trigger crawl • Bbox drawing • Aprobación humana • Dashboard        │
└─────────────────────────────────────┬────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BullMQ + Redis (Orquestación)                    │
│  FlowProducer: CRAWL → EXTRACT → IMG-PROC → PARAPHRASE →            │
│                TRANSLATE → PUBLISH                                   │
└───┬───────────┬───────────┬───────────┬───────────┬───────────┬──────┘
    │          │          │          │          │          │
    ▼          ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
│ CRAWL  │ │EXTRACT │ │IMG-PROC│ │PARAPHR.│ │TRANSL. │ │ PUBLISH │
│Workers │ │Workers │ │Workers │ │Workers │ │Workers │ │ Workers │
│        │ │        │ │        │ │        │ │        │ │         │
│Crawlee │ │extruct │ │IOPaint │ │Claude  │ │Claude  │ │Payload  │
│Playwr. │ │Crawl4AI│ │+ LaMa  │ │Sonnet  │ │Sonnet  │ │CMS API  │
│Stealth │ │instruct│ │(GPU    │ │(Batch) │ │ES→EN/FR│ │+ R2 up. │
│Decodo  │ │or+Haiku│ │spot    │ │        │ │(Batch) │ │         │
│proxies │ │Pydantic│ │RunPod) │ │Facts→  │ │Keywords│ │Review   │
│        │ │        │ │Fallback│ │template│ │injected│ │gate     │
│        │ │        │ │Florence│ │        │ │        │ │(human)  │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬────┘
    │          │          │          │          │           │
    ▼          ▼          ▼          ▼          ▼           ▼
┌──────────────────────────────────────────────────────────────────────┐
│              PostgreSQL + PostGIS (Supabase/Self-hosted)              │
│  properties • sources(watermark_config) • crawl_runs • images        │
│  (original_url + clean_url) • amenities • changes                    │
└──────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Next.js 15 App Router + Payload CMS (Frontend)          │
│  ISR on-demand revalidation • /es/ /en/ /fr/ • hreflang • Schema.org │
│  shadcn/ui + Tailwind v4 • Cloudflare R2 images • Leaflet maps      │
│  GA4 + Meta Pixel auto-inject • IndexNow • Dynamic XML sitemaps      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Resumen de costos mensuales

| Capa | Tecnología | Costo/mes (piloto→100+) |
|------|-----------|------------------------|
| Framework scraping | Crawlee + PlaywrightCrawler | $0 |
| Anti-bot/stealth | playwright-extra + stealth | $0 |
| Proxies | Decodo residential MX | $10-300 |
| CAPTCHAs | CapSolver | <$1-5 |
| Extracción | extruct + Crawl4AI + instructor + Haiku | $5-100 |
| **Watermark removal** | **IOPaint + LaMa (RunPod GPU spot)** | **$5-50** |
| Fallback detección auto | WatermarkRemover-AI + Florence-2 (YAGNI) | $0-20 |
| Paráfrasis/traducción | Claude Sonnet (Batch API) | $15-900 |
| Keyword research | DataForSEO API | $50-100 |
| Base de datos | Supabase Pro → self-hosted | $25-28 |
| Orquestación | BullMQ + Redis (self-hosted) | $0 |
| CMS | Payload CMS (self-hosted) | $0-35 |
| Imágenes CDN | Cloudflare R2 | $3-20 |
| Servidores | Hetzner VPS workers | $8-300 |
| Hosting frontend | Vercel | $0-20 |
| Mapas | Leaflet + OpenStreetMap | $0 |
| Búsqueda | PostgreSQL FTS → Typesense | $0-20 |
| UI components | shadcn/ui + Tailwind | $0 |
| Monitoreo | Sentry + Grafana | $0 |
| SEO indexación | IndexNow + GSC API | $0 |
| Branding | Looka/Brandmark | $65-175 setup |
| **TOTAL MENSUAL** | | **$45-1,690** |

---

## Roadmap de implementación

### Fase 1 — Foundation (semanas 1-4)

**Objetivo**: End-to-end extraction + storage funcionando con 1 sitio real de Playa del Carmen.

Entregables:
- [ ] Monorepo setup (Turborepo o pnpm workspaces)
- [ ] Schema PostgreSQL + migrations con PostGIS
- [ ] Supabase Pro provisioning
- [ ] BullMQ + Redis deployment (Hetzner CPX22)
- [ ] Crawl worker con Crawlee + Playwright + Decodo proxies
- [ ] Extract worker: Tier 1 (extruct) + Tier 3 (instructor + Haiku)
- [ ] Pydantic schemas para PropertyListing
- [ ] CLI mínimo: `pnpm crawl <domain>`
- [ ] Testing end-to-end: 1 sitio inmobiliario → 20+ properties en DB

**NO hacer en esta fase**:
- Paráfrasis (solo almacenar datos raw)
- Traducción
- Frontend
- Watermark removal
- SEO

### Fase 2 — Content pipeline (semanas 5-8)

**Objetivo**: Pipeline de contenido completo con watermark removal + frontend MVP publicable.

Entregables:
- [ ] Paraphrase worker: Claude Sonnet con separación facts/prose
- [ ] Translate workers: ES→EN y ES→FR con Sonnet + Batch API
- [ ] Validation layer: regex fact-check + semantic similarity
- [ ] **Watermark removal subsystem** (5 días):
  - [ ] Día 1: IOPaint como servidor HTTP en Docker
  - [ ] Día 2: Integración BullMQ worker Python
  - [ ] Día 3: UI admin con canvas React para dibujar bbox
  - [ ] Día 4: Schema migrations (`watermark_config`) + approval flow
  - [ ] Día 5: Testing end-to-end con 3 sitios reales
- [ ] Payload CMS deployment
- [ ] Next.js 15 App Router MVP con listings básicos
- [ ] Cloudflare R2 image pipeline
- [ ] **Branding rápido** (5 días en paralelo):
  - [ ] Nombre + dominio
  - [ ] Logo (Looka)
  - [ ] Brand guide one-pager
  - [ ] shadcn/ui themed

### Fase 3 — SEO + operator UI (semanas 9-12)

**Objetivo**: Sistema publicable con SEO completo y UI de operador funcional.

Entregables:
- [ ] Schema.org JSON-LD generator para listings
- [ ] Hreflang bidireccional via XML sitemaps
- [ ] Dynamic sitemaps con `<lastmod>`
- [ ] IndexNow integration
- [ ] Meta templates programáticos (title, description, H1)
- [ ] Internal linking hub-and-spoke
- [ ] DataForSEO integration para keyword research
- [ ] Keyword injection en templates
- [ ] UI operador:
  - [ ] Source management (añadir/editar dominios)
  - [ ] Watermark bbox drawing
  - [ ] Crawl trigger + monitoring
  - [ ] Review queue (aprobación antes de publicar)
  - [ ] Dashboard con métricas
- [ ] Escalar a 5 sitios validando flow completo
- [ ] GA4 + Meta Pixel auto-inject

### Fase 4 — Scale (mes 4+)

**Objetivo**: Escalar a 20→100+ sitios optimizando costos.

Entregables (por demanda):
- [ ] Escalar de 20 a 50 a 100+ sitios
- [ ] Optimización LLM: Batch API + prompt caching agresivo
- [ ] Tier 2 extraction (schema CSS autogenerado) para sitios recurrentes
- [ ] Migración PostgreSQL FTS → Typesense cuando >10K listings
- [ ] Evaluación Florence-2 fallback (YAGNI hasta que se pruebe necesidad)
- [ ] Migración Supabase → self-hosted Postgres Hetzner si se necesita más compute
- [ ] Monitoring avanzado con Grafana dashboards
- [ ] Refinamiento UI/UX del marketplace basado en analytics reales

---

## Reglas de desarrollo para Claude Code

Cuando trabajes en este proyecto, sigue estas reglas:

### Principios de código

1. **TypeScript estricto**. `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
2. **Pydantic para Python workers**. Nunca dicts raw para datos estructurados.
3. **No HTML parsing ad-hoc**. Usar `extruct` (Tier 1), `Crawl4AI generate_schema` (Tier 2), o `instructor` (Tier 3). En ese orden.
4. **Los hechos nunca pasan por el LLM**. Si estás escribiendo un prompt que incluye un precio, m², o cualquier número factual, **detente y reescribe** usando placeholders.
5. **Idempotencia obligatoria** en todos los workers. `source_id + source_listing_id` como key natural + `ON CONFLICT DO UPDATE`.
6. **Batch API siempre** que sea posible para llamadas Claude no-realtime (50% descuento).
7. **Prompt caching** para system prompts estables (90% descuento en tokens cacheados).

### Convenciones de naming

- **Database**: snake_case (PostgreSQL convention)
- **TypeScript**: camelCase para vars/funciones, PascalCase para tipos/componentes
- **Python**: snake_case para todo excepto classes (PascalCase)
- **URLs**: kebab-case
- **Env vars**: SCREAMING_SNAKE_CASE

### Estructura del monorepo sugerida

```
/apps
  /web              # Next.js 15 frontend público
  /admin            # UI operador (puede ser parte de Payload)
  /api              # Payload CMS (opcional si no es embed)
/packages
  /database         # Prisma/Drizzle schema + migrations
  /extraction       # Tier 1/2/3 extractors (Python package)
  /paraphrase       # Prompts + validation (Python package)
  /workers          # BullMQ workers
    /crawl
    /extract
    /image-processing
    /paraphrase
    /translate
    /publish
  /shared-types     # Tipos compartidos TS
/infra
  /docker           # Dockerfiles + docker-compose
  /terraform        # Si se usa IaC
```

### Testing mínimo

- **Unit tests** para:
  - Funciones de normalización de direcciones
  - Extracción de hechos con regex
  - Template rendering
  - Dedup logic
- **Integration tests** para:
  - Flujo crawl → extract → DB
  - Flujo paraphrase → validate
  - Watermark removal end-to-end
- **E2E tests** con 1 sitio fixture en HTML local (no scrapear en CI)

### Observabilidad desde el día 1

- Structured logging con Pino (TS) o structlog (Python)
- Cada job BullMQ debe loggear: `source_id`, `crawl_run_id`, `duration_ms`, `status`
- Costos LLM trackeados por job: `input_tokens`, `output_tokens`, `cost_usd`
- Alerts en Sentry para cualquier `status === 'failed'`

### Variables de entorno críticas

```bash
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Proxies
DECODO_USERNAME=...
DECODO_PASSWORD=...
DECODO_ENDPOINT=gate.decodo.com:7000

# CAPTCHA
CAPSOLVER_API_KEY=...

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...

# SEO
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...

# GPU (on-demand)
RUNPOD_API_KEY=...

# Frontend
NEXT_PUBLIC_GA4_ID=...
NEXT_PUBLIC_META_PIXEL_ID=...
```

### Qué NO hacer

- ✗ No pases HTML crudo al LLM (siempre pre-limpiar con Crawl4AI)
- ✗ No pases números factuales al LLM
- ✗ No uses Opus para procesamiento batch (Sonnet es suficiente)
- ✗ No implementes Florence-2 fallback hasta que bbox fija falle en datos reales
- ✗ No uses Selenium, Puppeteer, o Scrapy (usar Crawlee)
- ✗ No uses S3/CloudFront para imágenes (R2 es mejor y más barato)
- ✗ No uses Redux/Zustand en el frontend a menos que sea estrictamente necesario (RSC + URL state)
- ✗ No implementes auth custom en el admin (usar Payload built-in o Supabase Auth)
- ✗ No implementes búsqueda custom antes de intentar PostgreSQL FTS
- ✗ No hardcodees keywords SEO (siempre via templates + DataForSEO)

---

## Referencias técnicas

### Librerías principales

- [Crawlee](https://crawlee.dev/) - Web scraping framework
- [Crawl4AI](https://github.com/unclecode/crawl4ai) - AI-friendly web crawler
- [extruct](https://github.com/scrapinghub/extruct) - Structured data extraction
- [instructor](https://github.com/instructor-ai/instructor) - LLM structured outputs
- [IOPaint](https://github.com/Sanster/IOPaint) - Image inpainting (watermark removal)
- [Payload CMS](https://payloadcms.com/) - Headless CMS
- [BullMQ](https://docs.bullmq.io/) - Queue system
- [Next.js](https://nextjs.org/) - React framework
- [shadcn/ui](https://ui.shadcn.com/) - UI components

### APIs

- [Anthropic Claude API](https://docs.anthropic.com/) - LLM
- [DataForSEO](https://dataforseo.com/apis) - Keyword research
- [Decodo](https://decodo.com/) - Residential proxies
- [CapSolver](https://www.capsolver.com/) - CAPTCHA solving
- [Cloudflare R2](https://developers.cloudflare.com/r2/) - Object storage
- [RunPod](https://www.runpod.io/) - GPU spot instances

### Documentación SEO

- [Schema.org RealEstateListing](https://schema.org/RealEstateListing)
- [Google hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [IndexNow protocol](https://www.indexnow.org/)

---

**Fin del documento. Versión 2.0 — incluye subsistema de watermark removal.**
