"use client";

import { useMemo, useState } from "react";
import { sepolia } from "wagmi/chains";
import { useListPairs } from "@zama-fhe/react-sdk";
import { getConfidentialTestTokenAddress } from "@tokenops/sdk";

const CUSTOM_VALUE = "__custom__";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface TokenSelectProps {
  /** Current token address text (kept in the parent, same as the old bare input). */
  value: string;
  /** Fires with the raw address string — parents keep their existing
   * `isHexAddress`/`tokenValid` gating on the result. */
  onChange: (address: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Confidential token picker: a styled native `<select>` listing the TokenOps
 * test token (CTTT) first, then any wrapper pairs known to Zama's on-chain
 * wrappers registry (via `useListPairs`), plus a "Custom address…" option
 * that reveals a text input for pasting any `0x…` address.
 *
 * Drives the same `value`/`onChange(address)` contract as the raw input it
 * replaces — it never invents or defaults an address on its own, so parents'
 * existing hex-validation gating before mounting `TokenIdentityCard` (and
 * before passing addresses into other SDK hooks) is unchanged.
 */
export function TokenSelect({ value, onChange, disabled = false, className = "" }: TokenSelectProps) {
  // Registry hooks take no address argument, so calling them unconditionally
  // is safe even before a token is chosen — unlike TokenIdentityCard's
  // per-address hooks, there's nothing here that throws on a bad address.
  const pairs = useListPairs({ page: 1, pageSize: 50, metadata: true });

  const cttt = getConfidentialTestTokenAddress(sepolia.id);

  const registryTokens = useMemo(() => {
    const items = pairs.data?.items ?? [];
    return items
      .filter((pair) => pair.isValid)
      .filter((pair) => !cttt || pair.confidentialTokenAddress.toLowerCase() !== cttt.toLowerCase())
      .map((pair) => ({
        address: pair.confidentialTokenAddress,
        label:
          "confidential" in pair
            ? `${pair.confidential.name} (${pair.confidential.symbol})`
            : shortAddress(pair.confidentialTokenAddress),
      }));
  }, [pairs.data, cttt]);

  // The select's own notion of "which option is active" — separate from
  // `value` so a custom address that happens to match a known option still
  // shows the right entry, and typing into the custom field doesn't fight
  // the dropdown's selection.
  const matchedKnown =
    (cttt && value.toLowerCase() === cttt.toLowerCase() ? cttt : undefined) ??
    registryTokens.find((t) => t.address.toLowerCase() === value.toLowerCase())?.address;
  const [customMode, setCustomMode] = useState(!matchedKnown && value.length > 0);

  const selectValue = customMode ? CUSTOM_VALUE : matchedKnown ?? (value ? CUSTOM_VALUE : "");

  function handleSelectChange(next: string) {
    if (next === CUSTOM_VALUE) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onChange(next);
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="field font-data"
      >
        <option value="" disabled>
          Select a confidential token…
        </option>
        {cttt && (
          <option value={cttt}>
            CTTT — TokenOps test token ({shortAddress(cttt)})
          </option>
        )}
        {pairs.isLoading && <option disabled>Loading registry tokens…</option>}
        {registryTokens.map((t) => (
          <option key={t.address} value={t.address}>
            {t.label} ({shortAddress(t.address)})
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Custom address…</option>
      </select>

      {pairs.isLoading && (
        <div className="flex items-center gap-2">
          <span className="redaction inline-block h-4 w-40 rounded" />
        </div>
      )}

      {customMode && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0x…"
          className="field font-data"
        />
      )}
    </div>
  );
}
