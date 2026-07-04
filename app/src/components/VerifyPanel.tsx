"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import { isSepoliaChainId, SEPOLIA_CHAIN_ID } from "@/lib/packet";
import { formatConfidentialAmount, describeDecryptError } from "@/lib/confidential";
import { TokenIdentityCard } from "@/components/TokenIdentityCard";
import { TokenSelect } from "@/components/TokenSelect";

const CONFIDENTIAL_DECIMALS = 6;

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export interface VerifyPanelProps {
  /**
   * Token address to pre-fill and auto-submit, e.g. from a `?token=` query
   * string or a just-completed claim on the same page. Updating this prop
   * (after a successful claim) re-fills and re-submits the form.
   */
  initialToken?: string;
  /** Called once a confidential balance has been successfully decrypted. */
  onVerified?: () => void;
}

/**
 * Decrypt-your-allocation panel — reads a confidential ERC-7984 balance via
 * EIP-712 user decryption against the Zama relayer. Extracted from the
 * standalone /verify page so it can live as the second section of
 * /claim ("Claim & Verify").
 */
export function VerifyPanel({ initialToken, onVerified }: VerifyPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [tokenInput, setTokenInput] = useState(initialToken ?? "");
  const [submittedToken, setSubmittedToken] = useState<`0x${string}` | undefined>(
    initialToken && isHexAddress(initialToken) ? (initialToken as `0x${string}`) : undefined
  );

  // Re-fill and re-submit whenever the caller hands us a fresh token (e.g.
  // right after a successful claim on the same page).
  useEffect(() => {
    if (initialToken && isHexAddress(initialToken)) {
      setTokenInput(initialToken);
      setSubmittedToken(initialToken.trim() as `0x${string}`);
    }
    // Only re-run when the incoming token itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  const wrongChain = !isSepoliaChainId(chainId);

  const tokenValid = useMemo(() => isHexAddress(tokenInput), [tokenInput]);

  return (
    <div>
      {!isConnected && <div className="callout callout-warn mt-8">Connect your wallet to verify a balance.</div>}

      {isConnected && wrongChain && (
        <div className="callout callout-warn callout-between mt-8">
          <span>Switch to Sepolia (chain {SEPOLIA_CHAIN_ID}) to read confidential balances.</span>
          <button
            type="button"
            onClick={() => switchChain({ chainId: sepolia.id })}
            disabled={isSwitching}
            className="btn btn-gold ml-4 shrink-0 text-xs"
          >
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      )}

      <section className="mt-8 space-y-3">
        <label className="label">ERC-7984 confidential token</label>
        <div className="flex items-start gap-2">
          <TokenSelect value={tokenInput} onChange={setTokenInput} className="flex-1" />
          <button
            type="button"
            disabled={!tokenValid}
            onClick={() => setSubmittedToken(tokenInput.trim() as `0x${string}`)}
            className="btn btn-seal shrink-0"
          >
            Decrypt balance
          </button>
        </div>
        {tokenInput && !tokenValid && (
          <p className="text-xs" style={{ color: "var(--err)" }}>
            That doesn&apos;t look like a valid contract address.
          </p>
        )}
        {tokenValid && <TokenIdentityCard address={tokenInput.trim() as `0x${string}`} />}
      </section>

      {submittedToken && address && isConnected && !wrongChain && (
        <ConfidentialBalanceSection token={submittedToken} account={address} onVerified={onVerified} />
      )}

      <p className="mt-10 text-xs" style={{ color: "var(--text-faint)" }}>
        Decryption uses your wallet&apos;s EIP-712 signature and the Zama relayer — the plaintext
        balance never leaves your browser.
      </p>
    </div>
  );
}

/**
 * Rendered only once a token address exists: `useConfidentialBalance`
 * constructs a token client from `address` unconditionally (even when the
 * query is disabled), so mounting it with `undefined` throws viem's
 * InvalidAddressError and crashes the page.
 */
function ConfidentialBalanceSection({
  token,
  account,
  onVerified,
}: {
  token: `0x${string}`;
  account: `0x${string}`;
  onVerified?: () => void;
}) {
  const balance = useConfidentialBalance(
    { address: token, account },
    { retry: false }
  );

  useEffect(() => {
    if (balance.isSuccess) onVerified?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance.isSuccess]);

  return (
    <section className="panel mt-10 p-6">
      <h2 className="font-display text-lg">Your confidential balance</h2>
      <p className="mt-1 font-data text-xs" style={{ color: "var(--text-faint)" }}>
        Token {token} · account {account}
      </p>

          <div className="mt-6">
            {balance.isLoading && (
              <div className="flex items-center gap-3">
                <span className="redaction inline-block h-9 w-40 rounded" />
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  Requesting your decryption signature and reaching the relayer…
                </p>
              </div>
            )}

            {balance.isError && <div className="callout callout-err">{describeDecryptError(balance.error)}</div>}

            {balance.isSuccess && (
              <div className="unseal-enter rounded-[var(--r-lg)] border px-6 py-5" style={{ borderColor: "color-mix(in srgb, var(--gold) 40%, transparent)", background: "var(--gold-dim)" }}>
                <p className="eyebrow">Seal broken — decrypted balance</p>
                <p className="font-display tabular mt-1 text-3xl" style={{ color: "var(--gold-bright)" }}>
                  {formatConfidentialAmount(balance.data, CONFIDENTIAL_DECIMALS)}
                </p>
                <p className="font-data mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                  Raw units: {balance.data.toString()} ({CONFIDENTIAL_DECIMALS} decimals)
                </p>
              </div>
            )}

            {!balance.isLoading && !balance.isError && !balance.isSuccess && (
              <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                No balance loaded yet.
              </p>
            )}
          </div>

      <button
        type="button"
        onClick={() => balance.refetch()}
        disabled={balance.isFetching}
        className="btn btn-ghost mt-5"
      >
        {balance.isFetching ? "Refreshing…" : "Refresh"}
      </button>
    </section>
  );
}
