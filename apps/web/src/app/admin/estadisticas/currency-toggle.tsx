"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const CURRENCIES = ["MXN", "USD"] as const;

export function CurrencyToggle({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setCurrency(c: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("currency", c);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex gap-1 rounded-md border bg-background p-0.5">
      {CURRENCIES.map((c) => (
        <Button
          key={c}
          variant={current === c ? "default" : "ghost"}
          size="xs"
          onClick={() => setCurrency(c)}
          className="h-7 px-3 text-xs"
        >
          {c}
        </Button>
      ))}
    </div>
  );
}
