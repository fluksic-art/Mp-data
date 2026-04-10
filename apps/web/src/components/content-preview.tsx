"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LocalizedContent {
  title?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
}

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
  contentEs: Record<string, string> | null;
  contentEn: Record<string, string> | null;
  contentFr: Record<string, string> | null;
  rawData: Record<string, unknown>;
}) {
  const [activeLocale, setActiveLocale] = useState<"es" | "en" | "fr">("es");
  const [showOriginal, setShowOriginal] = useState(false);

  const contents: Record<string, LocalizedContent | null> = {
    es: contentEs,
    en: contentEn,
    fr: contentFr,
  };

  const active = contents[activeLocale];
  const hasAnyContent = contentEs || contentEn || contentFr;

  const rawDescription = rawData["description"] as string | undefined;
  const rawName = rawData["name"] as string | undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Content Preview
        </h2>

        <div className="flex items-center gap-2">
          {/* Compare toggle */}
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

          {/* Locale tabs */}
          <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
            {LOCALES.map((locale) => {
              const hasContent = contents[locale.key] !== null;
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
        <div className="space-y-4">
          {/* SEO Preview */}
          <Card className="border-dashed">
            <CardContent className="py-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                SEO Preview (Google SERP)
              </p>
              <p className="text-base font-medium text-blue-700">
                {active.metaTitle ?? active.title ?? "—"}
              </p>
              <p className="mt-0.5 text-xs text-green-700">
                example.com/{activeLocale}/quintana-roo/...
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {active.metaDescription ?? "—"}
              </p>
            </CardContent>
          </Card>

          {/* H1 */}
          <CompareBlock
            label="H1 Heading"
            locale={activeLocale}
            showOriginal={showOriginal}
            originalValue={cleanText(rawName ?? "")}
            paraphrasedValue={active.h1 ?? "—"}
            variant="heading"
          />

          {/* Title */}
          <CompareBlock
            label="Title"
            locale={activeLocale}
            showOriginal={showOriginal}
            originalValue={cleanText(rawName ?? "")}
            paraphrasedValue={active.title ?? "—"}
          />

          {/* Description */}
          <CompareBlock
            label="Description"
            locale={activeLocale}
            showOriginal={showOriginal}
            originalValue={cleanText(rawDescription ?? "")}
            paraphrasedValue={cleanText(active.description ?? "")}
            long
          />
        </div>
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
        /* Fallback: raw content only */
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
      {/* Original */}
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

      {/* Paraphrased */}
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
