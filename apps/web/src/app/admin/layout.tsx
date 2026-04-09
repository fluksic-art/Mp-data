import type { Metadata } from "next";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Admin — MPgenesis",
};

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/listings", label: "Listings" },
];

const navItemsDisabled = [
  { label: "Sources", note: "Phase 3" },
  { label: "Leads", note: "Phase 2" },
  { label: "Crawl Runs", note: "Phase 3" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            M
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">MPgenesis</p>
            <p className="text-[11px] text-muted-foreground">Admin</p>
          </div>
        </div>

        <Separator />

        <nav className="flex-1 space-y-6 px-3 py-4">
          <div>
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Menu
            </p>
            <ul className="space-y-0.5">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Coming soon
            </p>
            <ul className="space-y-0.5">
              {navItemsDisabled.map((item) => (
                <li key={item.label}>
                  <span className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground/40">
                    {item.label}
                    <span className="text-[10px]">{item.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <Separator />
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground">v0.1.0 · Phase 1</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
