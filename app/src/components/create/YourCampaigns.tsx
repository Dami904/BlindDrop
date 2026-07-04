"use client";

import { useAccount, useReadContract } from "wagmi";
import { etherscanAddressUrl } from "@/lib/packet";
import { BLINDDROP_REGISTRY_ADDRESS, blindDropRegistryAbi } from "@/lib/registry";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * "Your campaigns" panel — reads `campaignsOf(address)` from the opt-in
 * BlindDropRegistry so an admin can find campaigns they saved after a page
 * reload. Purely a read-only index/cache lookup: the registry is never
 * consulted for claim/fund authorization, so this list is informational only.
 */
export function YourCampaigns() {
  const { address, isConnected } = useAccount();

  const { data: campaigns, isLoading } = useReadContract({
    address: BLINDDROP_REGISTRY_ADDRESS,
    abi: blindDropRegistryAbi,
    functionName: "campaignsOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  if (!isConnected) return null;

  const list = campaigns ?? [];

  return (
    <div className="panel mb-8 p-4">
      <Collapsible
        defaultOpen={list.length > 0}
        triggerClassName="flex w-full items-center justify-between gap-4 text-left"
        trigger={
          <>
            <span>
              <h3 className="eyebrow">Campaigns you&apos;ve saved on-chain</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                {isLoading
                  ? "Checking the registry…"
                  : `${list.length} saved campaign${list.length === 1 ? "" : "s"}`}
              </p>
            </span>
            <ChevronIcon open={list.length > 0} />
          </>
        }
      >
        <div className="mt-3 flex flex-col gap-2">
          {list.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              None saved yet — deploy a campaign and save it here to find it after a reload.
            </p>
          ) : (
            list.map((campaign) => (
              <div key={campaign} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-data" style={{ color: "var(--text)" }}>
                  {shortAddress(campaign)}
                </span>
                <a
                  href={etherscanAddressUrl(campaign)}
                  target="_blank"
                  rel="noreferrer"
                  className="link-gold text-xs"
                >
                  View on Etherscan
                </a>
              </div>
            ))
          )}
        </div>
      </Collapsible>
    </div>
  );
}
