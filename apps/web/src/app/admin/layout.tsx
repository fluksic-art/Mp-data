import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Admin — MPgenesis",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <Link href="/admin" className="text-lg font-bold">
          MPgenesis
        </Link>
        <p className="mt-1 text-xs text-gray-500">Admin Panel</p>

        <ul className="mt-6 space-y-1">
          <li>
            <Link
              href="/admin/listings"
              className="block rounded px-3 py-2 text-sm hover:bg-gray-200"
            >
              Listings
            </Link>
          </li>
          <li>
            <span className="block rounded px-3 py-2 text-sm text-gray-400">
              Sources (Phase 3)
            </span>
          </li>
          <li>
            <span className="block rounded px-3 py-2 text-sm text-gray-400">
              Leads (Phase 2)
            </span>
          </li>
        </ul>
      </nav>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
