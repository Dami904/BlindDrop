"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useIsConfidential, useMetadata } from "@zama-fhe/react-sdk";
import { etherscanAddressUrl } from "@/lib/packet";

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
   * on-chain commitment (e.g. next to a "Deploy" confirmation) where space is tight. */
  compact?: boolean;
}

/**
 * Resolves and displays a confidential token's identity — name, symbol, and
 * ERC-7984 support — so an admin or claimant never has to trust a bare hex
 * address. Read-only: fetches metadata via `useMetadata` and verifies the
 * ERC-7984 interface via `useIsConfidential`, both from `@zama-fhe/react-sdk`.
 */
export function TokenIdentityCard({ address, className = "", compact = false }: TokenIdentityCardProps) {
  const metadata = useMetadata(address);
  const isConfidential = useIsConfidential(address);
  const [copied, setCopied] = useState(false);

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
    </div>
  );
}
