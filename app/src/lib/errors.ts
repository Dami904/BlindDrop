/**
 * Shared helper for turning a wallet/transaction-mutation error (wagmi,
 * viem, or a raw thrown value) into a friendly headline plus an optional raw
 * detail — used by every write-transaction error surface (approve, fund,
 * deploy, disperse, mint, register…) so wallet rejections and out-of-gas
 * wallets get warm, actionable copy instead of a raw SDK message.
 */

export interface FriendlyError {
  /** Plain-language headline: what happened, and what to do next. */
  message: string;
  /** Raw underlying error message, for the "Technical details" disclosure. */
  detail?: string;
}

const REJECTED_RE = /user rejected|rejected the request|denied transaction|user denied/i;
const INSUFFICIENT_FUNDS_RE = /insufficient funds|exceeds balance|gas required exceeds allowance/i;

/**
 * Maps a generic transaction/mutation error to friendly copy. `fallback` is
 * the headline used when the error doesn't match a recognized pattern — pass
 * one that names the specific action that failed (e.g. "Couldn't fund the
 * campaign — you can try again.").
 */
export function describeMutationError(
  error: unknown,
  fallback = "Something went wrong submitting the transaction — you can try again."
): FriendlyError {
  const raw = error instanceof Error ? error.message : String(error);
  if (REJECTED_RE.test(raw)) {
    return { message: "No problem — the transaction was cancelled." };
  }
  if (INSUFFICIENT_FUNDS_RE.test(raw)) {
    return {
      message: "Your wallet needs a little Sepolia ETH for gas — grab some from a faucet and retry.",
      detail: raw,
    };
  }
  return { message: fallback, detail: raw };
}
