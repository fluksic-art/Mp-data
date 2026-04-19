"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  List,
  BarChart3,
  ShieldCheck,
  Wand2,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

const navigate = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, shortcut: "G D", key: "d" },
  { href: "/admin/listings", label: "Listings", icon: List, shortcut: "G L", key: "l" },
  { href: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3, shortcut: "G E", key: "e" },
  { href: "/admin/supervisor", label: "Supervisor", icon: ShieldCheck, shortcut: "G S", key: "s" },
  { href: "/admin/optimizer", label: "Optimizer", icon: Wand2, shortcut: "G O", key: "o" },
] as const;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const gPrefixAt = useRef<number>(0);

  useEffect(() => {
    const PREFIX_WINDOW_MS = 1200;

    const handler = (e: KeyboardEvent) => {
      // ⌘K / Ctrl-K toggle
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        gPrefixAt.current = 0;
        return;
      }

      // Ignore while typing or when a modifier is pressed
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (open) return;

      // "G" starts a prefix window
      if (e.key === "g" || e.key === "G") {
        gPrefixAt.current = Date.now();
        return;
      }

      // Within the G-prefix window, dispatch on the second key
      if (gPrefixAt.current && Date.now() - gPrefixAt.current < PREFIX_WINDOW_MS) {
        const match = navigate.find((n) => n.key === e.key.toLowerCase());
        if (match) {
          e.preventDefault();
          gPrefixAt.current = 0;
          router.push(match.href);
          return;
        }
        gPrefixAt.current = 0;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, router]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas, acciones..." />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Navegar">
          {navigate.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() => run(() => router.push(item.href))}
              >
                <Icon />
                <span>{item.label}</span>
                <CommandShortcut>{item.shortcut}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Preferencias">
          <CommandItem
            value="tema claro"
            onSelect={() => run(() => setTheme("light"))}
          >
            <Sun />
            <span>Tema claro</span>
            {resolvedTheme === "light" ? <CommandShortcut>actual</CommandShortcut> : null}
          </CommandItem>
          <CommandItem
            value="tema oscuro"
            onSelect={() => run(() => setTheme("dark"))}
          >
            <Moon />
            <span>Tema oscuro</span>
            {resolvedTheme === "dark" ? <CommandShortcut>actual</CommandShortcut> : null}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Sesión">
          <CommandItem
            value="cerrar sesion"
            onSelect={() => run(() => router.push("/admin/login"))}
          >
            <LogOut />
            <span>Cerrar sesión</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
