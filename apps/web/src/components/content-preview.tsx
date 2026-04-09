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

  const contents: Record<string, LocalizedContent | null> = {
    es: contentEs,
    en: contentEn,
    fr: contentFr,
  };

  const active = contents[activeLocale];
  const hasAnyContent = contentEs || contentEn || contentFr;

  // Fallback to raw description if no paraphrased content
  const rawDescription = rawData["description"] as string | undefined;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Content Preview
        </h2>

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

      {hasAnyContent && active ? (
        <div className="space-y-4">
          {/* SEO Preview */}
          <Card className="border-dashed">
            <CardContent className="py-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                SEO Preview
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
          <Card>
            <CardContent className="py-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                H1 Heading
              </p>
              <h3 className="text-lg font-semibold">{active.h1 ?? "—"}</h3>
            </CardContent>
          </Card>

          {/* Title */}
          <Card>
            <CardContent className="py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Paraphrased Title
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {activeLocale.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm font-medium">{active.title ?? "—"}</p>
            </CardContent>
          </Card>

          {/* Description */}
          <Card>
            <CardContent className="py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Paraphrased Description
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {activeLocale.toUpperCase()}
                </Badge>
              </div>
              <div className="max-h-[500px] overflow-auto text-sm leading-7 text-foreground/80 whitespace-pre-line">
                {cleanText(active.description ?? "")}
              </div>
            </CardContent>
          </Card>
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
        /* Fallback: raw description */
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Original Description (not yet paraphrased)
              </p>
              <Badge variant="secondary" className="text-[10px]">
                RAW
              </Badge>
            </div>
            <div className="max-h-[400px] overflow-auto text-sm leading-7 text-foreground/60 whitespace-pre-line">
              {rawDescription ? cleanText(rawDescription) : "No description available"}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\t/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
