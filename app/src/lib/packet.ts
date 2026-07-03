/**
 * Pure, framework-free helpers for parsing and validating a recipient's
 * "claim packet" — the JSON payload an airdrop admin hands out off-chain
 * containing the admin-signed EIP-712 authorization for a single claim.
 *
 * Kept dependency-free (no zod) so it is trivially unit-testable.
 */

export const SEPOLIA_CHAIN_ID = 11155111;

export interface ClaimPacket {
  version: 1;
  airdrop: `0x${string}`;
  chainId: number;
  token: `0x${string}`;
  recipient: `0x${string}`;
  encryptedInput: {
    handle: `0x${string}`;
    inputProof: `0x${string}`;
  };
  signature: `0x${string}`;
}

const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_BYTES_RE = /^0x[0-9a-fA-F]+$/;

function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && HEX_ADDRESS_RE.test(value);
}

function isHexBytes(value: unknown): value is `0x${string}` {
  return typeof value === "string" && HEX_BYTES_RE.test(value);
}

/** Hand-rolled type guard — validates the full shape of a claim packet. */
export function isClaimPacket(value: unknown): value is ClaimPacket {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (v.version !== 1) return false;
  if (!isHexAddress(v.airdrop)) return false;
  if (typeof v.chainId !== "number" || !Number.isInteger(v.chainId)) return false;
  if (!isHexAddress(v.token)) return false;
  if (!isHexAddress(v.recipient)) return false;
  if (!isHexBytes(v.signature)) return false;

  const ei = v.encryptedInput;
  if (typeof ei !== "object" || ei === null) return false;
  const eiRec = ei as Record<string, unknown>;
  if (!isHexBytes(eiRec.handle)) return false;
  if (!isHexBytes(eiRec.inputProof)) return false;

  return true;
}

export type PacketParseError =
  | { kind: "empty-input" }
  | { kind: "invalid-json"; message: string }
  | { kind: "invalid-shape" };

export type PacketParseResult =
  | { ok: true; packet: ClaimPacket }
  | { ok: false; error: PacketParseError };

/**
 * Parse raw text (either a raw JSON object, or a base64-encoded JSON blob)
 * into a validated {@link ClaimPacket}. Pure function — no I/O.
 */
export function parsePacketText(raw: string): PacketParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: { kind: "empty-input" } };
  }

  const candidates: string[] = [trimmed];

  // If it doesn't look like JSON, try treating it as base64.
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    try {
      const decoded =
        typeof atob === "function"
          ? decodeURIComponent(
              atob(trimmed)
                .split("")
                .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
                .join("")
            )
          : Buffer.from(trimmed, "base64").toString("utf-8");
      candidates.push(decoded);
    } catch {
      // ignore — will fall through to JSON parse error below
    }
  }

  let lastJsonError: string | undefined;
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isClaimPacket(parsed)) {
        return { ok: true, packet: parsed };
      }
      // Parsed fine but shape doesn't match — keep trying other candidates,
      // but remember that at least one candidate parsed as JSON.
      lastJsonError = undefined;
    } catch (err) {
      lastJsonError = err instanceof Error ? err.message : String(err);
    }
  }

  if (lastJsonError) {
    return { ok: false, error: { kind: "invalid-json", message: lastJsonError } };
  }
  return { ok: false, error: { kind: "invalid-shape" } };
}

/** True when `a` and `b` are the same address, case-insensitively. */
export function isSameAddress(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function isSepoliaChainId(chainId: number | undefined | null): boolean {
  return chainId === SEPOLIA_CHAIN_ID;
}

export function etherscanAddressUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}

export function etherscanTxUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}
