"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface PropertyCardProps {
  id: string;
  href: string;
  title: string;
  priceDisplay: string;
  priceSubtitle?: string;
  location?: string;
  imageUrl?: string | null;
  imageAlt?: string;
  badges?: Array<{ label: string; tone?: "default" | "success" | "warning" | "info" }>;
  meta?: { label: string; value: string }[];
  className?: string;
}

const badgeTone = {
  default: "bg-foreground/80 text-background",
  success: "bg-success/90 text-success-foreground",
  warning: "bg-warning/90 text-warning-foreground",
  info: "bg-info/90 text-info-foreground",
} as const;

export function PropertyCard({
  href,
  title,
  priceDisplay,
  priceSubtitle,
  location,
  imageUrl,
  imageAlt,
  badges,
  meta,
  className,
}: PropertyCardProps) {
  return (
    <Link
      href={href}
      transitionTypes={["nav-forward"]}
      className={cn(
        "group/prop relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-border transition-all",
        "hover:-translate-y-0.5 hover:shadow-lg hover:ring-foreground/20",
        className,
      )}
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={imageAlt ?? title}
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover/prop:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            Sin imagen
          </div>
        )}
        {badges && badges.length > 0 ? (
          <div className="absolute top-3 left-3 flex flex-wrap gap-1">
            {badges.map((b, i) => (
              <span
                key={`${b.label}-${i}`}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm",
                  badgeTone[b.tone ?? "default"],
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-display-md !text-xl tabular-nums leading-none">{priceDisplay}</p>
          {priceSubtitle ? (
            <span className="text-xs text-muted-foreground tabular-nums">{priceSubtitle}</span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm font-medium text-foreground">{title}</p>
        {location ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {location}
          </p>
        ) : null}
        {meta && meta.length > 0 ? (
          <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">
            {meta.map((m) => (
              <div key={m.label} className="flex items-center gap-1">
                <dt className="uppercase tracking-wider text-[10px]">{m.label}</dt>
                <dd className="font-medium text-foreground tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </Link>
  );
}

export { Badge };
