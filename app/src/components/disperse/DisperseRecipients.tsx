"use client";

import { useRef, useState } from "react";
import {
  newRecipientEntry,
  parseRecipientsCsv,
  type RecipientEntry,
  type ValidatedRecipients,
} from "@/lib/csv";

interface DisperseRecipientsProps {
  entries: RecipientEntry[];
  onChange: (entries: RecipientEntry[]) => void;
  validated: ValidatedRecipients;
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

/**
 * Recipient entry for the one-shot disperse flow — CSV upload, paste, and
 * manual add/remove rows, all feeding the same shared list. Mirrors the
 * pattern used by `src/components/create/RecipientsStep.tsx` but is its own
 * component since disperse has no multi-step wizard.
 */
export function DisperseRecipients({ entries, onChange, validated }: DisperseRecipientsProps) {
  const [pasteText, setPasteText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function appendRows(rows: { address: string; amount: string }[], errors: string[]) {
    if (rows.length > 0) {
      onChange([...entries, ...rows.map((r) => ({ ...newRecipientEntry(), address: r.address, amount: r.amount }))]);
    }
    setImportErrors(errors);
  }

  function handleParsedInput(text: string) {
    const result = parseRecipientsCsv(text);
    const errs = [
      ...result.errors.map((e) => `Line ${e.line}: ${e.message}`),
      ...result.duplicates.map((d) => `Duplicate skipped: ${d}`),
    ];
    appendRows(result.rows, errs);
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <label className="label">CSV upload</label>
            <a href="/recipients-template.csv" download className="link-gold text-xs">
              Download CSV template
            </a>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-[3px] file:border-0 file:bg-[var(--seal)] file:px-3 file:py-1.5 file:font-data file:text-xs file:uppercase file:tracking-wide file:text-[var(--paper)] hover:file:bg-[var(--seal-bright)]"
            style={{ color: "var(--text-dim)" }}
          />
        </div>

        <div className="panel p-4">
          <label className="label">Paste rows</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"0xabc...,10\n0xdef...,25.5"}
            rows={3}
            className="field font-data mt-2"
          />
          <button
            type="button"
            onClick={() => {
              handleParsedInput(pasteText);
              setPasteText("");
            }}
            disabled={!pasteText.trim()}
            className="btn btn-seal mt-2"
          >
            Add pasted rows
          </button>
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
          <h3 className="eyebrow">Recipients ({entries.length})</h3>
          <button type="button" onClick={addManualRow} className="btn btn-ghost text-xs">
            + Add recipient
          </button>
        </div>

        {entries.length === 0 && (
          <p className="mt-3 rounded-[var(--r-md)] border px-3 py-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--text-faint)" }}>
            No recipients yet. Upload a CSV, paste rows, or add one manually.
          </p>
        )}

        {/* mobile: card-per-row */}
        {entries.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 sm:hidden">
            {entries.map((entry) => {
              const error = validated.errorsById[entry.id];
              return (
                <div key={entry.id} className="panel p-3">
                  <label className="label">Address</label>
                  <input
                    value={entry.address}
                    onChange={(e) => updateEntry(entry.id, { address: e.target.value })}
                    placeholder="0x..."
                    className="field font-data mt-1 text-xs"
                  />
                  <div className="mt-2 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="label">Amount</label>
                      <input
                        value={entry.amount}
                        onChange={(e) => updateEntry(entry.id, { amount: e.target.value })}
                        placeholder="0.0"
                        className="field tabular mt-1"
                      />
                    </div>
                    <RemoveRecipientButton onClick={() => removeEntry(entry.id)} />
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
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const error = validated.errorsById[entry.id];
                  return (
                    <tr key={entry.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                      <td className="px-3 py-1.5">
                        <input
                          value={entry.address}
                          onChange={(e) => updateEntry(entry.id, { address: e.target.value })}
                          placeholder="0x..."
                          className="font-data w-full rounded border border-transparent bg-transparent px-2 py-1 text-xs focus:outline-none"
                          style={{ color: "var(--text)" }}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={entry.amount}
                          onChange={(e) => updateEntry(entry.id, { amount: e.target.value })}
                          placeholder="0.0"
                          className="tabular w-28 rounded border border-transparent bg-transparent px-2 py-1 focus:outline-none"
                          style={{ color: "var(--text)" }}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <RemoveRecipientButton onClick={() => removeEntry(entry.id)} />
                      </td>
                      {error && (
                        <td className="hidden" aria-hidden>
                          {error}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {entries.some((e) => validated.errorsById[e.id]) && (
          <ul className="mt-2 space-y-0.5 text-xs" style={{ color: "var(--err)" }}>
            {entries.map((e) =>
              validated.errorsById[e.id] ? (
                <li key={e.id}>
                  Row {e.address || "(blank)"}: {validated.errorsById[e.id]}
                </li>
              ) : null
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
