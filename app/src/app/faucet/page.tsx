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
import { OnboardingHint } from "@/components/OnboardingHint";

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
      <p className="eyebrow">Step one</p>
      <h1 className="font-display mt-2 text-3xl">Testnet Faucet</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Claim the TokenOps test-token pair on Sepolia — TTT (plain ERC-20) and CTTT (its
        ERC-7984 confidential wrapper) — so judges can go from zero to a full confidential
        distribution demo in minutes.
      </p>

      <OnboardingHint
        step={1}
        total={5}
        title="Start here"
        body="Mint test tokens first — a confidential distribution needs a funded, encrypted token balance to draw from."
        nextHref="/create"
        nextLabel="Then create a distribution"
      />

      {!isConnected && (
        <div className="callout callout-warn mt-8">Connect your wallet to claim test tokens.</div>
      )}

      {isConnected && wrongChain && (
        <div className="callout callout-warn callout-between mt-8">
          <span>Switch to Sepolia (chain {SEPOLIA_CHAIN_ID}) to use the faucet.</span>
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

      <section className="panel mt-8 p-6">
        <h2 className="font-display text-lg">Token addresses</h2>
        {metaLoading && (
          <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
            <span className="redaction inline-block h-4 w-48 rounded align-middle" /> Loading faucet metadata…
          </p>
        )}
        {meta && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="panel p-4">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                {cttt?.symbol} <span style={{ color: "var(--text-faint)" }}>({cttt?.decimals} decimals)</span>
              </p>
              <p className="font-data mt-1 break-all text-xs" style={{ color: "var(--text-dim)" }}>
                {cttt?.address}
              </p>
              {cttt?.address && (
                <a href={etherscanAddressUrl(cttt.address)} target="_blank" rel="noreferrer" className="link-gold mt-2 inline-block text-xs">
                  View on Etherscan →
                </a>
              )}
            </div>
            <div className="panel p-4">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                {ttt?.symbol} <span style={{ color: "var(--text-faint)" }}>({ttt?.decimals} decimals)</span>
              </p>
              <p className="font-data mt-1 break-all text-xs" style={{ color: "var(--text-dim)" }}>
                {ttt?.address}
              </p>
              {ttt?.address && (
                <a href={etherscanAddressUrl(ttt.address)} target="_blank" rel="noreferrer" className="link-gold mt-2 inline-block text-xs">
                  View on Etherscan →
                </a>
              )}
            </div>
          </div>
        )}
        {meta && (
          <p className="mt-4 text-xs" style={{ color: "var(--text-faint)" }}>
            Conversion rate: 1 {cttt?.symbol} unit is backed by {meta.rate.toString()} {ttt?.symbol}{" "}
            base units. Both mints are open and permissionless on Sepolia — no cooldown, any
            amount up to the confidential uint64 ceiling.
          </p>
        )}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="panel p-6">
          <h3 className="font-display text-base">Mint confidential CTTT</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
            Mint 1,000 CTTT to your wallet, fully backed by freshly minted TTT. The amount is
            public; only your aggregated balance stays confidential.
          </p>
          <button
            type="button"
            onClick={() => {
              setLastAction("confidential");
              mintConfidential.mutate({ amount: CTTT_MINT_AMOUNT }, { onSuccess: invalidateFaucetQueries });
            }}
            disabled={!ready || mintConfidential.isPending}
            className="btn btn-seal mt-4"
          >
            {mintConfidential.isPending ? "Minting…" : "Mint 1,000 CTTT"}
          </button>

          {lastAction === "confidential" && mintConfidential.isSuccess && mintConfidential.data && (
            <div className="callout callout-ok mt-3 text-xs">
              Minted. Tx:{" "}
              <a href={etherscanTxUrl(mintConfidential.data.hash)} target="_blank" rel="noreferrer" className="font-data underline">
                {mintConfidential.data.hash.slice(0, 10)}…
              </a>
            </div>
          )}
          {lastAction === "confidential" && mintConfidential.isError && (
            <p className="callout callout-err mt-3 text-xs">{mintConfidential.error?.message ?? "Mint failed."}</p>
          )}
        </div>

        <div className="panel p-6">
          <h3 className="font-display text-base">Mint plain TTT</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
            Mint 1,000 plain ERC-20 TTT — useful if you want to approve + wrap it into CTTT
            yourself via the standard ERC-7984 flow.
          </p>
          <button
            type="button"
            onClick={() => {
              setLastAction("underlying");
              mintUnderlying.mutate({ amount: TTT_MINT_AMOUNT }, { onSuccess: invalidateFaucetQueries });
            }}
            disabled={!ready || mintUnderlying.isPending}
            className="btn btn-ghost mt-4"
          >
            {mintUnderlying.isPending ? "Minting…" : "Mint 1,000 TTT"}
          </button>

          {lastAction === "underlying" && mintUnderlying.isSuccess && mintUnderlying.data && (
            <div className="callout callout-ok mt-3 text-xs">
              Minted. Tx:{" "}
              <a href={etherscanTxUrl(mintUnderlying.data.hash)} target="_blank" rel="noreferrer" className="font-data underline">
                {mintUnderlying.data.hash.slice(0, 10)}…
              </a>
            </div>
          )}
          {lastAction === "underlying" && mintUnderlying.isError && (
            <p className="callout callout-err mt-3 text-xs">{mintUnderlying.error?.message ?? "Mint failed."}</p>
          )}
        </div>
      </section>

      <section className="divider-stamped mt-8 flex flex-wrap items-center gap-4 pt-6 text-sm">
        <Link href="/create" className="link-gold">
          Next: create a distribution →
        </Link>
        {cttt?.address && (
          <Link href={`/verify?token=${cttt.address}`} className="link-gold">
            Check your confidential balance →
          </Link>
        )}
      </section>
    </div>
  );
}
