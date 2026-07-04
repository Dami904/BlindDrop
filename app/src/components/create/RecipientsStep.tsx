"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  newRecipientEntry,
  parseRecipientsCsv,
  scaleAmountToUnits,
  validateRecipientEntries,
  type RecipientEntry,
  type RecipientRowError,
} from "@/lib/csv";
import { formatConfidentialAmount } from "@/lib/confidential";

const CONFIDENTIAL_DECIMALS = 6;

/** localStorage key for the pre-deploy recipient draft. Never used for anything
 * post-deploy — deployed campaign state, packets, and signatures are authorizations
 * and must never touch storage. Exported so the page-level wizard can also restore
 * it when jumping straight to step 3 (see src/app/create/page.tsx). */
export const RECIPIENTS_DRAFT_KEY = "blinddrop:create-draft:v1";

interface RecipientsStepProps {
  entries: RecipientEntry[];
  onChange: (entries: RecipientEntry[]) => void;
  onNext: () => void;
}

function hasEntryContent(entries: RecipientEntry[]): boolean {
  return entries.some((e) => e.address.trim() || e.amount.trim());
}

/** Best-effort split of a raw CSV/paste line into address/amount, even when
 * the line failed validation — used to seed an editable ledger row so the
 * visitor can fix the mistake in place instead of re-uploading the file. */
function splitRawLine(raw: string): { address: string; amount: string } {
  const parts = raw.trim().split(/[,\s\t]+/).filter(Boolean);
  return { address: parts[0] ?? "", amount: parts[1] ?? "" };
}

/** Determines which field an entry's error message refers to, so the offending
 * input (not just a generic row) gets the err-colored border. */
function errorField(message: string | undefined): "address" | "amount" | undefined {
  if (!message) return undefined;
  if (/address/i.test(message)) return "address";
  if (/amount|precise/i.test(message)) return "amount";
  return undefined;
}

/** Compact × icon button for removing a recipient row — ghost by default, err-colored on hover/focus. */
function RemoveRecipientButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Remove recipient" className="icon-btn">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function LockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <rect x="3" y="6.5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 6.5V4.5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Sealed-envelope glyph for the empty ledger — reuses the envelope + wax-seal
 * motif rather than an image, kept quiet (text-faint) since it marks an
 * absence, not an action. */
function EmptyLedgerGlyph() {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" fill="none" aria-hidden>
      <rect x="1" y="1" width="28" height="20" rx="2" stroke="var(--text-faint)" strokeWidth="1.3" />
      <path d="M2 2.5 15 13.5 28 2.5" stroke="var(--text-faint)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="15" cy="14" r="2.4" fill="var(--text-faint)" opacity="0.5" />
    </svg>
  );
}

/** Inline privacy note shown at the point of input — a lock glyph plus one
 * line, styled as an eyebrow rather than a boxed callout so it doesn't add
 * visual weight to the ledger header. */
function PrivacyNote() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.6875rem] tracking-wide"
      style={{ color: "var(--text-faint)" }}
    >
      <LockGlyph />
      This list stays in your browser until you seal it.
    </span>
  );
}

type EntryTab = "csv" | "paste" | "manual";

const TABS: { id: EntryTab; label: string }[] = [
  { id: "csv", label: "Upload CSV" },
  { id: "paste", label: "Paste rows" },
  { id: "manual", label: "Add manually" },
];

