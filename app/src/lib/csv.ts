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
  /** Optional delivery email, from a header column or a loosely-matched third positional column. */
  email?: string;
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

// Header-row aliases (case-insensitive) recognized for each column. When the
// first line matches at least an address alias and an amount alias, columns
// are mapped by name (supporting any order); otherwise columns are read
// positionally as before.
const ADDRESS_HEADER_ALIASES = new Set(["address", "wallet", "wallet_address", "recipient"]);
const AMOUNT_HEADER_ALIASES = new Set(["amount", "value", "tokens", "usdc_amount", "allocation"]);
const EMAIL_HEADER_ALIASES = new Set(["email", "mail", "e-mail"]);

/** Loose email check — good enough to distinguish an email column from other data, not full RFC validation. */
const LOOSE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface HeaderMap {
  addressIdx: number;
  amountIdx: number;
  emailIdx?: number;
}

/** Detects a recognized header row and returns the column mapping, or undefined if `parts` isn't a header. */
function detectHeaderMap(parts: string[]): HeaderMap | undefined {
  let addressIdx = -1;
  let amountIdx = -1;
  let emailIdx: number | undefined;
  parts.forEach((raw, idx) => {
    const key = raw.trim().toLowerCase();
    if (ADDRESS_HEADER_ALIASES.has(key)) addressIdx = idx;
    else if (AMOUNT_HEADER_ALIASES.has(key)) amountIdx = idx;
    else if (EMAIL_HEADER_ALIASES.has(key)) emailIdx = idx;
  });
  if (addressIdx === -1 || amountIdx === -1) return undefined;
  return { addressIdx, amountIdx, emailIdx };
}

/**
 * Parse raw CSV/paste text into validated recipient rows.
 *
 * Accepted line formats: `address,amount` or `address amount` or
 * `address\tamount`, optionally followed by a third email column. A leading
 * header row is recognized via case-insensitive aliases (address|wallet|
 * wallet_address|recipient, amount|value|tokens|usdc_amount|allocation,
 * email|mail|e-mail) in any column order; without a recognized header,
 * columns are read positionally (address, amount, then a loosely-matched
 * email). Later duplicate addresses are dropped (first occurrence wins) and
 * reported in `duplicates`.
 */
export function parseRecipientsCsv(raw: string): ParseRecipientsResult {
  const lines = raw.split(/\r\n|\r|\n/);
  const rows: RecipientRow[] = [];
  const errors: RecipientRowError[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  let headerMap: HeaderMap | undefined;

  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) return; // skip blank lines
    if (trimmed.startsWith("#")) return; // allow comments

    const parts = trimmed.split(/[,\s\t]+/).filter(Boolean);

    // Recognize an optional header row (first line only).
    if (line === 1) {
      const map = detectHeaderMap(parts);
      if (map) {
        headerMap = map;
        return;
      }
    }

    let addressRaw: string | undefined;
    let amountRaw: string | undefined;
    let emailRaw: string | undefined;

    if (headerMap) {
      // Only the address and amount columns are required — the email column,
      // even when declared in the header, may be empty on any given row.
      const requiredIdx = Math.max(headerMap.addressIdx, headerMap.amountIdx);
      if (parts.length <= requiredIdx) {
        errors.push({ line, raw: rawLine, message: "Expected `address,amount`" });
        return;
      }
      addressRaw = parts[headerMap.addressIdx];
      amountRaw = parts[headerMap.amountIdx];
      emailRaw = headerMap.emailIdx !== undefined ? parts[headerMap.emailIdx] : undefined;
    } else {
      if (parts.length < 2) {
        errors.push({ line, raw: rawLine, message: "Expected `address,amount`" });
        return;
      }
      [addressRaw, amountRaw] = parts;
      // Positional third column — only treated as email when it looks like one.
      emailRaw = parts[2] && LOOSE_EMAIL_RE.test(parts[2]) ? parts[2] : undefined;
    }

    if (!isAddress(addressRaw)) {
      errors.push({ line, raw: rawLine, message: `Invalid address: ${addressRaw}` });
      return;
    }

    const amountError = describeAmountError(amountRaw);
    if (amountError) {
      errors.push({ line, raw: rawLine, message: amountError });
      return;
    }

    const checksummed = getAddress(addressRaw);
    const key = checksummed.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(checksummed);
      return;
    }
    seen.add(key);

    rows.push({ line, address: checksummed, amount: amountRaw, email: emailRaw });
  });

  return { rows, errors, duplicates };
}

/** ERC-7984 confidential tokens use 6 decimals — amounts may not be more precise. */
export const MAX_AMOUNT_DECIMALS = 6;

/** True when `value` is a finite, positive decimal number (e.g. "1", "0.5", "12.345678"). */
export function isValidPositiveAmount(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * Returns an error message when `value` is not a usable token amount, or
 * undefined when it is. Rejects precision beyond {@link MAX_AMOUNT_DECIMALS}
 * outright — silently truncating extra digits would under-credit a recipient.
 */
export function describeAmountError(value: string): string | undefined {
  if (!isValidPositiveAmount(value)) return `Invalid amount: ${value || "(empty)"}`;
  const frac = value.split(".")[1] ?? "";
  if (frac.length > MAX_AMOUNT_DECIMALS) {
    return `Too precise: ${value} — amounts support at most ${MAX_AMOUNT_DECIMALS} decimal places`;
  }
  return undefined;
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
  /** Optional delivery email, typed manually in the entry table. */
  email?: string;
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
    const amountError = describeAmountError(amount);
    if (amountError) {
      errorsById[entry.id] = amountError;
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
    const email = entry.email?.trim();
    valid.push({ line: idx + 1, address: checksummed, amount, email: email || undefined });
  });

  return { valid, errorsById, duplicateIds };
}

/** Build a fresh blank {@link RecipientEntry} row for the manual-entry table. */
export function newRecipientEntry(): RecipientEntry {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    address: "",
    amount: "",
    email: "",
  };
}

/**
 * Scale a human decimal amount string to raw uint64 token units at
 * `decimals` (ERC-7984 confidential tokens use 6 decimals).
 */
export function scaleAmountToUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) {
    // Never silently truncate — dropping digits would under-credit the recipient.
    throw new RangeError(
      `Amount ${amount} has more than ${decimals} decimal places; validate with describeAmountError first`
    );
  }
  const fracPadded = frac.padEnd(decimals, "0");
  const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return BigInt(combined || "0");
}
