import { describe, expect, it } from "vitest";
import {
  parseRecipientsCsv,
  isValidPositiveAmount,
  describeAmountError,
  validateRecipientEntries,
  scaleAmountToUnits,
  type RecipientEntry,
} from "./csv";

// Well-known, correctly-checksummed test addresses (Hardhat's default
// deterministic accounts).
const ADDR_1 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ADDR_2 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ADDR_3 = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

describe("parseRecipientsCsv", () => {
  it("parses valid rows", () => {
    const raw = `${ADDR_1},1.5\n${ADDR_2},2`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.rows).toEqual([
      { line: 1, address: ADDR_1, amount: "1.5" },
      { line: 2, address: ADDR_2, amount: "2" },
    ]);
  });

  it("accepts space- and tab-separated rows too", () => {
    const raw = `${ADDR_1} 1.5\n${ADDR_2}\t2`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
  });

  it("skips a leading header row", () => {
    const raw = `address,amount\n${ADDR_1},1`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 2, address: ADDR_1, amount: "1" }]);
  });

  it("does not treat 'address,amount' as a header unless it's the first line", () => {
    const raw = `${ADDR_1},1\naddress,amount`;
    const result = parseRecipientsCsv(raw);
    // Second occurrence is line 2, not line 1, so it's parsed as data and
    // fails address validation instead of being silently skipped.
    expect(result.rows).toEqual([{ line: 1, address: ADDR_1, amount: "1" }]);
    expect(result.errors).toEqual([{ line: 2, raw: "address,amount", message: "Invalid address: address" }]);
  });

  it("skips blank lines and comment lines", () => {
    const raw = `\n  \n# a comment\n${ADDR_1},1\n\n`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 4, address: ADDR_1, amount: "1" }]);
  });

  it("trims whitespace around fields", () => {
    const raw = `   ${ADDR_1} ,  1.5   `;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 1, address: ADDR_1, amount: "1.5" }]);
  });

  it("rejects an invalid address with row context", () => {
    const raw = `not-an-address,1`;
    const result = parseRecipientsCsv(raw);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { line: 1, raw: "not-an-address,1", message: "Invalid address: not-an-address" },
    ]);
  });

  it("rejects a non-positive or non-numeric amount", () => {
    const raw = `${ADDR_1},0\n${ADDR_2},-1\n${ADDR_3},abc`;
    const result = parseRecipientsCsv(raw);
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].message).toBe("Invalid amount: 0");
    expect(result.errors[1].message).toBe("Invalid amount: -1");
    expect(result.errors[2].message).toBe("Invalid amount: abc");
  });

  it("rejects a line with too few fields", () => {
    const raw = `${ADDR_1}`;
    const result = parseRecipientsCsv(raw);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { line: 1, raw: ADDR_1, message: "Expected `address,amount`" },
    ]);
  });

  it("dedupes duplicate addresses, keeping the first occurrence", () => {
    const raw = `${ADDR_1},1\n${ADDR_1.toLowerCase()},2\n${ADDR_2},3`;
    const result = parseRecipientsCsv(raw);
    expect(result.rows).toEqual([
      { line: 1, address: ADDR_1, amount: "1" },
      { line: 3, address: ADDR_2, amount: "3" },
    ]);
    expect(result.duplicates).toEqual([ADDR_1]);
    expect(result.errors).toEqual([]);
  });

  it("accepts aliased header names (wallet/value)", () => {
    const raw = `wallet,value\n${ADDR_1},1.5`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 2, address: ADDR_1, amount: "1.5", email: undefined }]);
  });

  it("accepts aliased header names case-insensitively (Wallet_Address/USDC_Amount)", () => {
    const raw = `Wallet_Address,USDC_Amount\n${ADDR_1},2`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 2, address: ADDR_1, amount: "2", email: undefined }]);
  });

  it("maps columns by name when header order is swapped", () => {
    const raw = `amount,address\n1.5,${ADDR_1}`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 2, address: ADDR_1, amount: "1.5", email: undefined }]);
  });

  it("leaves headerless positional parsing unchanged", () => {
    const raw = `${ADDR_1},1.5\n${ADDR_2},2`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { line: 1, address: ADDR_1, amount: "1.5" },
      { line: 2, address: ADDR_2, amount: "2" },
    ]);
  });

  it("parses an optional email column via header (recipient/allocation/email)", () => {
    const raw = `recipient,allocation,email\n${ADDR_1},1,alice@example.com`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 2, address: ADDR_1, amount: "1", email: "alice@example.com" }]);
  });

  it("parses an optional email column positionally when it looks like an email", () => {
    const raw = `${ADDR_1},1,alice@example.com`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 1, address: ADDR_1, amount: "1", email: "alice@example.com" }]);
  });

  it("ignores a positional third column that doesn't look like an email", () => {
    const raw = `${ADDR_1},1,notanemail`;
    const result = parseRecipientsCsv(raw);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ line: 1, address: ADDR_1, amount: "1", email: undefined }]);
  });
});

