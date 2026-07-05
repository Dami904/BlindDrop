"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import { useMetadata } from "@zama-fhe/react-sdk";
import { confidentialAirdropCloneableAbi } from "@tokenops/sdk/fhe-airdrop";
import { etherscanAddressUrl } from "@/lib/packet";
import { BLINDDROP_REGISTRY_ADDRESS, blindDropRegistryAbi } from "@/lib/registry";
import { loadCampaignNames, saveCampaignName } from "@/lib/create-storage";
import { CampaignControls } from "@/components/create/CampaignControls";
import type { DeployedCampaign } from "@/components/create/CampaignStep";
import type { CampaignSort } from "@/components/campaigns/toolbar";

/** OpenZeppelin AccessControl's `DEFAULT_ADMIN_ROLE` is `bytes32(0)`. The
 * airdrop clone gates pause/sweep on `hasRole(DEFAULT_ADMIN_ROLE, caller)`,
 * so an address is the campaign's admin iff that read returns true. Using the
 * well-known constant lets the admin check share the same batched multicall. */
const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

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
  /** True when the connected wallet holds this campaign's DEFAULT_ADMIN_ROLE —
   * gates the per-card "Manage" (pause/sweep) section. */
  isAdmin: boolean;
}

const CAMPAIGN_VIEWS = ["START_TIME", "endTime", "isPaused", "TOKEN"] as const;

const STATUS_STYLE: Record<Status, { label: string; border: string; bg: string; color: string }> = {
  LIVE: { label: "LIVE", border: "var(--ok)", bg: "var(--ok-dim)", color: "var(--callout-ok-text)" },
  UPCOMING: { label: "UPCOMING", border: "var(--gold)", bg: "var(--gold-dim)", color: "var(--callout-gold-text)" },
  CLOSED: { label: "CLOSED", border: "var(--line-strong)", bg: "transparent", color: "var(--text-dim)" },
  PAUSED: { label: "PAUSED", border: "var(--warn)", bg: "var(--warn-dim)", color: "var(--callout-warn-text)" },
  UNKNOWN: { label: "UNKNOWN", border: "var(--line-strong)", bg: "transparent", color: "var(--text-faint)" },
};

/** Sort priority for the "Status" sort — active/soon-open campaigns bubble up. */
const STATUS_ORDER: Record<Status, number> = { LIVE: 0, UPCOMING: 1, PAUSED: 2, CLOSED: 3, UNKNOWN: 4 };

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

/** Sealed-envelope glyph for empty case-file states. */
function EmptyLedgerGlyph() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden>
      <rect x="1" y="1" width="28" height="20" rx="2" stroke="var(--text-faint)" strokeWidth="1.3" />
      <path d="M2 2.5 15 13.5 28 2.5" stroke="var(--text-faint)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="15" cy="14" r="2.4" fill="var(--text-faint)" opacity="0.5" />
    </svg>
  );
}

interface CampaignItem {
  campaign: Address;
  meta: CampaignMeta;
  name?: string;
  symbol?: string;
  /** Registry append-index — used as the chronological proxy for newest/oldest sort. */
  index: number;
}

