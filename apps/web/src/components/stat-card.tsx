"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: number;
  /** Optional display formatter (e.g. currency, percent). Applied to NumberFlow format prop. */
  format?: Format;
  /** Unit rendered after the number (e.g. "%", "USD", "m²"). Plain text. */
  suffix?: string;
  prefix?: string;
  /** +/- percentage versus previous period. Positive = up, negative = down, 0/undefined = flat. */
  deltaPct?: number | null;
  deltaLabel?: string;
  icon?: ReactNode;
  className?: string;
  /** Visual prominence. "hero" uses display font + larger. */
  variant?: "default" | "hero";
}

function TrendBadge({ deltaPct }: { deltaPct: number | null | undefined }) {
  if (deltaPct === null || deltaPct === undefined) return null;
  const positive = deltaPct > 0;
  const negative = deltaPct < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;
  const color = positive
    ? "text-success bg-success/10"
    : negative
      ? "text-destructive bg-destructive/10"
      : "text-muted-foreground bg-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        color,
      )}
    >
      <Icon className="size-3" />
      {Math.abs(deltaPct).toFixed(1)}%
    </span>
  );
}

export function StatCard({
  label,
  value,
  format,
  suffix,
  prefix,
  deltaPct,
  deltaLabel,
  icon,
  className,
  variant = "default",
}: StatCardProps) {
  const isHero = variant === "hero";
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border transition-all",
        "hover:ring-foreground/20 hover:shadow-sm",
        isHero && "p-6 md:p-8",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-eyebrow">{label}</p>
        {icon ? <div className="text-muted-foreground/70">{icon}</div> : null}
      </div>
      <div className={cn("flex items-baseline gap-1.5", isHero && "gap-2")}>
        {prefix ? (
          <span
            className={cn(
              "text-muted-foreground tabular-nums",
              isHero ? "text-2xl md:text-3xl" : "text-lg",
            )}
          >
            {prefix}
          </span>
        ) : null}
        <NumberFlow
          value={value}
          format={format}
          className={cn(
            "tabular-nums tracking-tight",
            isHero ? "text-display-lg" : "text-2xl font-semibold",
          )}
        />
        {suffix ? (
          <span
            className={cn(
              "text-muted-foreground tabular-nums",
              isHero ? "text-xl md:text-2xl" : "text-sm",
            )}
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {deltaPct !== undefined && deltaPct !== null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TrendBadge deltaPct={deltaPct} />
          {deltaLabel ? <span>{deltaLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