describe("isValidPositiveAmount", () => {
  it("accepts positive integers and decimals", () => {
    expect(isValidPositiveAmount("1")).toBe(true);
    expect(isValidPositiveAmount("0.5")).toBe(true);
    expect(isValidPositiveAmount("12.345678")).toBe(true);
  });

  it("rejects zero, negative, and non-numeric values", () => {
    expect(isValidPositiveAmount("0")).toBe(false);
    expect(isValidPositiveAmount("0.0")).toBe(false);
    expect(isValidPositiveAmount("-1")).toBe(false);
    expect(isValidPositiveAmount("abc")).toBe(false);
    expect(isValidPositiveAmount("")).toBe(false);
    expect(isValidPositiveAmount("1,5")).toBe(false);
    expect(isValidPositiveAmount("1.")).toBe(false);
    expect(isValidPositiveAmount(".5")).toBe(false);
  });
});

describe("validateRecipientEntries", () => {
  function entry(id: string, address: string, amount: string): RecipientEntry {
    return { id, address, amount };
  }

  it("validates well-formed entries", () => {
    const result = validateRecipientEntries([
      entry("a", ADDR_1, "1.5"),
      entry("b", ADDR_2, "2"),
    ]);
    expect(result.valid).toEqual([
      { line: 1, address: ADDR_1, amount: "1.5" },
      { line: 2, address: ADDR_2, amount: "2" },
    ]);
    expect(result.errorsById).toEqual({});
    expect(result.duplicateIds).toEqual([]);
  });

  it("silently skips fully blank rows", () => {
    const result = validateRecipientEntries([entry("a", "", ""), entry("b", ADDR_1, "1")]);
    expect(result.valid).toEqual([{ line: 2, address: ADDR_1, amount: "1" }]);
    expect(result.errorsById).toEqual({});
  });

  it("flags an invalid address by entry id", () => {
    const result = validateRecipientEntries([entry("a", "not-an-address", "1")]);
    expect(result.errorsById.a).toBe("Invalid address: not-an-address");
    expect(result.valid).toEqual([]);
  });

  it("flags an invalid amount by entry id", () => {
    const result = validateRecipientEntries([entry("a", ADDR_1, "0")]);
    expect(result.errorsById.a).toBe("Invalid amount: 0");
  });

  it("flags a partially-filled row (address only) as an amount error", () => {
    const result = validateRecipientEntries([entry("a", ADDR_1, "")]);
    expect(result.errorsById.a).toBe("Invalid amount: (empty)");
  });

  it("flags duplicates and records duplicateIds, keeping the first valid entry", () => {
    const result = validateRecipientEntries([
      entry("a", ADDR_1, "1"),
      entry("b", ADDR_1.toLowerCase(), "2"),
    ]);
    expect(result.valid).toEqual([{ line: 1, address: ADDR_1, amount: "1" }]);
    expect(result.duplicateIds).toEqual(["b"]);
    expect(result.errorsById.b).toBe(`Duplicate address: ${ADDR_1}`);
  });

  it("carries an optional email through to the validated row", () => {
    const result = validateRecipientEntries([
      { id: "a", address: ADDR_1, amount: "1", email: " alice@example.com " },
    ]);
    expect(result.valid).toEqual([{ line: 1, address: ADDR_1, amount: "1", email: "alice@example.com" }]);
  });

  it("leaves email undefined when not provided", () => {
    const result = validateRecipientEntries([entry("a", ADDR_1, "1")]);
    expect(result.valid).toEqual([{ line: 1, address: ADDR_1, amount: "1", email: undefined }]);
  });
});

describe("scaleAmountToUnits", () => {
  it("scales a decimal amount to 6-decimal raw units", () => {
    expect(scaleAmountToUnits("1.5", 6)).toBe(BigInt(1500000));
    expect(scaleAmountToUnits("1", 6)).toBe(BigInt(1000000));
    expect(scaleAmountToUnits("0.000001", 6)).toBe(BigInt(1));
    expect(scaleAmountToUnits("0", 6)).toBe(BigInt(0));
  });

  it("pads fractional amounts shorter than the decimal precision", () => {
    expect(scaleAmountToUnits("1.5000", 6)).toBe(BigInt(1500000));
    expect(scaleAmountToUnits("2.1", 6)).toBe(BigInt(2100000));
  });

  // Over-precise amounts must never be silently truncated — dropping digits
  // would quietly under-credit a recipient. Validation rejects them first
  // (describeAmountError) and scaling throws as defense in depth.
  it("throws on amounts with more fractional digits than `decimals`", () => {
    expect(() => scaleAmountToUnits("1.5555555", 6)).toThrow(RangeError);
    expect(() => scaleAmountToUnits("0.9999999", 6)).toThrow(RangeError);
  });
});

describe("describeAmountError", () => {
  it("accepts amounts at or under the decimal cap", () => {
    expect(describeAmountError("1")).toBeUndefined();
    expect(describeAmountError("0.5")).toBeUndefined();
    expect(describeAmountError("12.345678")).toBeUndefined();
  });

  it("rejects over-precise amounts with a specific message", () => {
    expect(describeAmountError("1.5555555")).toMatch(/at most 6 decimal places/);
  });

  it("rejects invalid or non-positive amounts", () => {
    expect(describeAmountError("")).toMatch(/Invalid amount/);
    expect(describeAmountError("0")).toMatch(/Invalid amount/);
    expect(describeAmountError("abc")).toMatch(/Invalid amount/);
    expect(describeAmountError("-1")).toMatch(/Invalid amount/);
  });
});
