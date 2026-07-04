/**
 * localStorage persistence for the create wizard's post-deploy state:
 * the deployed campaign's public identity (step 2 → step 3) and each
 * campaign's sealed claim packets (step 3).
 *
 * Both are *public on-chain-adjacent* data once sealed/deployed — the
 * campaign identity is public chain state, and a sealed packet is already
 * the bearer-ish authorization handed to its recipient (see THREAT_MODEL.md).
 * Storing them lets an admin navigate away or reload without re-signing
 * every authorization. Every read/write is wrapped in try/catch, mirroring
 * the existing recipient-draft pattern in RecipientsStep — corrupt or
 * foreign data is treated as "nothing stored" rather than thrown.
 */

import type { Address } from "viem";
import type { DeployedCampaign } from "@/components/create/CampaignStep";
import { isClaimPacket, type ClaimPacket } from "@/lib/packet";

export const DEPLOYED_CAMPAIGN_KEY = "blinddrop:deployed-campaign:v1";

export function packetsStorageKey(airdropAddress: string): string {
  return `blinddrop:packets:v1:${airdropAddress.toLowerCase()}`;
}

export interface StoredGeneratedPacket {
  address: Address;
  packet: ClaimPacket;
}

export interface StoredPacketsRecord {
  sealedAt: string;
  packets: StoredGeneratedPacket[];
}

function isStoredGeneratedPacket(value: unknown): value is StoredGeneratedPacket {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(v.address) && isClaimPacket(v.packet);
}

/** Saves a deployed campaign's public identity. `gasFee` is a bigint, which
 * JSON.stringify can't handle directly, so it's round-tripped as a string. */
export function saveDeployedCampaign(deployed: DeployedCampaign): void {
  try {
    const serializable = { ...deployed, gasFee: deployed.gasFee.toString() };
    localStorage.setItem(DEPLOYED_CAMPAIGN_KEY, JSON.stringify(serializable));
  } catch {
    // storage unavailable/full — the wizard still works in-memory this session
  }
}

export function loadDeployedCampaign(): DeployedCampaign | null {
  try {
    const raw = localStorage.getItem(DEPLOYED_CAMPAIGN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.airdrop !== "string" ||
      typeof parsed.hash !== "string" ||
      typeof parsed.token !== "string" ||
      typeof parsed.userSalt !== "string" ||
      typeof parsed.gasFee !== "string" ||
      typeof parsed.admin !== "string" ||
      typeof parsed.startTimestamp !== "number" ||
      typeof parsed.endTimestamp !== "number"
    ) {
      return null;
    }
    return {
      airdrop: parsed.airdrop as Address,
      hash: parsed.hash as `0x${string}`,
      token: parsed.token as Address,
      userSalt: parsed.userSalt as `0x${string}`,
      gasFee: BigInt(parsed.gasFee),
      admin: parsed.admin as Address,
      startTimestamp: parsed.startTimestamp,
      endTimestamp: parsed.endTimestamp,
    };
  } catch {
    return null;
  }
}

export function clearDeployedCampaign(): void {
  try {
    localStorage.removeItem(DEPLOYED_CAMPAIGN_KEY);
  } catch {
    // ignore
  }
}

export function savePackets(airdropAddress: string, packets: StoredGeneratedPacket[]): void {
  try {
    const key = packetsStorageKey(airdropAddress);
    if (packets.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    const record: StoredPacketsRecord = { sealedAt: new Date().toISOString(), packets };
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // storage unavailable/full — the wizard still works in-memory this session
  }
}

export function loadPackets(airdropAddress: string): StoredPacketsRecord | null {
  try {
    const raw = localStorage.getItem(packetsStorageKey(airdropAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.sealedAt !== "string" || !Array.isArray(parsed.packets)) return null;
    const packets = parsed.packets.filter(isStoredGeneratedPacket);
    if (packets.length === 0) return null;
    return { sealedAt: parsed.sealedAt, packets };
  } catch {
    return null;
  }
}

export function clearPackets(airdropAddress: string): void {
  try {
    localStorage.removeItem(packetsStorageKey(airdropAddress));
  } catch {
    // ignore
  }
}

export function emailToggleStorageKey(airdropAddress: string): string {
  return `blinddrop:email-toggle:v1:${airdropAddress.toLowerCase()}`;
}

/** Persists whether the "email claim links" toggle is on for this campaign — scoped per
 * campaign so switching campaigns doesn't carry the choice over. */
export function saveEmailToggle(airdropAddress: string, enabled: boolean): void {
  try {
    localStorage.setItem(emailToggleStorageKey(airdropAddress), enabled ? "1" : "0");
  } catch {
    // storage unavailable — the toggle just won't persist across reloads
  }
}

/** Defaults to `false` (off) when nothing is stored yet. */
export function loadEmailToggle(airdropAddress: string): boolean {
  try {
    return localStorage.getItem(emailToggleStorageKey(airdropAddress)) === "1";
  } catch {
    return false;
  }
}

export const CAMPAIGN_NAMES_KEY = "blinddrop:campaign-names:v1";

const CAMPAIGN_NAME_MAX_LENGTH = 40;

function isCampaignNamesRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "string");
}

/** Purely a local, browser-side label for an admin's own reference — never
 * derived from or sent to chain/server. Names can be sensitive (e.g. "Investor
 * Round"), so this is the only place they're ever persisted. */
export function loadCampaignNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CAMPAIGN_NAMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return isCampaignNamesRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Saves a nickname for `airdropAddress`, keyed lowercased. An empty/blank
 * name (after trimming) removes the entry rather than storing a blank string. */
export function saveCampaignName(airdropAddress: string, name: string): void {
  try {
    const trimmed = name.trim().slice(0, CAMPAIGN_NAME_MAX_LENGTH);
    const names = loadCampaignNames();
    const key = airdropAddress.toLowerCase();
    if (trimmed) {
      names[key] = trimmed;
    } else {
      delete names[key];
    }
    localStorage.setItem(CAMPAIGN_NAMES_KEY, JSON.stringify(names));
  } catch {
    // storage unavailable/full — the campaign still works, just unnamed
  }
}

export function deleteCampaignName(airdropAddress: string): void {
  try {
    const names = loadCampaignNames();
    delete names[airdropAddress.toLowerCase()];
    localStorage.setItem(CAMPAIGN_NAMES_KEY, JSON.stringify(names));
  } catch {
    // ignore
  }
}
