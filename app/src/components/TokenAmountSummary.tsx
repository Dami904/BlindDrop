"use client";

import type { Address } from "viem";
import { useMetadata } from "@zama-fhe/react-sdk";
import { formatConfidentialAmount } from "@/lib/confidential";

export interface TokenAmountSummaryProps {
  /** Validated `0x…` token address — same crash-trap discipline as
   * TokenIdentityCard: callers must only mount this once the address has
   * passed a syntactic hex check, since `useMetadata` builds a token client
   * from it unconditionally. */
  token: Address;
  /** Raw-unit total (already summed via `scaleAmountToUnits`), never a float sum. */
  amountUnits: bigint;
  recipientCount?: number;
  className?: string;
  /** Also render the raw-unit figure as a small secondary line. Off by default —
   * raw units shouldn't be the primary display since they read as a much larger
   * (and easy to misjudge) number than the human amount. */
  showRawUnits?: boolean;
}

/**
 * Human-readable "Total to distribute" line — sums recipient amounts in raw
 * token units (bigint, precise) and formats them back using the token's
 * on-chain decimals + symbol, e.g. "Total to distribute: 147.50 CTTT · 4
 * recipients". Falls back to 6 decimals (the ERC-7984 confidential norm)
 * and no symbol while metadata is still loading.
 */
export function TokenAmountSummary({
  token,
  amountUnits,
  recipientCount,
  className = "",
  showRawUnits = false,
}: TokenAmountSummaryProps) {
  const metadata = useMetadata(token);
  const decimals = metadata.data?.decimals ?? 6;
  const symbol = metadata.data?.symbol;
  const human = formatConfidentialAmount(amountUnits, decimals);

  return (
    <p className={className} style={{ color: "var(--text-dim)" }}>
      Total to distribute:{" "}
      <span className="font-data tabular" style={{ color: "var(--text)" }}>
        {human}
        {symbol ? ` ${symbol}` : ""}
      </span>
      {typeof recipientCount === "number" && (
        <>
          {" · "}
          {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
        </>
      )}
      {showRawUnits && (
        <span className="mt-0.5 block font-data text-xs" style={{ color: "var(--text-faint)" }}>
          raw units: {amountUnits.toString()}
        </span>
      )}
    </p>
  );
}
