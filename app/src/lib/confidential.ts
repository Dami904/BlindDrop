/**
 * Shared helpers for formatting and error-describing ERC-7984 confidential
 * balance decryption results. Extracted from VerifyPanel so
 * TokenIdentityCard's inline "Your balance" reveal can share the exact same
 * formatting and error copy instead of duplicating it.
 */
import {
  BalanceCheckUnavailableError,
  DecryptionFailedError,
  NoCiphertextError,
  RelayerRequestFailedError,
  SigningRejectedError,
} from "@zama-fhe/sdk";
import { describeMutationError, type FriendlyError } from "@/lib/errors";

/** Formats a raw confidential balance (bigint) using the token's decimals. */
export function formatConfidentialAmount(raw: bigint, decimals: number): string {
  const negative = raw < BigInt(0);
  const abs = negative ? -raw : raw;
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = decimals > 0 ? (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

/** Maps a decrypt-balance mutation/query error to friendly copy + a raw detail. */
export function describeDecryptError(error: unknown): FriendlyError {
  if (error instanceof SigningRejectedError) {
    return { message: "No problem — approve the signature request in your wallet when you're ready to decrypt." };
  }
  if (error instanceof RelayerRequestFailedError) {
    return { message: "Couldn't reach the decryption service — try again in a moment.", detail: error.message };
  }
  if (error instanceof DecryptionFailedError) {
    return { message: "This balance couldn't be decrypted — your wallet may not be authorized to view it.", detail: error.message };
  }
  if (error instanceof NoCiphertextError) {
    return { message: "No balance found yet for this account on this token." };
  }
  if (error instanceof BalanceCheckUnavailableError) {
    return { message: "Couldn't read this token's balance — double-check it's a valid ERC-7984 confidential token.", detail: error.message };
  }
  return describeMutationError(error, "Something went wrong decrypting your balance — you can try again.");
}
