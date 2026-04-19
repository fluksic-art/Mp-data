import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  List,
  BarChart3,
  ShieldCheck,
  Wand2,
  LogOut,
  KeyRound,
  Search,
} from "lucide-react";
import { isAuthenticated, destroySession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Admin — MPgenesis",
};

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/listings", label: "Listings", icon: List },
  { href: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { href: "/admin/supervisor", label: "Supervisor", icon: ShieldCheck },
  { href: "/admin/optimizer", label: "Optimizer", icon: Wand2 },
] as const;

const navItemsDisabled = [
  { label: "Sources", note: "Fase 3" },
  { label: "Leads", note: "Fase 2" },
  { label: "Crawl Runs", note: "Fase 3" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAuthenticated();
  if (!authed) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar">
      <aside
        data-admin-shell
        className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className="flex h-14 items-center gap-2.5 px-5">
          <div className="grid size-7 place-items-center rounded-lg bg-primary font-display text-xs font-semibold text-primary-foreground shadow-sm">
            M
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none tracking-tight">
              MPgenesis
            </p>
            <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              Admin
            </p>
          </div>
        </div>

        <div className="px-3 pb-2">
          <CommandTrigger />
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3">
          <div>
            <ul className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground"
                    >
                      <Icon className="size-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Próximamente
            </p>
            <ul className="space-y-0.5">
              {navItemsDisabled.map((item) => (
                <li key={item.label}>
                  <span className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground/50">
                    {item.label}
                    <span className="text-[10px] uppercase tracking-wider">
                      {item.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <Separator />
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <p className="text-[11px] font-medium leading-none text-foreground/80">
              v0.1.0
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Fase 1
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={logout}>
              <Button
                variant="ghost"
                size="icon-sm"
                type="submit"
                aria-label="Cerrar sesión"
              >
                <LogOut className="size-3.5" />
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <main className="relative flex-1 overflow-auto bg-background">
        <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
      </main>

      <CommandPalette />
    </div>
  );
}

function CommandTrigger() {
  // Client-side keybind lives in <CommandPalette/>. This is a visual hint
  // + a clickable target that dispatches a synthetic ⌘K via onClick handler
  // in the client palette (it listens globally), so visually we just render.
  return (
    <label className="group flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/50 px-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground">
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Buscar o saltar a...</span>
      <kbd className="ml-auto inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
        <KeyRound className="size-2.5" />K
      </kbd>
    </label>
  );
}

async function logout() {
  "use server";
  await destroySession();
  redirect("/admin/login");
}
