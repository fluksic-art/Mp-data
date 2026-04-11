import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">MPgenesis</h1>
        <p className="mt-2 text-lg text-gray-600">
          Real estate marketplace — Riviera Maya
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          Admin Panel
        </Link>
      </div>
    </main>
  );
}
