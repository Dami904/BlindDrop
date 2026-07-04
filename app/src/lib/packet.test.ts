import { describe, expect, it } from "vitest";
import {
  isClaimPacket,
  parsePacketText,
  isSameAddress,
  isSepoliaChainId,
  SEPOLIA_CHAIN_ID,
  toBase64Url,
  fromBase64Url,
  looksLikeClaimLinkFragment,
  buildClaimLink,
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

describe("parsePacketText — multi-packet (download-all) inputs", () => {
  const otherRecipient = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const otherPacket: ClaimPacket = { ...validPacket(), recipient: otherRecipient };

  it("selects the connected wallet's packet from a bare array", () => {
    const raw = JSON.stringify([otherPacket, validPacket()]);
    const result = parsePacketText(raw, RECIPIENT.toLowerCase());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.packet.recipient).toBe(RECIPIENT);
  });

  it("accepts a single-element array without a wallet", () => {
    const result = parsePacketText(JSON.stringify([validPacket()]));
    expect(result.ok).toBe(true);
  });

  it("accepts { address, packet } wrapper entries", () => {
    const raw = JSON.stringify([
      { address: otherRecipient, packet: otherPacket },
      { address: RECIPIENT, packet: validPacket() },
    ]);
    const result = parsePacketText(raw, RECIPIENT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.packet.recipient).toBe(RECIPIENT);
  });

  it("asks for a wallet when multiple packets and none provided", () => {
    const result = parsePacketText(JSON.stringify([otherPacket, validPacket()]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("multiple-packets-need-wallet");
    }
  });

  it("reports when no packet matches the connected wallet", () => {
    const stranger = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
    const result = parsePacketText(JSON.stringify([otherPacket, validPacket()]), stranger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-packet-for-wallet");
      if (result.error.kind === "no-packet-for-wallet") {
        expect(result.error.packetCount).toBe(2);
      }
    }
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

describe("base64url helpers", () => {
  it("round-trips arbitrary JSON text, including chars that need + / = in standard base64", () => {
    const text = JSON.stringify(validPacket());
    const encoded = toBase64Url(text);
    expect(fromBase64Url(encoded)).toBe(text);
  });

  it("round-trips text likely to produce + and / in standard base64", () => {
    // Binary-ish content chosen to exercise both substitution chars.
    const text = "ûÿ".repeat(20) + JSON.stringify({ a: 1, b: "??>>++//" });
    const encoded = toBase64Url(text);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromBase64Url(encoded)).toBe(text);
  });

  it("never contains +, /, or = padding", () => {
    const encoded = toBase64Url(JSON.stringify(validPacket()));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("throws when decoding garbage that isn't valid base64", () => {
    expect(() => fromBase64Url("not valid base64!! @@")).toThrow();
  });

  it("builds a claim link containing the origin and encoded packet", () => {
    const packet = validPacket();
    const link = buildClaimLink("https://example.com", packet);
    expect(link.startsWith("https://example.com/claim#pkt=")).toBe(true);
    const encoded = link.split("#pkt=")[1];
    expect(JSON.parse(fromBase64Url(encoded))).toEqual(packet);
  });
});

describe("looksLikeClaimLinkFragment", () => {
  it("accepts a plausible base64url fragment", () => {
    const encoded = toBase64Url(JSON.stringify(validPacket()));
    expect(looksLikeClaimLinkFragment(encoded)).toBe(true);
  });

  it("detects a truncated fragment as still plausible base64url", () => {
    const encoded = toBase64Url(JSON.stringify(validPacket()));
    const truncated = encoded.slice(0, Math.floor(encoded.length / 2));
    expect(looksLikeClaimLinkFragment(truncated)).toBe(true);
    // Truncation typically breaks JSON parsing even when decode succeeds.
    expect(() => JSON.parse(fromBase64Url(truncated))).toThrow();
  });

  it("rejects short or non-base64url-charset strings", () => {
    expect(looksLikeClaimLinkFragment("abc")).toBe(false);
    expect(looksLikeClaimLinkFragment("not a fragment!! with spaces")).toBe(false);
    expect(looksLikeClaimLinkFragment("")).toBe(false);
  });
});
