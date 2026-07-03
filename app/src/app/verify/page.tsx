"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import {
  BalanceCheckUnavailableError,
  DecryptionFailedError,
  NoCiphertextError,
  RelayerRequestFailedError,
  SigningRejectedError,
  ZamaError,
} from "@zama-fhe/sdk";
import { isSepoliaChainId, SEPOLIA_CHAIN_ID } from "@/lib/packet";

const CONFIDENTIAL_DECIMALS = 6;

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function formatConfidentialAmount(raw: bigint): string {
  const negative = raw < BigInt(0);
  const abs = negative ? -raw : raw;
  const divisor = BigInt(10) ** BigInt(CONFIDENTIAL_DECIMALS);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(CONFIDENTIAL_DECIMALS, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

function describeDecryptError(error: unknown): string {
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

function VerifyContent() {
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token") ?? "";

  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [tokenInput, setTokenInput] = useState(tokenFromQuery);
  const [submittedToken, setSubmittedToken] = useState<`0x${string}` | undefined>(
    isHexAddress(tokenFromQuery) ? (tokenFromQuery as `0x${string}`) : undefined
  );

  const wrongChain = !isSepoliaChainId(chainId);

  const balance = useConfidentialBalance(
    {
      address: submittedToken as `0x${string}`,
      account: address,
    },
    {
      enabled: !!submittedToken && !!address && isConnected && !wrongChain,
      retry: false,
    }
  );

  const tokenValid = useMemo(() => isHexAddress(tokenInput), [tokenInput]);

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">The unsealing</p>
      <h1 className="font-display mt-2 text-3xl">Verify &amp; Decrypt My Allocation</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Read your confidential ERC-7984 balance and decrypt it locally via the Zama relayer. Only
        the connected wallet can decrypt its own balance — no one else, including this app, can see
        the plaintext amount.
      </p>

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
        <label className="label">ERC-7984 confidential token address</label>
        <div className="flex gap-2">
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="0x…"
            className="field font-data"
          />
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
      </section>

      {submittedToken && isConnected && !wrongChain && (
        <section className="panel mt-10 p-6">
          <h2 className="font-display text-lg">Your confidential balance</h2>
          <p className="mt-1 font-data text-xs" style={{ color: "var(--text-faint)" }}>
            Token {submittedToken} · account {address}
          </p>

          <div className="mt-6">
            {balance.isLoading && (
              <div className="flex items-center gap-3">
                <span className="fhe-scan inline-block h-9 w-40 rounded-[var(--r-sm)]" />
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  Requesting your decryption signature and reaching the relayer…
                </p>
              </div>
            )}

            {balance.isError && <div className="callout callout-err">{describeDecryptError(balance.error)}</div>}

            {balance.isSuccess && (
              <div
                className="unseal-enter unseal-bloom rounded-[var(--r-lg)] border px-6 py-5"
                style={{
                  borderColor: "color-mix(in srgb, var(--gold) 45%, transparent)",
                  background: "var(--gold-dim)",
                  boxShadow: "var(--glow-gold)",
                }}
              >
                <p className="eyebrow" style={{ color: "var(--gold)" }}>
                  Seal broken — decrypted balance
                </p>
                <p className="font-display tabular mt-1 text-3xl sm:text-4xl" style={{ color: "var(--gold-bright)" }}>
                  {formatConfidentialAmount(balance.data)}
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
      )}

      <p className="mt-10 text-xs" style={{ color: "var(--text-faint)" }}>
        Decryption uses your wallet&apos;s EIP-712 signature and the Zama relayer — the plaintext
        balance never leaves your browser.
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}
