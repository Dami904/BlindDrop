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
  ZamaError,
} from "@zama-fhe/sdk";

/** Formats a raw confidential balance (bigint) using the token's decimals. */
export function formatConfidentialAmount(raw: bigint, decimals: number): string {
  const negative = raw < BigInt(0);
  const abs = negative ? -raw : raw;
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = decimals > 0 ? (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

/** Maps a decrypt-balance mutation/query error to a plain-language message. */
export function describeDecryptError(error: unknown): string {
  if (error instanceof SigningRejectedError) {
    return "You rejected the decryption signature request in your wallet. Approve the EIP-712 signature to decrypt your balance.";
  }
  if (error instanceof RelayerRequestFailedError) {
    return "The Zama relayer couldn't be reached or returned an error. Please try again in a moment.";
  }
  if (error instanceof DecryptionFailedError) {
    return "Decryption failed. Your wallet may not be authorized to view this balance.";
  }
  if (error instanceof NoCiphertextError) {
    return "No encrypted balance found for this account on this token yet.";
  }
  if (error instanceof BalanceCheckUnavailableError) {
    return "Couldn't read the encrypted balance handle from the token contract. Confirm the address is a valid ERC-7984 confidential token.";
  }
  if (error instanceof ZamaError) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred while decrypting your balance.";
}
