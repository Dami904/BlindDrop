/**
 * Shared helpers for formatting and error-describing ERC-7984 confidential
 * balance decryption results. Extracted from VerifyPanel so
 * TokenIdentityCard's inline "Your balance" reveal can share the exact same
 * formatting and error copy instead of duplicating it.
 */
import {
  AclPausedError,
  BalanceCheckUnavailableError,
  DecryptionFailedError,
  DelegationContractIsSelfError,
  DelegationCooldownError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiredError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationNotPropagatedError,
  DelegationSelfNotAllowedError,
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

/** Maps a grant/revoke delegation mutation error to friendly copy + a raw detail. */
export function describeDelegationError(error: unknown): FriendlyError {
  if (error instanceof SigningRejectedError) {
    return { message: "No problem — the transaction was cancelled." };
  }
  if (error instanceof DelegationSelfNotAllowedError) {
    return { message: "You can't grant access to your own wallet — enter a different address." };
  }
  if (error instanceof DelegationDelegateEqualsContractError || error instanceof DelegationContractIsSelfError) {
    return { message: "That address is the token contract itself — enter a wallet address instead." };
  }
  if (error instanceof DelegationCooldownError) {
    return { message: "Only one grant or revoke per address per block — wait a few seconds and try again." };
  }
  if (error instanceof DelegationExpirationTooSoonError) {
    return { message: "Access needs to last at least an hour from now — pick a longer expiry." };
  }
  if (error instanceof DelegationExpiryUnchangedError) {
    return { message: "That's already the current expiry — nothing to update." };
  }
  if (error instanceof DelegationNotFoundError) {
    return { message: "There's no active grant for that address to revoke." };
  }
  if (error instanceof DelegationExpiredError) {
    return { message: "That grant has already expired — no need to revoke it." };
  }
  if (error instanceof AclPausedError) {
    return { message: "Delegation is temporarily paused on-chain — try again shortly.", detail: error.message };
  }
  return describeMutationError(error, "Something went wrong updating access — you can try again.");
}

/** Maps a `useDecryptBalanceAs` (decrypt-as-delegate) error to friendly copy + a raw detail. */
export function describeDelegatedDecryptError(error: unknown): FriendlyError {
  if (error instanceof DelegationNotFoundError || error instanceof DelegationExpiredError) {
    return { message: "That wallet hasn't shared with you — ask them to grant access from their side." };
  }
  if (error instanceof DelegationNotPropagatedError) {
    return {
      message: "This access was just granted — it can take a minute or two to reach the network. Try again shortly.",
    };
  }
  return describeDecryptError(error);
}
