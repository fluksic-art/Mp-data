"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// NOTE: StructuredContent is duplicated here (not imported from @mpgenesis/shared)
// because the shared package's barrel export pulls in BullMQ, which requires
// `worker_threads` and crashes the browser bundle. Keep this in sync with
// packages/shared/src/schemas/structured-content.ts.
interface StructuredContent {
  contentVersion: 2;
  hero: { h1: string; intro: string };
  features: { heading: string; body: string };
  location: { heading: string; body: string };
  lifestyle: { heading: string; body: string };
  faq: Array<{ question: string; answer: string }>;
  metaTitle: string;
  metaDescription: string;
}

function isStructuredContent(value: unknown): value is StructuredContent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v["contentVersion"] === 2 &&
    typeof v["hero"] === "object" &&
    typeof v["features"] === "object" &&
    typeof v["location"] === "object" &&
    typeof v["lifestyle"] === "object" &&
    Array.isArray(v["faq"])
  );
}

interface LegacyContent {
  title?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
}

type LocaleKey = "es" | "en" | "fr";

const LOCALES = [
  { key: "es", label: "Espanol", flag: "ES" },
  { key: "en", label: "English", flag: "EN" },
  { key: "fr", label: "Francais", flag: "FR" },
] as const;

export function ContentPreview({
  contentEs,
  contentEn,
  contentFr,
  rawData,
}: {
  contentEs: unknown;
  contentEn: unknown;
  contentFr: unknown;
  rawData: Record<string, unknown>;
}) {
  const [activeLocale, setActiveLocale] = useState<LocaleKey>("es");
  const [showOriginal, setShowOriginal] = useState(false);

  const contents: Record<LocaleKey, unknown> = {
    es: contentEs,
    en: contentEn,
    fr: contentFr,
  };

  const active = contents[activeLocale];
  const hasAnyContent = Boolean(contentEs || contentEn || contentFr);

  const rawDescription = rawData["description"] as string | undefined;
  const rawName = rawData["name"] as string | undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Content Preview
        </h2>

        <div className="flex items-center gap-2">
          {hasAnyContent && rawDescription && (
            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                showOriginal
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {showOriginal ? "Hide original" : "Compare with original"}
            </button>
          )}

          <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
            {LOCALES.map((locale) => {
              const hasContent = contents[locale.key] != null;
              return (
                <button
                  key={locale.key}
                  onClick={() => setActiveLocale(locale.key)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeLocale === locale.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {locale.flag}
                  {hasContent ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {hasAnyContent && active ? (
        isStructuredContent(active) ? (
          <StructuredPreview
            content={active}
            locale={activeLocale}
            showOriginal={showOriginal}
            rawDescription={rawDescription ?? ""}
            rawName={rawName ?? ""}
          />
        ) : (
          <LegacyPreview
            content={active as LegacyContent}
            locale={activeLocale}
            showOriginal={showOriginal}
            rawDescription={rawDescription ?? ""}
            rawName={rawName ?? ""}
          />
        )
      ) : hasAnyContent ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No content for{" "}
              {LOCALES.find((l) => l.key === activeLocale)?.label}. Select
              another language.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Original (not yet paraphrased)
              </p>
              <Badge variant="secondary" className="text-[10px]">
                RAW
              </Badge>
            </div>
            <p className="mb-3 text-sm font-medium">
              {cleanText(rawName ?? "—")}
            </p>
            <div className="max-h-[400px] overflow-auto text-sm leading-7 text-foreground/60 whitespace-pre-line">
              {rawDescription
                ? cleanText(rawDescription)
                : "No description available"}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** V2 structured content preview: 5 blocks + FAQ + SEO preview. */
function StructuredPreview({
  content,
  locale,
  showOriginal,
  rawDescription,
  rawName,
}: {
  content: StructuredContent;
  locale: LocaleKey;
  showOriginal: boolean;
  rawDescription: string;
  rawName: string;
}) {
  return (
    <div className="space-y-4">
      {/* SEO Preview */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            SEO Preview (Google SERP)
          </p>
          <p className="text-base font-medium text-blue-700">
            {content.metaTitle || "—"}
          </p>
          <p className="mt-0.5 text-xs text-green-700">
            example.com/{locale}/quintana-roo/...
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {content.metaDescription || "—"}
          </p>
          <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
            <span>metaTitle: {content.metaTitle.length}c</span>
            <span>metaDescription: {content.metaDescription.length}c</span>
            <span>faq: {content.faq.length}</span>
            <Badge variant="outline" className="text-[10px]">
              v2
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Optional: show raw source on top when comparing */}
      {showOriginal && rawDescription && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Original source (RAW)
              </p>
              <Badge variant="secondary" className="text-[10px]">
                RAW
              </Badge>
            </div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              {cleanText(rawName)}
            </p>
            <div className="max-h-[300px] overflow-auto text-xs leading-6 whitespace-pre-line text-muted-foreground">
              {cleanText(rawDescription)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* H1 */}
      <StructuredBlock
        label="H1 Heading"
        locale={locale}
        value={content.hero.h1}
        variant="heading"
      />

      {/* Hero intro */}
      <StructuredBlock
        label="Hero intro"
        locale={locale}
        value={content.hero.intro}
        wordCount
        long
      />

      {/* Features */}
      <StructuredBlock
        label={content.features.heading || "Features"}
        locale={locale}
        value={content.features.body}
        wordCount
        long
      />

      {/* Location */}
      <StructuredBlock
        label={content.location.heading || "Location"}
        locale={locale}
        value={content.location.body}
        wordCount
        long
      />

      {/* Lifestyle */}
      <StructuredBlock
        label={content.lifestyle.heading || "Lifestyle"}
        locale={locale}
        value={content.lifestyle.body}
        wordCount
        long
      />

      {/* FAQ */}
      {content.faq.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                FAQ ({content.faq.length})
              </p>
              <Badge variant="outline" className="text-[10px]">
                {locale.toUpperCase()}
              </Badge>
            </div>
            <div className="space-y-3">
              {content.faq.map((f, i) => (
                <div key={i} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-sm font-medium text-foreground/90">
                    {f.question}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-foreground/70">
                    {f.answer}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** V1 legacy content preview — fallback for older content. */
function LegacyPreview({
  content,
  locale,
  showOriginal,
  rawDescription,
  rawName,
}: {
  content: LegacyContent;
  locale: LocaleKey;
  showOriginal: boolean;
  rawDescription: string;
  rawName: string;
}) {
  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              SEO Preview (Google SERP)
            </p>
            <Badge variant="secondary" className="text-[10px]">
              legacy v1
            </Badge>
          </div>
          <p className="text-base font-medium text-blue-700">
            {content.metaTitle ?? content.title ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-green-700">
            example.com/{locale}/quintana-roo/...
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {content.metaDescription ?? "—"}
          </p>
        </CardContent>
      </Card>

      <CompareBlock
        label="H1 Heading"
        locale={locale}
        showOriginal={showOriginal}
        originalValue={cleanText(rawName)}
        paraphrasedValue={content.h1 ?? "—"}
        variant="heading"
      />

      <CompareBlock
        label="Title"
        locale={locale}
        showOriginal={showOriginal}
        originalValue={cleanText(rawName)}
        paraphrasedValue={content.title ?? "—"}
      />

      <CompareBlock
        label="Description"
        locale={locale}
        showOriginal={showOriginal}
        originalValue={cleanText(rawDescription)}
        paraphrasedValue={cleanText(content.description ?? "")}
        long
      />
    </div>
  );
}

function StructuredBlock({
  label,
  locale,
  value,
  variant = "body",
  long = false,
  wordCount = false,
}: {
  label: string;
  locale: LocaleKey;
  value: string;
  variant?: "heading" | "body";
  long?: boolean;
  wordCount?: boolean;
}) {
  const textClass = long
    ? "text-sm leading-7 whitespace-pre-line"
    : variant === "heading"
      ? "text-lg font-semibold"
      : "text-sm font-medium";
  const maxHeight = long ? "max-h-[500px] overflow-auto" : "";
  const words = wordCount
    ? value.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div className="flex items-center gap-2">
            {wordCount && (
              <span className="text-[10px] text-muted-foreground">
                {words}w
              </span>
            )}
            <Badge variant="outline" className="text-[10px]">
              {locale.toUpperCase()}
            </Badge>
          </div>
        </div>
        <div className={`${textClass} ${maxHeight} text-foreground/80`}>
          {value || "—"}
        </div>
      </CardContent>
    </Card>
  );
}

function CompareBlock({
  label,
  locale,
  showOriginal,
  originalValue,
  paraphrasedValue,
  long = false,
  variant = "body",
}: {
  label: string;
  locale: string;
  showOriginal: boolean;
  originalValue: string;
  paraphrasedValue: string;
  long?: boolean;
  variant?: "heading" | "body";
}) {
  const textClass = long
    ? "text-sm leading-7 whitespace-pre-line"
    : variant === "heading"
      ? "text-lg font-semibold"
      : "text-sm font-medium";
  const maxHeight = long ? "max-h-[500px] overflow-auto" : "";

  if (!showOriginal) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <Badge variant="outline" className="text-[10px]">
              {locale.toUpperCase()}
            </Badge>
          </div>
          <div className={`${textClass} ${maxHeight} text-foreground/80`}>
            {paraphrasedValue}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {label} (Original)
            </p>
            <Badge variant="secondary" className="text-[10px]">
              RAW
            </Badge>
          </div>
          <div
            className={`${textClass} ${maxHeight} text-muted-foreground`}
          >
            {originalValue || "—"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {label} (Paraphrased)
            </p>
            <Badge variant="outline" className="text-[10px]">
              {locale.toUpperCase()}
            </Badge>
          </div>
          <div className={`${textClass} ${maxHeight} text-foreground/80`}>
            {paraphrasedValue}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\t/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
