import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="eyebrow">Case file missing</p>
      <h1 className="font-display mt-3 text-4xl">404</h1>
      <p className="mt-4 max-w-md text-sm" style={{ color: "var(--text-dim)" }}>
        Nothing is filed at this address. It may have been moved, sealed, or never existed.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-seal">
          Back to the archive
        </Link>
        <Link href="/claim" className="btn btn-ghost">
          Claim tokens
        </Link>
      </div>
    </div>
  );
}
