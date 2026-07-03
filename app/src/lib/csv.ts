/**
 * Pure, framework-free helpers for parsing and validating recipient lists
 * pasted or uploaded as CSV (`address,amount` per line) on the "Create
 * Distribution" admin flow.
 *
 * Kept dependency-free so it is trivially unit-testable.
 */

import { isAddress, getAddress } from "viem";

export interface RecipientRow {
  /** 1-indexed line number in the original input, for error display. */
  line: number;
  address: `0x${string}`;
  /** Human-entered decimal amount, e.g. "12.5". */
  amount: string;
}

export interface RecipientRowError {
  line: number;
  raw: string;
  message: string;
}

export interface ParseRecipientsResult {
  rows: RecipientRow[];
  errors: RecipientRowError[];
  /** Addresses that appeared more than once (deduped away, first occurrence kept). */
  duplicates: string[];
}

/**
 * Parse raw CSV/paste text into validated recipient rows.
 *
 * Accepted line formats: `address,amount` or `address amount` or
 * `address\tamount`. Blank lines and a leading header row (e.g.
 * "address,amount") are skipped. Later duplicate addresses are dropped
 * (first occurrence wins) and reported in `duplicates`.
 */
export function parseRecipientsCsv(raw: string): ParseRecipientsResult {
  const lines = raw.split(/\r\n|\r|\n/);
  const rows: RecipientRow[] = [];
  const errors: RecipientRowError[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) return; // skip blank lines
    if (trimmed.startsWith("#")) return; // allow comments

    const parts = trimmed.split(/[,\s\t]+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push({ line, raw: rawLine, message: "Expected `address,amount`" });
      return;
    }
    const [addressRaw, amountRaw] = parts;

    // Skip an optional header row.
    if (line === 1 && /^address$/i.test(addressRaw) && /^amount$/i.test(amountRaw)) {
      return;
    }

    if (!isAddress(addressRaw)) {
      errors.push({ line, raw: rawLine, message: `Invalid address: ${addressRaw}` });
      return;
    }

    if (!isValidPositiveAmount(amountRaw)) {
      errors.push({ line, raw: rawLine, message: `Invalid amount: ${amountRaw}` });
      return;
    }

    const checksummed = getAddress(addressRaw);
    const key = checksummed.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(checksummed);
      return;
    }
    seen.add(key);

    rows.push({ line, address: checksummed, amount: amountRaw });
  });

  return { rows, errors, duplicates };
}

/** True when `value` is a finite, positive decimal number (e.g. "1", "0.5", "12.345678"). */
export function isValidPositiveAmount(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * A single editable recipient row shown in the "manual entry" table. Raw,
 * unvalidated user input — validated on every change via
 * {@link validateRecipientEntries}.
 */
export interface RecipientEntry {
  id: string;
  address: string;
  amount: string;
}

export interface ValidatedRecipients {
  /** Validated, deduped rows ready for encryption/signing — in entry order, first-wins on dupes. */
  valid: RecipientRow[];
  /** Per-entry-id error message, for entries that failed address/amount validation. */
  errorsById: Record<string, string>;
  /** Ids of entries dropped as duplicates of an earlier valid address. */
  duplicateIds: string[];
}

/**
 * Validate a list of raw {@link RecipientEntry} rows — the shared validation
 * path for CSV upload, paste, and manual table entry. Empty rows (no address
 * and no amount typed yet) are silently skipped rather than flagged as
 * errors, since the manual-entry table always has a blank trailing row.
 */
export function validateRecipientEntries(entries: RecipientEntry[]): ValidatedRecipients {
  const valid: RecipientRow[] = [];
  const errorsById: Record<string, string> = {};
  const duplicateIds: string[] = [];
  const seen = new Set<string>();

  entries.forEach((entry, idx) => {
    const address = entry.address.trim();
    const amount = entry.amount.trim();

    if (!address && !amount) return; // blank row — ignore

    if (!isAddress(address)) {
      errorsById[entry.id] = `Invalid address: ${address || "(empty)"}`;
      return;
    }
    if (!isValidPositiveAmount(amount)) {
      errorsById[entry.id] = `Invalid amount: ${amount || "(empty)"}`;
      return;
    }

    const checksummed = getAddress(address);
    const key = checksummed.toLowerCase();
    if (seen.has(key)) {
      duplicateIds.push(entry.id);
      errorsById[entry.id] = `Duplicate address: ${checksummed}`;
      return;
    }
    seen.add(key);
    valid.push({ line: idx + 1, address: checksummed, amount });
  });

  return { valid, errorsById, duplicateIds };
}

/** Build a fresh blank {@link RecipientEntry} row for the manual-entry table. */
export function newRecipientEntry(): RecipientEntry {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    address: "",
    amount: "",
  };
}

/**
 * Scale a human decimal amount string to raw uint64 token units at
 * `decimals` (ERC-7984 confidential tokens use 6 decimals).
 */
export function scaleAmountToUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return BigInt(combined || "0");
}
