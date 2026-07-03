import { describe, expect, it } from "vitest";
import {
  isClaimPacket,
  parsePacketText,
  isSameAddress,
  isSepoliaChainId,
  SEPOLIA_CHAIN_ID,
  type ClaimPacket,
} from "./packet";

// Well-known, correctly-checksummed test addresses (Hardhat's default
// deterministic accounts) so tests exercise real checksum-shaped input.
const AIRDROP = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TOKEN = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const RECIPIENT = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

function validPacket(): ClaimPacket {
  return {
    version: 1,
    airdrop: AIRDROP,
    chainId: SEPOLIA_CHAIN_ID,
    token: TOKEN,
    recipient: RECIPIENT,
    encryptedInput: {
      handle: "0xdeadbeef",
      inputProof: "0xcafebabe01",
    },
    signature: "0x1234567890abcdef",
  };
}

describe("isClaimPacket", () => {
  it("accepts a valid packet", () => {
    expect(isClaimPacket(validPacket())).toBe(true);
  });

  it("rejects null and non-object values", () => {
    expect(isClaimPacket(null)).toBe(false);
    expect(isClaimPacket(undefined)).toBe(false);
    expect(isClaimPacket("a string")).toBe(false);
    expect(isClaimPacket(42)).toBe(false);
    expect(isClaimPacket([])).toBe(false);
  });

  it("rejects a missing version", () => {
    const p = validPacket() as unknown as Record<string, unknown>;
    delete p.version;
    expect(isClaimPacket(p)).toBe(false);
  });

  it("rejects the wrong version number", () => {
    const p = { ...validPacket(), version: 2 } as unknown;
    expect(isClaimPacket(p)).toBe(false);
  });

  it("rejects bad addresses", () => {
    expect(isClaimPacket({ ...validPacket(), airdrop: "not-an-address" })).toBe(false);
    expect(isClaimPacket({ ...validPacket(), token: "0x123" })).toBe(false); // too short
    expect(
      isClaimPacket({ ...validPacket(), recipient: "0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" })
    ).toBe(false); // non-hex chars
  });

  it("rejects bad hex in signature/encryptedInput", () => {
    expect(isClaimPacket({ ...validPacket(), signature: "not-hex" })).toBe(false);
    expect(isClaimPacket({ ...validPacket(), signature: "0x" })).toBe(false); // needs >=1 hex digit
  });

  it("rejects missing encryptedInput fields", () => {
    const p = validPacket() as unknown as Record<string, unknown>;
    p.encryptedInput = { handle: "0xdeadbeef" }; // missing inputProof
    expect(isClaimPacket(p)).toBe(false);

    const p2 = validPacket() as unknown as Record<string, unknown>;
    p2.encryptedInput = null;
    expect(isClaimPacket(p2)).toBe(false);

    const p3 = validPacket() as unknown as Record<string, unknown>;
    delete p3.encryptedInput;
    expect(isClaimPacket(p3)).toBe(false);
  });

  it("rejects a non-integer chainId", () => {
    expect(isClaimPacket({ ...validPacket(), chainId: 1.5 })).toBe(false);
    expect(isClaimPacket({ ...validPacket(), chainId: "11155111" })).toBe(false);
  });
});

describe("parsePacketText", () => {
  it("parses a valid raw JSON packet", () => {
    const raw = JSON.stringify(validPacket());
    const result = parsePacketText(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.recipient).toBe(RECIPIENT);
    }
  });

  it("parses a valid base64-encoded JSON packet", () => {
    const raw = JSON.stringify(validPacket());
    const b64 = Buffer.from(raw, "utf-8").toString("base64");
    const result = parsePacketText(b64);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.packet.token).toBe(TOKEN);
    }
  });

  it("tolerates surrounding whitespace", () => {
    const raw = `\n\n   ${JSON.stringify(validPacket())}   \n`;
    const result = parsePacketText(raw);
    expect(result.ok).toBe(true);
  });

  it("returns empty-input for blank/whitespace-only text", () => {
    expect(parsePacketText("")).toEqual({ ok: false, error: { kind: "empty-input" } });
    expect(parsePacketText("   \n\t  ")).toEqual({ ok: false, error: { kind: "empty-input" } });
  });

  it("returns invalid-json for garbage input", () => {
    const result = parsePacketText("{not valid json!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-json");
    }
  });

  it("returns invalid-json for base64-looking garbage that isn't valid JSON either way", () => {
    const result = parsePacketText("not-json-not-base64-either!!!");
    expect(result.ok).toBe(false);
  });

  it("returns invalid-shape for valid JSON with the wrong shape", () => {
    const result = parsePacketText(JSON.stringify({ foo: "bar" }));
    expect(result).toEqual({ ok: false, error: { kind: "invalid-shape" } });
  });
});

describe("isSameAddress", () => {
  it("matches addresses case-insensitively", () => {
    expect(isSameAddress(RECIPIENT, RECIPIENT.toLowerCase())).toBe(true);
    expect(isSameAddress(RECIPIENT.toUpperCase(), RECIPIENT.toLowerCase())).toBe(true);
  });

  it("returns false for differing addresses", () => {
    expect(isSameAddress(AIRDROP, TOKEN)).toBe(false);
  });

  it("returns false when either side is null/undefined/empty", () => {
    expect(isSameAddress(null, RECIPIENT)).toBe(false);
    expect(isSameAddress(RECIPIENT, null)).toBe(false);
    expect(isSameAddress(undefined, undefined)).toBe(false);
    expect(isSameAddress("", RECIPIENT)).toBe(false);
  });
});

describe("isSepoliaChainId", () => {
  it("returns true only for the Sepolia chain id", () => {
    expect(isSepoliaChainId(SEPOLIA_CHAIN_ID)).toBe(true);
    expect(isSepoliaChainId(1)).toBe(false);
    expect(isSepoliaChainId(undefined)).toBe(false);
    expect(isSepoliaChainId(null)).toBe(false);
  });
});
