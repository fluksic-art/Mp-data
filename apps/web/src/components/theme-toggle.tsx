"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={mounted ? (isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro") : "Cambiar tema"}
      onClick={() => mounted && setTheme(isDark ? "light" : "dark")}
      suppressHydrationWarning
    >
      {mounted ? (
        isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />
      ) : (
        <Sun className="size-3.5 opacity-0" />
      )}
    </Button>
  );
}
