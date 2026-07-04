"use client";

import { etherscanTxUrl } from "@/lib/packet";

/** First 10 chars of a tx hash — enough to eyeball-match against Etherscan. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

export interface TxStatusLineProps {
  /**
   * The mutation is in flight and no tx hash is known yet. With `combined`
   * (default) this renders the honest two-phase message, because most SDK
   * hooks only resolve after the receipt and can't distinguish "waiting for
   * the wallet" from "confirming on-chain". Pass `combined={false}` when the
   * caller CAN observe confirmation separately (e.g. wagmi's
   * `useWriteContract` + `useWaitForTransactionReceipt`).
   */
  awaitingWallet?: boolean;
  /** A tx hash exists but the transaction hasn't confirmed yet. */
  confirming?: boolean;
  /** Tx hash, linked to Sepolia Etherscan as soon as it is known. */
  hash?: string | null;
  /**
   * Whether the pending phase must be shown as one combined message.
   * Defaults to true — see {@link TxStatusLineProps.awaitingWallet}.
   */
  combined?: boolean;
  className?: string;
}

/**
 * One consistent transaction-phase line for every transacting button:
 *
 *   "Awaiting wallet approval…"            (mutation pending, no hash yet)
 *   "Confirming on Sepolia… 0xabc123…"     (hash known, not yet mined)
 *
 * Renders nothing when idle — success and error states stay with the caller.
 */
export function TxStatusLine({
  awaitingWallet,
  confirming,
  hash,
  combined = true,
  className,
}: TxStatusLineProps) {
  const showConfirming = !!confirming && !!hash;
  const showAwaiting = !showConfirming && !!awaitingWallet;
  if (!showConfirming && !showAwaiting) return null;

  return (
    <p
      className={`font-data flex items-center gap-2 text-xs ${className ?? ""}`}
      style={{ color: "var(--text-dim)" }}
      role="status"
      aria-live="polite"
    >
      <PulseDot />
      {showConfirming ? (
        <span>
          Confirming on Sepolia…{" "}
          <a
            href={etherscanTxUrl(hash!)}
            target="_blank"
            rel="noreferrer"
            className="link-gold underline"
          >
            {shortHash(hash!)}
          </a>
        </span>
      ) : combined ? (
        <span>Awaiting wallet approval… then confirming on Sepolia</span>
      ) : (
        <span>Awaiting wallet approval…</span>
      )}
    </p>
  );
}

function PulseDot() {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
      style={{ background: "var(--gold-bright)" }}
    />
  );
}

/** Small "view on Etherscan" tx link, shown once a hash exists. */
export function TxHashLink({ hash, className }: { hash: string; className?: string }) {
  return (
    <a
      href={etherscanTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className={`link-gold font-data text-xs underline ${className ?? ""}`}
    >
      tx {shortHash(hash)}
    </a>
  );
}
