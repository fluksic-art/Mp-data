"use client";

export default function ListingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-12">
      <h2 className="text-xl font-semibold text-destructive mb-2">
        Error loading listings
      </h2>
      <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto whitespace-pre-wrap mb-4">
        {error.message}
        {error.digest ? `\n\nDigest: ${error.digest}` : ""}
      </pre>
      <button
        onClick={reset}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
      >
        Try again
      </button>
    </div>
  );
}
