"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useQueryClient } from "@tanstack/react-query";
import {
  useFaucetMetadata,
  useMintConfidential,
  useMintUnderlying,
} from "@tokenops/sdk/testnet-faucet/react";
import { isSepoliaChainId, SEPOLIA_CHAIN_ID, etherscanAddressUrl, etherscanTxUrl } from "@/lib/packet";

const CTTT_MINT_AMOUNT = BigInt(1_000_000_000); // 1,000 CTTT (6-decimal units)
const TTT_MINT_AMOUNT = BigInt(1_000) * BigInt(10) ** BigInt(18); // 1,000 TTT (18-decimal units)

export default function FaucetPage() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const queryClient = useQueryClient();

  const wrongChain = !isSepoliaChainId(chainId);
  const ready = isConnected && !wrongChain;

  const { data: meta, isLoading: metaLoading } = useFaucetMetadata();

  const mintConfidential = useMintConfidential();
  const mintUnderlying = useMintUnderlying();

  const [lastAction, setLastAction] = useState<"confidential" | "underlying" | null>(null);

  function invalidateFaucetQueries() {
    queryClient.invalidateQueries({ queryKey: ["tokenops-sdk", "testnet-faucet"] });
  }

  const cttt = meta?.confidential;
  const ttt = meta?.underlying;

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold text-zinc-50">Testnet Faucet</h1>
      <p className="mt-3 text-zinc-400">
        Claim the TokenOps test-token pair on Sepolia — TTT (plain ERC-20) and CTTT (its
        ERC-7984 confidential wrapper) — so judges can go from zero to a full confidential
        distribution demo in minutes.
      </p>

      {!isConnected && (
        <div className="mt-8 rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          Connect your wallet to claim test tokens.
        </div>
      )}

      {isConnected && wrongChain && (
        <div className="mt-8 flex items-center justify-between rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          <span>Switch to Sepolia (chain {SEPOLIA_CHAIN_ID}) to use the faucet.</span>
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

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
        <h2 className="text-lg font-medium text-zinc-100">Token addresses</h2>
        {metaLoading && <p className="mt-2 text-sm text-zinc-500">Loading faucet metadata…</p>}
        {meta && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-sm font-medium text-zinc-200">
                {cttt?.symbol} <span className="text-zinc-500">({cttt?.decimals} decimals)</span>
              </p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-400">{cttt?.address}</p>
              {cttt?.address && (
                <a
                  href={etherscanAddressUrl(cttt.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-emerald-400 hover:text-emerald-300"
                >
                  View on Etherscan →
                </a>
              )}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-sm font-medium text-zinc-200">
                {ttt?.symbol} <span className="text-zinc-500">({ttt?.decimals} decimals)</span>
              </p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-400">{ttt?.address}</p>
              {ttt?.address && (
                <a
                  href={etherscanAddressUrl(ttt.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-emerald-400 hover:text-emerald-300"
                >
                  View on Etherscan →
                </a>
              )}
            </div>
          </div>
        )}
        {meta && (
          <p className="mt-4 text-xs text-zinc-500">
            Conversion rate: 1 {cttt?.symbol} unit is backed by {meta.rate.toString()} {ttt?.symbol}{" "}
            base units. Both mints are open and permissionless on Sepolia — no cooldown, any
            amount up to the confidential uint64 ceiling.
          </p>
        )}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
          <h3 className="text-base font-medium text-zinc-100">Mint confidential CTTT</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Mint 1,000 CTTT to your wallet, fully backed by freshly minted TTT. The amount is
            public; only your aggregated balance stays confidential.
          </p>
          <button
            type="button"
            onClick={() => {
              setLastAction("confidential");
              mintConfidential.mutate(
                { amount: CTTT_MINT_AMOUNT },
                { onSuccess: invalidateFaucetQueries }
              );
            }}
            disabled={!ready || mintConfidential.isPending}
            className="mt-4 rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mintConfidential.isPending ? "Minting…" : "Mint 1,000 CTTT"}
          </button>

          {lastAction === "confidential" && mintConfidential.isSuccess && mintConfidential.data && (
            <div className="mt-3 rounded-md border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
              Minted. Tx:{" "}
              <a
                href={etherscanTxUrl(mintConfidential.data.hash)}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-emerald-200"
              >
                {mintConfidential.data.hash.slice(0, 10)}…
              </a>
            </div>
          )}
          {lastAction === "confidential" && mintConfidential.isError && (
            <p className="mt-3 rounded-md border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {mintConfidential.error?.message ?? "Mint failed."}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
          <h3 className="text-base font-medium text-zinc-100">Mint plain TTT</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Mint 1,000 plain ERC-20 TTT — useful if you want to approve + wrap it into CTTT
            yourself via the standard ERC-7984 flow.
          </p>
          <button
            type="button"
            onClick={() => {
              setLastAction("underlying");
              mintUnderlying.mutate(
                { amount: TTT_MINT_AMOUNT },
                { onSuccess: invalidateFaucetQueries }
              );
            }}
            disabled={!ready || mintUnderlying.isPending}
            className="mt-4 rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mintUnderlying.isPending ? "Minting…" : "Mint 1,000 TTT"}
          </button>

          {lastAction === "underlying" && mintUnderlying.isSuccess && mintUnderlying.data && (
            <div className="mt-3 rounded-md border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
              Minted. Tx:{" "}
              <a
                href={etherscanTxUrl(mintUnderlying.data.hash)}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-emerald-200"
              >
                {mintUnderlying.data.hash.slice(0, 10)}…
              </a>
            </div>
          )}
          {lastAction === "underlying" && mintUnderlying.isError && (
            <p className="mt-3 rounded-md border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {mintUnderlying.error?.message ?? "Mint failed."}
            </p>
          )}
        </div>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-4 border-t border-zinc-800 pt-6 text-sm">
        <Link href="/create" className="text-emerald-400 hover:text-emerald-300">
          Next: create a distribution →
        </Link>
        {cttt?.address && (
          <Link
            href={`/verify?token=${cttt.address}`}
            className="text-emerald-400 hover:text-emerald-300"
          >
            Check your confidential balance →
          </Link>
        )}
      </section>
    </div>
  );
}