function matchesQuery(item: CampaignItem, q: string): boolean {
  if (!q) return true;
  const haystack = [
    item.name ?? "",
    item.campaign,
    item.symbol ?? "",
    item.meta.token ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function sortItems(items: CampaignItem[], sort: CampaignSort): CampaignItem[] {
  const copy = [...items];
  if (sort === "status") {
    copy.sort((a, b) => {
      const diff = STATUS_ORDER[campaignStatus(a.meta)] - STATUS_ORDER[campaignStatus(b.meta)];
      return diff !== 0 ? diff : b.index - a.index;
    });
  } else if (sort === "oldest") {
    copy.sort((a, b) => a.index - b.index);
  } else {
    copy.sort((a, b) => b.index - a.index);
  }
  return copy;
}

/**
 * "Airdrop campaigns" management dashboard — reads `campaignsOf(address)` from
 * the opt-in BlindDropRegistry so an admin can find campaigns they saved after
 * a reload, then reads each campaign contract's own public getters
 * (start/end time, pause state, token) plus a `hasRole` admin check in one
 * batched multicall. Purely read-only/public data — never consulted for
 * claim/fund authorization. Filterable/sortable via the shared toolbar.
 */
export function AirdropCampaigns({ query, sort }: { query: string; sort: CampaignSort }) {
  const { address, isConnected } = useAccount();

  // Local-only nicknames, keyed by lowercased campaign address.
  const [names, setNames] = useState<Record<string, string>>({});
  // Resolved token symbols, keyed by lowercased campaign address — populated
  // by always-mounted resolvers below so token-symbol search works even for
  // campaigns currently filtered out of view.
  const [symbols, setSymbols] = useState<Record<string, string>>({});

  useEffect(() => {
    setNames(loadCampaignNames());
  }, []);

  const handleSymbolResolved = useCallback((campaign: string, symbol: string) => {
    setSymbols((prev) => {
      const key = campaign.toLowerCase();
      if (prev[key] === symbol) return prev;
      return { ...prev, [key]: symbol };
    });
  }, []);

  function handleRename(campaign: string, name: string) {
    saveCampaignName(campaign, name);
    setNames((prev) => {
      const next = { ...prev };
      const key = campaign.toLowerCase();
      const trimmed = name.trim().slice(0, 40);
      if (trimmed) next[key] = trimmed;
      else delete next[key];
      return next;
    });
  }

  const { data: campaigns, isLoading } = useReadContract({
    address: BLINDDROP_REGISTRY_ADDRESS,
    abi: blindDropRegistryAbi,
    functionName: "campaignsOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const list = campaigns ?? [];

  const readsPerCampaign = address ? CAMPAIGN_VIEWS.length + 1 : CAMPAIGN_VIEWS.length;

  const contracts = list.flatMap((campaign) => {
    const reads: {
      address: Address;
      abi: typeof confidentialAirdropCloneableAbi;
      functionName: string;
      args?: readonly unknown[];
    }[] = CAMPAIGN_VIEWS.map((functionName) => ({
      address: campaign,
      abi: confidentialAirdropCloneableAbi,
      functionName,
    }));
    if (address) {
      reads.push({
        address: campaign,
        abi: confidentialAirdropCloneableAbi,
        functionName: "hasRole",
        args: [DEFAULT_ADMIN_ROLE, address],
      });
    }
    return reads;
  });

  const { data: results, isLoading: metaLoading } = useReadContracts({
    contracts,
    query: { enabled: list.length > 0 },
  });

  if (!isConnected) return null;

  const metas: CampaignMeta[] = list.map((_, index) => {
    const base = index * readsPerCampaign;
    const slice = results?.slice(base, base + CAMPAIGN_VIEWS.length);
    if (!slice || slice.length < CAMPAIGN_VIEWS.length) {
      return { settled: false, failed: false, isAdmin: false };
    }
    const [startTimeRes, endTimeRes, pausedRes, tokenRes] = slice;
    const failed = slice.some((entry) => entry.status !== "success");
    if (failed) return { settled: true, failed: true, isAdmin: false };
    const adminRes = address ? results?.[base + CAMPAIGN_VIEWS.length] : undefined;
    const isAdmin = adminRes?.status === "success" && adminRes.result === true;
    return {
      settled: true,
      failed: false,
      isAdmin,
      startTime: startTimeRes.result as unknown as bigint,
      endTime: endTimeRes.result as unknown as bigint,
      paused: pausedRes.result as unknown as boolean,
      token: tokenRes.result as unknown as Address,
    };
  });

  const items: CampaignItem[] = list.map((campaign, index) => ({
    campaign,
    meta: metas[index],
    name: names[campaign.toLowerCase()],
    symbol: symbols[campaign.toLowerCase()],
    index,
  }));

  const q = query.trim().toLowerCase();
  const visible = sortItems(items.filter((item) => matchesQuery(item, q)), sort);

  // Token addresses worth resolving a symbol for — mounted unconditionally
  // (independent of the filter) so symbol search can match hidden campaigns.
  const tokenResolvers = items.filter(
    (item) => item.meta.token && isAddress(item.meta.token) && item.meta.token !== zeroAddress
  );

  return (
    <section className="panel p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">Airdrop campaigns</h2>
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          {isLoading
            ? "Checking the registry…"
            : `${list.length} saved${list.length ? ` · ${visible.length} shown` : ""}`}
        </p>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
        Campaigns you saved on-chain — manage pause, resume and sweep here.
      </p>

      {/* Off-screen symbol resolvers — render nothing, just report symbols up. */}
      <div className="sr-only" aria-hidden>
        {tokenResolvers.map((item) => (
          <TokenSymbolResolver
            key={item.campaign}
            campaign={item.campaign}
            token={item.meta.token as Address}
            onResolved={handleSymbolResolved}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <EmptyLedgerGlyph />
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              No campaigns saved yet — deploy one, save it to your campaigns, and manage it here.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <EmptyLedgerGlyph />
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              No campaigns match your search.
            </p>
          </div>
        ) : (
          visible.map((item) => (
            <CampaignCard
              key={item.campaign}
              campaign={item.campaign}
              meta={item.meta}
              loading={metaLoading || !item.meta.settled}
              connectedAddress={address}
              name={item.name}
              onRename={(name) => handleRename(item.campaign, name)}
            />
          ))
        )}
      </div>
      {list.length > 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
          Names are saved only in this browser — never on-chain.
        </p>
      )}
    </section>
  );
}

function CampaignCard({
  campaign,
  meta,
  loading,
  connectedAddress,
  name,
  onRename,
}: {
  campaign: string;
  meta: CampaignMeta;
  loading: boolean;
  connectedAddress?: Address;
  name?: string;
  onRename: (name: string) => void;
}) {
  const status = campaignStatus(meta);
  const style = STATUS_STYLE[status];
  const hasToken = !loading && !meta.failed && meta.token && isAddress(meta.token) && meta.token !== zeroAddress;

  const canManage =
    !loading &&
    !meta.failed &&
    meta.isAdmin &&
    !!connectedAddress &&
    isAddress(campaign) &&
    meta.endTime !== undefined;

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-md border p-3 sm:p-4"
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
        {!name && (
          <a
            href={etherscanAddressUrl(campaign)}
            target="_blank"
            rel="noreferrer"
            className="link-gold font-data text-xs break-all"
          >
            {shortAddress(campaign)}
          </a>
        )}
      </div>

      <CampaignNameField campaign={campaign} name={name} onRename={onRename} />

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

      {canManage && connectedAddress && (
        <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--line)" }}>
          <CampaignControls deployed={buildManagedCampaign(campaign as Address, meta, connectedAddress)} />
        </div>
      )}
    </div>
  );
}

/**
 * Builds the minimal {@link DeployedCampaign}-shaped object CampaignControls
 * needs to manage a registry-discovered campaign. CampaignControls only reads
 * `airdrop` (its pause/withdraw hooks) and `endTimestamp` (the "claim window
 * ended" copy + early-sweep confirm); the withdraw recipient and admin guard
 * come from `useAccount()` inside it, and the mutations are admin-gated
 * on-chain regardless. The rest carry safe placeholders.
 */
function buildManagedCampaign(
  airdrop: Address,
  meta: CampaignMeta,
  connectedAddress: Address,
): DeployedCampaign {
  return {
    airdrop,
    token: (meta.token ?? zeroAddress) as Address,
    admin: connectedAddress,
    endTimestamp: meta.endTime !== undefined ? Number(meta.endTime) : 0,
    startTimestamp: meta.startTime !== undefined ? Number(meta.startTime) : 0,
    hash: "0x" as Hex,
    userSalt: "0x" as Hex,
    gasFee: BigInt(0),
  };
}

const CAMPAIGN_NAME_MAX_LENGTH = 40;

/**
 * Local-only nickname for a campaign card — the card's title when set (with
 * the address demoted below), or a small "name this" affordance when unset.
 * Click the pencil (or the name) to edit inline; Enter/blur saves, Escape
 * cancels. Never touches chain/server state.
 */
function CampaignNameField({
  campaign,
  name,
  onRename,
}: {
  campaign: string;
  name?: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(name ?? "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    onRename(draft);
  }

  function cancel() {
    setDraft(name ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={CAMPAIGN_NAME_MAX_LENGTH}
        placeholder="Name this campaign…"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="field text-sm"
        aria-label="Campaign nickname"
      />
    );
  }

  if (name) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
            {name}
          </p>
          <a
            href={etherscanAddressUrl(campaign)}
            target="_blank"
            rel="noreferrer"
            className="link-gold font-data text-xs break-all"
          >
            {shortAddress(campaign)}
          </a>
        </div>
        <button
          type="button"
          onClick={startEditing}
          className="shrink-0 text-xs"
          style={{ color: "var(--text-faint)" }}
          aria-label="Rename campaign"
          title="Rename"
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="w-fit text-xs"
      style={{ color: "var(--text-faint)" }}
    >
      ✎ Name this campaign
    </button>
  );
}

/** Only mounted once `token` passed an `isAddress` + non-zero check (see
 * `CampaignCard`) — `useMetadata` builds a token client unconditionally. */
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

/** Renders nothing — resolves a campaign's token symbol via `useMetadata` and
 * reports it up so the parent can match it in symbol search. Only mounted for
 * campaigns with a valid, non-zero token address (guarded by the caller). */
function TokenSymbolResolver({
  campaign,
  token,
  onResolved,
}: {
  campaign: string;
  token: Address;
  onResolved: (campaign: string, symbol: string) => void;
}) {
  const metadata = useMetadata(token);
  const symbol = metadata.data?.symbol ?? metadata.data?.name;

  useEffect(() => {
    if (symbol) onResolved(campaign, symbol);
  }, [campaign, symbol, onResolved]);

  return null;
}
