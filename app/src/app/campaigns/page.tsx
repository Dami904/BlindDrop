"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { isSepoliaChainId, SEPOLIA_CHAIN_ID } from "@/lib/packet";
import { CampaignsToolbar, type CampaignSort } from "@/components/campaigns/toolbar";
import { AirdropCampaigns } from "@/components/campaigns/AirdropCampaigns";
import { DisperseHistory } from "@/components/campaigns/DisperseHistory";

export default function CampaignsPage() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wrongChain = !isSepoliaChainId(chainId);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CampaignSort>("newest");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">Case files · the archive</p>
      <h1 className="font-display mt-2 text-3xl">Your distributions</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Every campaign you saved on-chain and every push-send you logged — search the archive,
        sort it, and manage a campaign&apos;s pause, resume and sweep from one desk.
      </p>

      {!isConnected && (
        <div className="callout callout-warn mt-8">Connect your wallet to review your distributions.</div>
      )}

      {isConnected && wrongChain && (
        <div className="callout callout-warn callout-between mt-8">
          <span>Switch to Sepolia (chain {SEPOLIA_CHAIN_ID}) to review your distributions.</span>
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

      {isConnected && !wrongChain && (
        <>
          <div className="mt-8">
            <CampaignsToolbar
              query={query}
              onQueryChange={setQuery}
              sort={sort}
              onSortChange={setSort}
            />
          </div>

          <div className="mt-6 flex flex-col gap-6">
            <AirdropCampaigns query={query} sort={sort} />
            <DisperseHistory query={query} sort={sort} />
          </div>
        </>
      )}
    </div>
  );
}
