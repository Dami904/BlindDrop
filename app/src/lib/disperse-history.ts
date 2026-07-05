/**
 * localStorage persistence for the sender's disperse receipts — the local
 * record of each push-send batch (token, recipient count, total, tx hash,
 * timestamp) built on the Disperse page. Like the create wizard's stores,
 * these are *sender-local* records only: on-chain the transfer amounts stay
 * FHE-encrypted, and nothing here is ever consulted for authorization.
 *
 * The Campaigns page ("Disperse history") reads this back so a sender can
 * find and re-download a receipt after navigating away or reloading. Every
 * read/write is wrapped in try/catch; the list is capped and deduped by tx
 * hash so a re-render or double-submit can't grow it without bound.
 */

export const DISPERSE_HISTORY_KEY = "blinddrop:disperse-history:v1";

/** Newest-first cap — plenty for a sender's own record, small enough to keep
 * the JSON blob well within localStorage limits. */
const MAX_HISTORY = 50;

/**
 * The sender's local record of one successful disperse. Shared between the
 * Disperse page (which builds it) and the Campaigns page (which lists it),
 * so the shape lives here rather than inside either page component.
 */
export interface DisperseReceipt {
  token: { address: string; name?: string; symbol?: string };
  recipientCount: number;
  totalAmountHuman: string;
  totalAmountRawUnits: string;
  txHash: string;
  etherscanUrl: string;
  /** ISO timestamp of when the disperse transaction was submitted. */
  timestamp: string;
  note: string;
}

function isDisperseReceipt(value: unknown): value is DisperseReceipt {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const token = v.token as Record<string, unknown> | undefined;
  return (
    typeof token === "object" &&
    token !== null &&
    typeof token.address === "string" &&
    typeof v.recipientCount === "number" &&
    typeof v.totalAmountHuman === "string" &&
    typeof v.totalAmountRawUnits === "string" &&
    typeof v.txHash === "string" &&
    typeof v.etherscanUrl === "string" &&
    typeof v.timestamp === "string" &&
    typeof v.note === "string"
  );
}

/** Returns the stored receipts, newest first, filtering out any corrupt entries. */
export function loadDisperseHistory(): DisperseReceipt[] {
  try {
    const raw = localStorage.getItem(DISPERSE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDisperseReceipt);
  } catch {
    return [];
  }
}

/**
 * Prepends a receipt to the history (newest first), deduped by tx hash
 * (case-insensitive) so a re-submit or double-render can't log the same
 * transaction twice, and capped at {@link MAX_HISTORY}.
 */
export function saveDisperseReceipt(receipt: DisperseReceipt): void {
  try {
    const existing = loadDisperseHistory().filter(
      (r) => r.txHash.toLowerCase() !== receipt.txHash.toLowerCase()
    );
    const next = [receipt, ...existing].slice(0, MAX_HISTORY);
    localStorage.setItem(DISPERSE_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable/full — the transient receipt card still shows this
    // session; only the persisted history is lost.
  }
}