export function RecipientsStep({ entries, onChange, onNext }: RecipientsStepProps) {
  const [tab, setTab] = useState<EntryTab>("csv");
  const [pasteText, setPasteText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

  // Restore a saved draft on first mount — only when the ledger is still in
  // its pristine, freshly-loaded state (a single blank row) so we never
  // clobber content the visitor already typed this session.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (hasEntryContent(entries)) return;
    try {
      const raw = localStorage.getItem(RECIPIENTS_DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as RecipientEntry[];
      if (!Array.isArray(saved) || !hasEntryContent(saved)) return;
      onChange(saved);
    } catch {
      // corrupt/foreign draft — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft, debounced ~500ms. Pre-deploy recipient entries only —
  // never anything post-deploy (deployed campaign state, packets, signatures).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasEntryContent(entries)) {
        localStorage.setItem(RECIPIENTS_DRAFT_KEY, JSON.stringify(entries));
      } else {
        localStorage.removeItem(RECIPIENTS_DRAFT_KEY);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [entries]);

  function clearDraft() {
    localStorage.removeItem(RECIPIENTS_DRAFT_KEY);
    onChange([newRecipientEntry()]);
  }

  const validated = useMemo(() => validateRecipientEntries(entries), [entries]);
  const totalAmountUnits = useMemo(
    () => validated.valid.reduce((sum, r) => sum + scaleAmountToUnits(r.amount, CONFIDENTIAL_DECIMALS), BigInt(0)),
    [validated.valid]
  );

  function appendRows(rows: { address: string; amount: string; email?: string }[], errorRows: RecipientRowError[], duplicates: string[]) {
    const newEntries: RecipientEntry[] = [
      ...rows.map((r) => ({ ...newRecipientEntry(), address: r.address, amount: r.amount, email: r.email ?? "" })),
      // Failed rows become editable entries too, pre-filled with the raw
      // (invalid) values, so the visitor can fix them in place instead of
      // re-uploading the file.
      ...errorRows.map((e) => {
        const { address, amount } = splitRawLine(e.raw);
        return { ...newRecipientEntry(), address, amount };
      }),
    ];
    if (newEntries.length > 0) {
      onChange([...entries, ...newEntries]);
    }
    const errs = [
      ...errorRows.map((e) => `Line ${e.line}: ${e.message} — "${e.raw.trim()}"`),
      ...duplicates.map((d) => `Duplicate skipped: ${d}`),
    ];
    setImportErrors(errs);
  }

  function handleParsedInput(text: string) {
    const result = parseRecipientsCsv(text);
    appendRows(result.rows, result.errors, result.duplicates);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      handleParsedInput(String(reader.result ?? ""));
    };
    reader.readAsText(file);
  }

  function updateEntry(id: string, patch: Partial<RecipientEntry>) {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  function addManualRow() {
    onChange([...entries, newRecipientEntry()]);
  }

  const canProceed = validated.valid.length > 0 && Object.keys(validated.errorsById).length === 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="seal-badge" data-state="active">
            1
          </span>
          <h2 className="font-display text-lg">Recipients</h2>
        </div>
        <p className="mt-2 ml-10 text-sm" style={{ color: "var(--text-dim)" }}>
          Upload a CSV, paste rows, or add recipients manually below. Format:{" "}
          <code className="font-data" style={{ color: "var(--text)" }}>
            address,amount
          </code>{" "}
          per line. All entry modes feed the same ledger and can be freely mixed.
        </p>
      </div>

      <div>
        <div className="flex gap-1 border-b" style={{ borderColor: "var(--line)" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="relative px-4 py-2 font-data text-xs tracking-wide uppercase transition-colors"
              style={{ color: tab === t.id ? "var(--gold)" : "var(--text-dim)" }}
            >
              {t.label}
              {tab === t.id && (
                <span
                  className="absolute inset-x-2 -bottom-[1px] h-[2px]"
                  style={{ background: "var(--gold)" }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="panel mt-4 p-4">
          {tab === "csv" && (
            <div>
              <label className="label">CSV upload</label>
              <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                One recipient per line: <code className="font-data">0xabc...,10</code>{" "}
                <a href="/recipients-template.csv" download className="link-gold">
                  Download CSV template
                </a>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
                className="mt-3 block w-full text-sm file:mr-3 file:rounded-[3px] file:border-0 file:bg-[var(--seal)] file:px-3 file:py-1.5 file:font-data file:text-xs file:uppercase file:tracking-wide file:text-[var(--paper)] hover:file:bg-[var(--seal-bright)]"
                style={{ color: "var(--text-dim)" }}
              />
            </div>
          )}

          {tab === "paste" && (
            <div>
              <label className="label">Paste rows</label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"0xabc...,10\n0xdef...,25.5"}
                rows={4}
                className="field font-data mt-2"
              />
              <button
                type="button"
                onClick={() => {
                  handleParsedInput(pasteText);
                  setPasteText("");
                }}
                disabled={!pasteText.trim()}
                className="btn btn-seal mt-3"
              >
                Add pasted rows
              </button>
            </div>
          )}

          {tab === "manual" && (
            <div>
              <label className="label">Add one recipient at a time</label>
              <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
                Adds a blank row to the ledger below — fill in the address and amount there.
              </p>
              <button type="button" onClick={addManualRow} className="btn btn-seal mt-3">
                + Add recipient
              </button>
            </div>
          )}
        </div>
      </div>

      {importErrors.length > 0 && (
        <div className="callout callout-warn">
          <ul className="list-inside list-disc space-y-0.5">
            {importErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">The ledger ({entries.length})</h3>
          <button type="button" onClick={addManualRow} className="btn btn-ghost text-xs">
            + Add row
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <PrivacyNote />
          {hasEntryContent(entries) && (
            <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
              Draft saved locally
              <button type="button" onClick={clearDraft} className="link-gold">
                Clear draft
              </button>
            </span>
          )}
        </div>

        {entries.length === 0 && (
          <div
            className="mt-3 flex flex-col items-center gap-2 rounded-[var(--r-md)] border px-3 py-6 text-center text-sm"
            style={{ borderColor: "var(--line)", color: "var(--text-faint)" }}
          >
            <EmptyLedgerGlyph />
            <p>No recipients yet. Upload a CSV, paste rows, or add one manually.</p>
          </div>
        )}

        {/* mobile: card-per-row */}
        {entries.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 sm:hidden">
            {entries.map((entry) => {
              const error = validated.errorsById[entry.id];
              const badField = errorField(error);
              return (
                <div key={entry.id} className="panel p-3">
                  <label className="label">Address</label>
                  <input
                    value={entry.address}
                    onChange={(e) => updateEntry(entry.id, { address: e.target.value })}
                    placeholder="0x..."
                    className="field font-data mt-1 text-xs"
                    style={badField === "address" ? { borderColor: "var(--err)" } : undefined}
                  />
                  <div className="mt-2 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="label">Amount</label>
                      <input
                        value={entry.amount}
                        onChange={(e) => updateEntry(entry.id, { amount: e.target.value })}
                        placeholder="0.0"
                        className="field tabular mt-1"
                        style={badField === "amount" ? { borderColor: "var(--err)" } : undefined}
                      />
                    </div>
                    <RemoveRecipientButton onClick={() => removeEntry(entry.id)} />
                  </div>
                  <div className="mt-2">
                    <label className="label">Email (optional)</label>
                    <input
                      value={entry.email ?? ""}
                      onChange={(e) => updateEntry(entry.id, { email: e.target.value })}
                      placeholder="email (optional)"
                      className="field mt-1 text-xs"
                    />
                  </div>
                  {error && (
                    <p className="mt-1 text-xs" style={{ color: "var(--err)" }}>
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* desktop: table */}
        {entries.length > 0 && (
          <div className="mt-3 hidden overflow-x-auto rounded-[var(--r-md)] border sm:block" style={{ borderColor: "var(--line)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--ink-3)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-data text-xs uppercase tracking-wide font-normal" style={{ color: "var(--text-dim)" }}>
                    Address
                  </th>
                  <th className="px-3 py-2 text-left font-data text-xs uppercase tracking-wide font-normal" style={{ color: "var(--text-dim)" }}>
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left font-data text-xs uppercase tracking-wide font-normal" style={{ color: "var(--text-dim)" }}>
                    Email
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const error = validated.errorsById[entry.id];
                  const badField = errorField(error);
                  return (
                    <Fragment key={entry.id}>
                      <tr className="border-t" style={{ borderColor: "var(--line)" }}>
                        <td className="px-3 py-1.5">
                          <input
                            value={entry.address}
                            onChange={(e) => updateEntry(entry.id, { address: e.target.value })}
                            placeholder="0x..."
                            className="font-data w-full rounded border bg-transparent px-2 py-1 text-xs focus:outline-none"
                            style={{ color: "var(--text)", borderColor: badField === "address" ? "var(--err)" : "transparent" }}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={entry.amount}
                            onChange={(e) => updateEntry(entry.id, { amount: e.target.value })}
                            placeholder="0.0"
                            className="tabular w-28 rounded border bg-transparent px-2 py-1 focus:outline-none"
                            style={{ color: "var(--text)", borderColor: badField === "amount" ? "var(--err)" : "transparent" }}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={entry.email ?? ""}
                            onChange={(e) => updateEntry(entry.id, { email: e.target.value })}
                            placeholder="email (optional)"
                            className="w-full rounded border bg-transparent px-2 py-1 text-xs focus:outline-none"
                            style={{ color: "var(--text)", borderColor: "transparent" }}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <RemoveRecipientButton onClick={() => removeEntry(entry.id)} />
                        </td>
                      </tr>
                      {error && (
                        <tr style={{ borderColor: "var(--line)" }}>
                          <td colSpan={4} className="px-3 pt-0 pb-1.5 text-xs" style={{ color: "var(--err)" }}>
                            {error}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="divider-stamped flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          <span className="tabular font-medium" style={{ color: "var(--text)" }}>
            {validated.valid.length}
          </span>{" "}
          valid recipient{validated.valid.length === 1 ? "" : "s"} ready
          {validated.valid.length > 0 && (
            <>
              {" · Total to distribute: "}
              <span className="font-data tabular" style={{ color: "var(--text)" }}>
                {formatConfidentialAmount(totalAmountUnits, CONFIDENTIAL_DECIMALS)}
              </span>
              {" (token chosen next step)"}
            </>
          )}
        </p>
        <button type="button" onClick={onNext} disabled={!canProceed} className="btn btn-seal">
          Continue to campaign →
        </button>
      </div>
    </div>
  );
}
