"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { isAddress, zeroAddress, type Address } from "viem";
import { useMetadata } from "@zama-fhe/react-sdk";
import { confidentialAirdropCloneableAbi } from "@tokenops/sdk/fhe-airdrop";
import { etherscanAddressUrl } from "@/lib/packet";
import { BLINDDROP_REGISTRY_ADDRESS, blindDropRegistryAbi } from "@/lib/registry";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatCompactDate(unixSeconds: bigint) {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Status = "LIVE" | "UPCOMING" | "CLOSED" | "PAUSED" | "UNKNOWN";

interface CampaignMeta {
  startTime?: bigint;
  endTime?: bigint;
  paused?: boolean;
  token?: Address;
  /** True once the batched read for this campaign has settled (success or failure). */
  settled: boolean;
  /** True if any of the four reads for this campaign reverted/errored. */
  failed: boolean;
}

/** The four view calls read per campaign, batched into a single multicall. */
const CAMPAIGN_VIEWS = ["START_TIME", "endTime", "isPaused", "TOKEN"] as const;

const STATUS_STYLE: Record<Status, { label: string; border: string; bg: string; color: string }> = {
  LIVE: { label: "LIVE", border: "var(--ok)", bg: "var(--ok-dim)", color: "var(--callout-ok-text)" },
  UPCOMING: { label: "UPCOMING", border: "var(--gold)", bg: "var(--gold-dim)", color: "var(--callout-gold-text)" },
  CLOSED: { label: "CLOSED", border: "var(--line-strong)", bg: "transparent", color: "var(--text-dim)" },
  PAUSED: { label: "PAUSED", border: "var(--warn)", bg: "var(--warn-dim)", color: "var(--callout-warn-text)" },
  UNKNOWN: { label: "UNKNOWN", border: "var(--line-strong)", bg: "transparent", color: "var(--text-faint)" },
};

function campaignStatus(meta: CampaignMeta): Status {
  if (!meta.settled || meta.failed || meta.startTime === undefined || meta.endTime === undefined || meta.paused === undefined) {
    return "UNKNOWN";
  }
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (meta.paused) return "PAUSED";
  if (nowSec < meta.startTime) return "UPCOMING";
  if (nowSec >= meta.endTime) return "CLOSED";
  return "LIVE";
}

function claimWindowLabel(meta: CampaignMeta, status: Status) {
  if (status === "UNKNOWN") return "Claim window unknown";
  if (status === "UPCOMING" && meta.startTime !== undefined) return `Opens ${formatCompactDate(meta.startTime)}`;
  if (status === "CLOSED" && meta.endTime !== undefined) return `Closed ${formatCompactDate(meta.endTime)}`;
  if (meta.endTime !== undefined) return `Closes ${formatCompactDate(meta.endTime)}`;
  return "Claim window unknown";
}

/**
 * "Your campaigns" panel — reads `campaignsOf(address)` from the opt-in
 * BlindDropRegistry so an admin can find campaigns they saved after a page
 * reload, then reads each campaign contract's own public getters (start/end
 * time, pause state, token) to render an informative status card. Purely
 * read-only/public data: the registry and these getters are never consulted
 * for claim/fund authorization, so this list is informational only.
 *
 * Token + claim-window metadata come straight from each airdrop clone's own
 * `TOKEN()`/`START_TIME()`/`endTime()`/`isPaused()` views rather than from
 * the registry's `campaignAt`/`campaignsSlice` — those two enumerate the
 * *entire* registry by global index (not filtered by registrar), so turning
 * a registrar's `campaignsOf` list into records would mean an unbounded scan
 * and an address-match per entry. Reading each campaign contract directly is
 * one batched multicall, no scan required.
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

  const list = campaigns ?? [];

  const contracts = list.flatMap((campaign) =>
    CAMPAIGN_VIEWS.map((functionName) => ({
      address: campaign,
      abi: confidentialAirdropCloneableAbi,
      functionName,
    })),
  );

  const { data: results, isLoading: metaLoading } = useReadContracts({
    contracts,
    query: { enabled: list.length > 0 },
  });

  if (!isConnected) return null;

  const metas: CampaignMeta[] = list.map((_, index) => {
    const base = index * CAMPAIGN_VIEWS.length;
    const slice = results?.slice(base, base + CAMPAIGN_VIEWS.length);
    if (!slice || slice.length < CAMPAIGN_VIEWS.length) {
      return { settled: false, failed: false };
    }
    const [startTimeRes, endTimeRes, pausedRes, tokenRes] = slice;
    const failed = slice.some((entry) => entry.status !== "success");
    if (failed) return { settled: true, failed: true };
    return {
      settled: true,
      failed: false,
      startTime: startTimeRes.result as unknown as bigint,
      endTime: endTimeRes.result as unknown as bigint,
      paused: pausedRes.result as unknown as boolean,
      token: tokenRes.result as unknown as Address,
    };
  });

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
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {list.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              None saved yet — deploy a campaign and save it here to find it after a reload.
            </p>
          ) : (
            list.map((campaign, index) => (
              <CampaignCard
                key={campaign}
                campaign={campaign}
                meta={metas[index]}
                loading={metaLoading || !metas[index].settled}
              />
            ))
          )}
        </div>
      </Collapsible>
    </div>
  );
}

function CampaignCard({
  campaign,
  meta,
  loading,
}: {
  campaign: string;
  meta: CampaignMeta;
  loading: boolean;
}) {
  const status = campaignStatus(meta);
  const style = STATUS_STYLE[status];
  const hasToken = !loading && !meta.failed && meta.token && isAddress(meta.token) && meta.token !== zeroAddress;

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border p-3"
      style={{ borderColor: "var(--line)", background: "var(--ink-3)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {loading ? (
          <span className="redaction inline-block h-5 w-16 rounded" aria-hidden />
        ) : (
          <span
            className="badge"
            style={{ borderColor: style.border, background: style.bg, color: style.color }}
          >
            {style.label}
          </span>
        )}
        <a
          href={etherscanAddressUrl(campaign)}
          target="_blank"
          rel="noreferrer"
          className="link-gold font-data text-xs"
        >
          {shortAddress(campaign)}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {loading ? (
          <span className="redaction inline-block h-4 w-20 rounded" aria-hidden />
        ) : hasToken ? (
          <TokenSymbolBadge token={meta.token as Address} />
        ) : (
          <span style={{ color: "var(--text-faint)" }}>Token unknown</span>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        {loading ? (
          <span className="redaction inline-block h-3.5 w-32 rounded" aria-hidden />
        ) : (
          claimWindowLabel(meta, status)
        )}
      </p>

      <div
        className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--text-faint)" }}
        title="Encrypted on-chain — visible to no one."
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="eyebrow" style={{ fontSize: "0.625rem" }}>
            TOTAL
          </span>
          <span className="redaction inline-block h-3 w-14 rounded" aria-hidden />
          <span>sealed</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="eyebrow" style={{ fontSize: "0.625rem" }}>
            RECIPIENTS
          </span>
          <span className="redaction inline-block h-3 w-8 rounded" aria-hidden />
          <span>sealed</span>
        </span>
      </div>
    </div>
  );
}

/** Only ever mounted once `token` has passed an `isAddress` + non-zero check
 * (see `CampaignCard` above) — `useMetadata` builds a token client from the
 * address unconditionally, so an invalid address would throw during render
 * rather than surfacing as a query error. */
function TokenSymbolBadge({ token }: { token: Address }) {
  const metadata = useMetadata(token);

  if (metadata.isLoading) {
    return <span className="redaction inline-block h-4 w-14 rounded" aria-hidden />;
  }

  if (metadata.isError || !metadata.data) {
    return <span style={{ color: "var(--text-faint)" }}>Unknown token</span>;
  }

  return (
    <span className="font-data" style={{ color: "var(--text-dim)" }}>
      {metadata.data.symbol ?? metadata.data.name ?? "Unknown"}
    </span>
  );
}
