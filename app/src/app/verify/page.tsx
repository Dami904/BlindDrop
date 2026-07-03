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
      <h1 className="text-3xl font-semibold text-zinc-50">Verify &amp; Decrypt My Allocation</h1>
      <p className="mt-3 text-zinc-400">
        Read your confidential ERC-7984 balance and decrypt it locally via the Zama relayer. Only
        the connected wallet can decrypt its own balance — no one else, including this app, can see
        the plaintext amount.
      </p>

      {!isConnected && (
        <div className="mt-8 rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          Connect your wallet to verify a balance.
        </div>
      )}

      {isConnected && wrongChain && (
        <div className="mt-8 flex items-center justify-between rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          <span>Switch to Sepolia (chain {SEPOLIA_CHAIN_ID}) to read confidential balances.</span>
          <button
            type="button"
            onClick={() => switchChain({ chainId: sepolia.id })}
            disabled={isSwitching}
            className="ml-4 shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      )}

      <section className="mt-8 space-y-3">
        <label className="block text-sm font-medium text-zinc-300">
          ERC-7984 confidential token address
        </label>
        <div className="flex gap-2">
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="0x…"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="button"
            disabled={!tokenValid}
            onClick={() => setSubmittedToken(tokenInput.trim() as `0x${string}`)}
            className="shrink-0 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Decrypt balance
          </button>
        </div>
        {tokenInput && !tokenValid && (
          <p className="text-xs text-red-400">That doesn&apos;t look like a valid contract address.</p>
        )}
      </section>

      {submittedToken && isConnected && !wrongChain && (
        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold text-zinc-50">Your confidential balance</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Token <span className="font-mono">{submittedToken}</span> · account{" "}
            <span className="font-mono">{address}</span>
          </p>

          <div className="mt-6">
            {balance.isLoading && (
              <p className="text-sm text-zinc-400">
                Reading encrypted balance and requesting a decryption signature from your wallet…
              </p>
            )}

            {balance.isError && (
              <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {describeDecryptError(balance.error)}
              </div>
            )}

            {balance.isSuccess && (
              <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-6 py-5">
                <p className="text-xs uppercase tracking-wide text-emerald-400">Decrypted balance</p>
                <p className="mt-1 text-3xl font-semibold text-emerald-100">
                  {formatConfidentialAmount(balance.data)}
                </p>
                <p className="mt-1 text-xs text-emerald-400/70">
                  Raw units: {balance.data.toString()} ({CONFIDENTIAL_DECIMALS} decimals)
                </p>
              </div>
            )}

            {!balance.isLoading && !balance.isError && !balance.isSuccess && (
              <p className="text-sm text-zinc-500">No balance loaded yet.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => balance.refetch()}
            disabled={balance.isFetching}
            className="mt-5 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {balance.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </section>
      )}

      <p className="mt-10 text-xs text-zinc-600">
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
