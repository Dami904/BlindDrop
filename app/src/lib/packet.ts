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
  | { kind: "invalid-shape" }
  | { kind: "no-packet-for-wallet"; packetCount: number }
  | { kind: "multiple-packets-need-wallet"; packetCount: number };

export type PacketParseResult =
  | { ok: true; packet: ClaimPacket }
  | { ok: false; error: PacketParseError };

/**
 * Parse raw text (a raw JSON packet, a base64-encoded JSON blob, or a
 * "download all" JSON array of packets) into a validated {@link ClaimPacket}.
 * When the input holds multiple packets, `walletAddress` selects the one
 * belonging to the connected wallet. Pure function — no I/O.
 */
export function parsePacketText(raw: string, walletAddress?: string): PacketParseResult {
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
  let arrayError: PacketParseError | undefined;
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isClaimPacket(parsed)) {
        return { ok: true, packet: parsed };
      }
      // A "download all" export is an array of packets. Pick the connected
      // wallet's packet; a single-element array needs no wallet to disambiguate.
      if (Array.isArray(parsed)) {
        const packets = parsed
          .map((entry) =>
            isClaimPacket(entry)
              ? entry
              : // "download all" wraps each packet as { address, packet }
                entry && typeof entry === "object" && isClaimPacket((entry as { packet?: unknown }).packet)
                ? ((entry as { packet: ClaimPacket }).packet)
                : undefined
          )
          .filter((p): p is ClaimPacket => p !== undefined);
        if (packets.length > 0) {
          if (packets.length === 1) return { ok: true, packet: packets[0] };
          if (walletAddress) {
            const mine = packets.find((p) => isSameAddress(p.recipient, walletAddress));
            if (mine) return { ok: true, packet: mine };
            arrayError = { kind: "no-packet-for-wallet", packetCount: packets.length };
          } else {
            arrayError = { kind: "multiple-packets-need-wallet", packetCount: packets.length };
          }
          continue;
        }
      }
      // Parsed fine but shape doesn't match — keep trying other candidates,
      // but remember that at least one candidate parsed as JSON.
      lastJsonError = undefined;
    } catch (err) {
      lastJsonError = err instanceof Error ? err.message : String(err);
    }
  }

  if (arrayError) {
    return { ok: false, error: arrayError };
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

// --- Claim links: base64url-encoded packets embedded in a URL fragment ---
//
// Standard base64 uses `+`, `/`, and `=` padding, all of which are awkward or
// unsafe in a URL fragment. base64url swaps `+`/`/` for `-`/`_` and drops
// padding, per RFC 4648 §5. These are pure string transforms (no crypto) so
// they're trivially unit-testable without a browser or Buffer polyfill.

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/** UTF-8-safe base64url encode, for embedding a claim packet in a URL fragment (`#pkt=...`). */
export function toBase64Url(text: string): string {
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(text)))
      : Buffer.from(text, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of {@link toBase64Url}. Throws on malformed input — callers should catch and fall back. */
export function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return typeof atob === "function"
    ? decodeURIComponent(
        atob(padded)
          .split("")
          .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("")
      )
    : Buffer.from(padded, "base64").toString("utf-8");
}

/**
 * True when `value` is plausibly the base64url payload of a claim link
 * (non-trivial length, base64url charset) even if it fails to decode or
 * parse — used to distinguish "this link was truncated in transit" from
 * "this isn't a claim link at all" when a `#pkt=` fragment doesn't resolve
 * to a valid packet.
 */
export function looksLikeClaimLinkFragment(value: string): boolean {
  return value.length > 8 && BASE64URL_RE.test(value);
}

/** Build a shareable claim-link URL (origin + `/claim#pkt=<base64url packet>`) for one recipient's packet. */
export function buildClaimLink(origin: string, packet: ClaimPacket): string {
  return `${origin}/claim#pkt=${toBase64Url(JSON.stringify(packet))}`;
}
