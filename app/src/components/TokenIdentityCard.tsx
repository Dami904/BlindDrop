"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { useIsConfidential, useMetadata, useConfidentialBalance } from "@zama-fhe/react-sdk";
import { etherscanAddressUrl } from "@/lib/packet";
import { formatConfidentialAmount, describeDecryptError } from "@/lib/confidential";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface TokenIdentityCardProps {
  /** Validated `0x…` token address. Callers MUST only mount this component once the
   * address has passed a syntactic hex-address check — the underlying SDK hooks build
   * a token client from this value even while "disabled", so an undefined or malformed
   * address throws during render rather than surfacing as a query error. */
  address: Address;
  className?: string;
  /** Renders a single-line summary instead of the full card — used at the moment of
   * on-chain commitment (e.g. next to a "Deploy" confirmation) where space is tight.
   * The "Your balance" decrypt row is only shown in the full (non-compact) card. */
  compact?: boolean;
  /**
   * Optional raw-unit total the caller is about to move (e.g. a campaign's
   * summed recipient amounts) — when the user decrypts their balance, a
   * warning is shown if it's lower than this. Ignored in compact mode.
   */
  compareUnits?: bigint;
  /** Label used in the "balance too low" warning, e.g. "campaign total". Defaults to "amount needed". */
  compareLabel?: string;
}

/**
 * Resolves and displays a confidential token's identity — name, symbol, and
 * ERC-7984 support — so an admin or claimant never has to trust a bare hex
 * address. Read-only: fetches metadata via `useMetadata` and verifies the
 * ERC-7984 interface via `useIsConfidential`, both from `@zama-fhe/react-sdk`.
 */
export function TokenIdentityCard({
  address,
  className = "",
  compact = false,
  compareUnits,
  compareLabel = "amount needed",
}: TokenIdentityCardProps) {
  const metadata = useMetadata(address);
  const isConfidential = useIsConfidential(address);
  const [copied, setCopied] = useState(false);
  const { address: account, isConnected } = useAccount();
  const [decryptRequested, setDecryptRequested] = useState(false);

  function copyAddress() {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const loading = metadata.isLoading || isConfidential.isLoading;
  const failed = metadata.isError || isConfidential.isError;
  const notConfidential = !loading && !failed && isConfidential.data === false;
  const invalid = failed || notConfidential;

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="redaction inline-block h-4 w-16 rounded" />
        <span className="redaction inline-block h-4 w-28 rounded" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className={`callout callout-err ${compact ? "text-xs" : ""} ${className}`}>
        This address doesn&apos;t look like a confidential token — double-check before funding.
      </div>
    );
  }

  const name = metadata.data?.name ?? "Unknown token";
  const symbol = metadata.data?.symbol ?? "?";

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-2 text-sm ${className}`}>
        <span className="font-medium" style={{ color: "var(--text)" }}>
          {name}
        </span>
        <span className="font-data" style={{ color: "var(--text-dim)" }}>
          {symbol}
        </span>
        <a
          href={etherscanAddressUrl(address)}
          target="_blank"
          rel="noreferrer"
          className="link-gold font-data text-xs"
        >
          {shortAddress(address)}
        </a>
        <span className="badge badge-ok">ERC-7984 confidential token ✓</span>
      </div>
    );
  }

  return (
    <div className={`panel flex flex-col gap-2 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-base" style={{ color: "var(--text)" }}>
            {name}
          </p>
          <p className="font-data text-xs" style={{ color: "var(--text-dim)" }}>
            {symbol}
            {typeof metadata.data?.decimals === "number" ? ` · ${metadata.data.decimals} decimals` : ""}
          </p>
        </div>
        <span className="badge badge-ok shrink-0">ERC-7984 confidential token ✓</span>
      </div>

      <div className="flex items-center gap-2">
        <a
          href={etherscanAddressUrl(address)}
          target="_blank"
          rel="noreferrer"
          className="link-gold font-data text-xs"
        >
          {shortAddress(address)}
        </a>
        <button
          type="button"
          onClick={copyAddress}
          aria-label="Copy token address"
          className="icon-btn"
          style={copied ? { color: "var(--ok)" } : undefined}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M1.5 9.5v-6a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          )}
        </button>
      </div>

      <div className="divider-stamped mt-1 flex items-center gap-2 pt-2">
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Your balance
        </span>
        {!isConnected && (
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            Connect your wallet to see your balance.
          </span>
        )}
        {isConnected && account && !decryptRequested && (
          <>
            <span className="redaction inline-block h-4 w-16 rounded" />
            <button type="button" onClick={() => setDecryptRequested(true)} className="btn-quiet text-xs">
              Decrypt
            </button>
          </>
        )}
        {isConnected && account && decryptRequested && (
          <BalanceReveal
            address={address}
            account={account}
            decimals={metadata.data?.decimals ?? 6}
            compareUnits={compareUnits}
            compareLabel={compareLabel}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Mounted only once the user explicitly asks to decrypt (never
 * auto-decrypted on token selection, since that would trigger an unwanted
 * EIP-712 signature prompt) — `useConfidentialBalance` builds a token client
 * from `address`/`account` unconditionally even while "disabled", so both
 * must already be validated non-empty values by the time this mounts, which
 * the parent guarantees (address comes from TokenIdentityCard's own
 * validated prop; account is only passed once `useAccount()` reports connected).
 */
function BalanceReveal({
  address,
  account,
  decimals,
  compareUnits,
  compareLabel,
}: {
  address: Address;
  account: Address;
  decimals: number;
  compareUnits?: bigint;
  compareLabel: string;
}) {
  const balance = useConfidentialBalance({ address, account }, { retry: false });

  if (balance.isLoading) {
    return (
      <span className="flex items-center gap-2">
        <span className="redaction inline-block h-4 w-16 rounded" />
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          Awaiting signature…
        </span>
      </span>
    );
  }

  if (!balance.isSuccess) {
    return (
      <span className="text-xs" style={{ color: "var(--err)" }}>
        {describeDecryptError(balance.error)}
      </span>
    );
  }

  const low = typeof compareUnits === "bigint" && balance.data < compareUnits;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-data tabular text-sm" style={{ color: "var(--gold-bright)" }}>
        {formatConfidentialAmount(balance.data, decimals)}
      </span>
      {low && (
        <span className="text-xs" style={{ color: "var(--warn)" }}>
          Lower than the {compareLabel} — you may not have enough to fund it.
        </span>
      )}
    </span>
  );
}
