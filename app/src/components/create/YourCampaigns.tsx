"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import { useMetadata } from "@zama-fhe/react-sdk";
import { confidentialAirdropCloneableAbi } from "@tokenops/sdk/fhe-airdrop";
import { etherscanAddressUrl } from "@/lib/packet";
import { BLINDDROP_REGISTRY_ADDRESS, blindDropRegistryAbi } from "@/lib/registry";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";
import { loadCampaignNames, saveCampaignName } from "@/lib/create-storage";
import { CampaignControls } from "@/components/create/CampaignControls";
import type { DeployedCampaign } from "@/components/create/CampaignStep";

/** OpenZeppelin AccessControl's `DEFAULT_ADMIN_ROLE` is `bytes32(0)`. The
 * airdrop clone gates pause/sweep on `hasRole(DEFAULT_ADMIN_ROLE, caller)`,
 * so an address is the campaign's admin iff that read returns true. Using
 * the well-known constant avoids a second, sequential `DEFAULT_ADMIN_ROLE()`
 * read (which couldn't share the same batched multicall). */
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
   * gates the per-card "Manage" (pause/sweep) section. False when not
   * connected or the admin read failed. */
  isAdmin: boolean;
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

/** Sealed-envelope glyph for empty ledger/case-file states — reuses the
 * envelope + wax-seal motif rather than an image, kept deliberately quiet
 * (text-faint) since it marks an absence, not an action. */
function EmptyLedgerGlyph() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden>
      <rect x="1" y="1" width="28" height="20" rx="2" stroke="var(--text-faint)" strokeWidth="1.3" />
      <path d="M2 2.5 15 13.5 28 2.5" stroke="var(--text-faint)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="15" cy="14" r="2.4" fill="var(--text-faint)" opacity="0.5" />
    </svg>
  );
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

  // Local-only nicknames, keyed by lowercased campaign address — loaded once
  // on mount and kept in state so renames re-render immediately without a
  // re-read from localStorage on every card.
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setNames(loadCampaignNames());
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

  // Per campaign: the four public status views, plus (when a wallet is
  // connected) a `hasRole(DEFAULT_ADMIN_ROLE, wallet)` read so each card can
  // decide whether to offer admin controls — all in the one batched multicall,
  // never N extra hooks. The admin read is appended only while connected, so
  // the stride grows by one and the metas mapping below reads from that offset.
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
    // The admin read sits right after the four views (only present while a
    // wallet is connected). A revert/absent result means "not admin".
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
            <div className="flex flex-col items-center gap-2 py-4 text-center sm:col-span-2">
              <EmptyLedgerGlyph />
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                No case files yet — deploy a campaign and save it here.
              </p>
            </div>
          ) : (
            list.map((campaign, index) => (
              <CampaignCard
                key={campaign}
                campaign={campaign}
                meta={metas[index]}
                loading={metaLoading || !metas[index].settled}
                connectedAddress={address}
                name={names[campaign.toLowerCase()]}
                onRename={(name) => handleRename(campaign, name)}
              />
            ))
          )}
        </div>
        {list.length > 0 && (
          <p className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
            Names are saved only in this browser — never on-chain.
          </p>
        )}
      </Collapsible>
    </div>
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

  // Admin controls mount only when the connected wallet actually holds this
  // campaign's DEFAULT_ADMIN_ROLE (verified on-chain via the batched hasRole
  // read) and the card address is valid — otherwise the card stays view-only.
  const canManage =
    !loading &&
    !meta.failed &&
    meta.isAdmin &&
    !!connectedAddress &&
    isAddress(campaign) &&
    meta.endTime !== undefined;

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
        {!name && (
          <a
            href={etherscanAddressUrl(campaign)}
            target="_blank"
            rel="noreferrer"
            className="link-gold font-data text-xs"
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
          <CampaignControls deployed={buildManagedCampaign(campaign, meta, connectedAddress)} />
        </div>
      )}
    </div>
  );
}

/**
 * Builds the minimal {@link DeployedCampaign}-shaped object CampaignControls
 * needs to manage a campaign discovered from the registry (rather than one
 * just deployed in-session). CampaignControls only ever reads `airdrop` (for
 * its pause/withdraw hooks) and `endTimestamp` (for the "claim window ended"
 * copy + the early-sweep confirm) — the withdraw recipient and admin guard
 * both come from `useAccount()` inside the component, and the mutations are
 * admin-gated on-chain regardless. The remaining fields are never consumed
 * here, so they carry safe placeholders; `token`/`admin`/timestamps still get
 * real values from the card's own reads to keep the object honest.
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
    // Placeholders — never read by CampaignControls (deploy/fund-only fields).
    hash: "0x" as Hex,
    userSalt: "0x" as Hex,
    gasFee: BigInt(0),
  };
}

const CAMPAIGN_NAME_MAX_LENGTH = 40;

/**
 * Local-only nickname for a campaign card: shows the name as the card's
 * title (with the address demoted to a secondary line) when set, or just a
 * small "name this" affordance when it isn't. Click the pencil (or the name
 * itself) to edit inline; Enter/blur saves, Escape cancels. Never touches
 * chain/server state — purely a `create-storage` localStorage round-trip via
 * `onRename`.
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
            className="link-gold font-data text-xs"
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
