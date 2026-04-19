"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ListingGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
  });
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (images.length <= 1) return null;

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-2">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              className={cn(
                "relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border transition-all",
                "hover:ring-foreground/30",
                selected === i && "ring-2 ring-foreground",
              )}
              aria-label={`Imagen ${i + 1} de ${images.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${alt} — ${i + 1}`}
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      <div className="absolute inset-y-0 left-0 flex items-center">
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={!canPrev}
          aria-label="Anterior"
          className="shadow-md"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center">
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() => emblaApi?.scrollNext()}
          disabled={!canNext}
          aria-label="Siguiente"
          className="shadow-md"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>

      <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
        {selected + 1} / {images.length}
      </p>
    </div>
  );
}
