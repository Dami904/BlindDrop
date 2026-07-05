"use client";

import { useEffect, useMemo, useState } from "react";
import { loadDisperseHistory, type DisperseReceipt } from "@/lib/disperse-history";
import type { CampaignSort } from "@/components/campaigns/toolbar";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EmptyLedgerGlyph() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden>
      <rect x="1" y="1" width="28" height="20" rx="2" stroke="var(--text-faint)" strokeWidth="1.3" />
      <path d="M2 2.5 15 13.5 28 2.5" stroke="var(--text-faint)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="15" cy="14" r="2.4" fill="var(--text-faint)" opacity="0.5" />
    </svg>
  );
}

function matchesQuery(receipt: DisperseReceipt, q: string): boolean {
  if (!q) return true;
  const haystack = [receipt.token.symbol ?? "", receipt.token.name ?? "", receipt.token.address, receipt.txHash]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * "Disperse history" — view-only local records of the sender's successful
 * push-sends, read from `blinddrop:disperse-history:v1`. Each row can copy or
 * re-download its receipt. Amounts are the sender's local record only; on-chain
 * the transfers stay FHE-encrypted. Filterable/sortable via the shared toolbar.
 */
export function DisperseHistory({ query, sort }: { query: string; sort: CampaignSort }) {
  const [history, setHistory] = useState<DisperseReceipt[]>([]);

  useEffect(() => {
    setHistory(loadDisperseHistory());
  }, []);

  const q = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const filtered = history.filter((r) => matchesQuery(r, q));
    const copy = [...filtered];
    // "Status" has no analogue for a one-shot disperse — fall back to newest.
    copy.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return sort === "oldest" ? ta - tb : tb - ta;
    });
    return copy;
  }, [history, q, sort]);

  return (
    <section className="panel p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">Disperse history</h2>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          {history.length ? `${history.length} logged · ${visible.length} shown` : ""}
        </p>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
        View-only records of your push-sends — saved in this browser only.
      </p>

      <div className="mt-4 grid gap-3">
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <EmptyLedgerGlyph />
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              No disperses yet — push-send tokens on the Disperse page and they&apos;ll be logged here.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <EmptyLedgerGlyph />
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              No disperses match your search.
            </p>
          </div>
        ) : (
          visible.map((receipt) => <DisperseHistoryRow key={receipt.txHash} receipt={receipt} />)
        )}
      </div>
    </section>
  );
}

function DisperseHistoryRow({ receipt }: { receipt: DisperseReceipt }) {
  const [copied, setCopied] = useState(false);

  function copyReceipt() {
    navigator.clipboard?.writeText(JSON.stringify(receipt, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border p-3 sm:p-4"
      style={{ borderColor: "var(--line)", background: "var(--ink-3)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-data text-sm break-all" style={{ color: "var(--text)" }}>
          {receipt.token.symbol ? `${receipt.token.symbol} · ` : ""}
          {shortAddress(receipt.token.address)}
        </span>
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          {formatTimestamp(receipt.timestamp)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-dim)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="eyebrow" style={{ fontSize: "0.625rem" }}>
            RECIPIENTS
          </span>
          <span className="tabular" style={{ color: "var(--text)" }}>
            {receipt.recipientCount}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="eyebrow" style={{ fontSize: "0.625rem" }}>
            TOTAL
          </span>
          <span className="font-data tabular" style={{ color: "var(--text)" }}>
            {receipt.totalAmountHuman}
            {receipt.token.symbol ? ` ${receipt.token.symbol}` : ""}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={receipt.etherscanUrl}
          target="_blank"
          rel="noreferrer"
          className="link-gold font-data text-xs break-all"
        >
          {receipt.txHash.slice(0, 12)}…
        </a>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyReceipt} className="btn btn-ghost text-xs">
            {copied ? "Copied!" : "Copy receipt"}
          </button>
          <button
            type="button"
            onClick={() => downloadJson(`disperse-receipt-${receipt.txHash}.json`, receipt)}
            className="btn btn-ghost text-xs"
          >
            Download receipt
          </button>
        </div>
      </div>
    </div>
  );
}
