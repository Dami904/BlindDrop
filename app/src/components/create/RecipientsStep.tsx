"use client";

import { useMemo, useRef, useState } from "react";
import {
  newRecipientEntry,
  parseRecipientsCsv,
  validateRecipientEntries,
  type RecipientEntry,
} from "@/lib/csv";

interface RecipientsStepProps {
  entries: RecipientEntry[];
  onChange: (entries: RecipientEntry[]) => void;
  onNext: () => void;
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

  const validated = useMemo(() => validateRecipientEntries(entries), [entries]);

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
                    <button type="button" onClick={() => removeEntry(entry.id)} className="btn btn-ghost text-xs">
                      Remove
                    </button>
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
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                          className="text-xs hover:opacity-100"
                          style={{ color: "var(--text-faint)" }}
                        >
                          Remove
                        </button>
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

      <div className="divider-stamped flex items-center justify-between pt-4">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          <span className="tabular font-medium" style={{ color: "var(--text)" }}>
            {validated.valid.length}
          </span>{" "}
          valid recipient{validated.valid.length === 1 ? "" : "s"} ready
        </p>
        <button type="button" onClick={onNext} disabled={!canProceed} className="btn btn-seal">
          Continue to campaign →
        </button>
      </div>
    </div>
  );
}
