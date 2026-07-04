"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="eyebrow">Filing error</p>
      <h1 className="font-display mt-3 text-3xl">Something tore in this page</h1>
      <p className="mt-4 max-w-md text-sm" style={{ color: "var(--text-dim)" }}>
        The page hit an unexpected error. Your wallet, campaigns, and packets are unaffected —
        try again, or head back to the archive.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn btn-seal">
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Back to the archive
        </Link>
      </div>
      {error?.message && (
        <details className="mt-8 max-w-md text-left">
          <summary className="cursor-pointer text-xs" style={{ color: "var(--text-faint)" }}>
            Technical details
          </summary>
          <p className="font-data mt-2 text-xs break-all" style={{ color: "var(--text-faint)" }}>
            {error.message}
            {error.digest ? ` · digest ${error.digest}` : ""}
          </p>
        </details>
      )}
    </div>
  );
}
