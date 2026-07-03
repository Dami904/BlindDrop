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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <label className="block text-sm font-medium text-zinc-200">CSV upload</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
            className="mt-2 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-black hover:file:bg-emerald-400"
          />
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <label className="block text-sm font-medium text-zinc-200">Paste rows</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"0xabc...,10\n0xdef...,25.5"}
            rows={3}
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              handleParsedInput(pasteText);
              setPasteText("");
            }}
            disabled={!pasteText.trim()}
            className="mt-2 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add pasted rows
          </button>
        </div>
      </div>

      {importErrors.length > 0 && (
        <div className="rounded-md border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-300">
          <ul className="list-inside list-disc space-y-0.5">
            {importErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-200">Recipients ({entries.length})</h3>
          <button
            type="button"
            onClick={addManualRow}
            className="rounded-md border border-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            + Add recipient
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/70 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-normal">Address</th>
                <th className="px-3 py-2 font-normal">Amount</th>
                <th className="px-3 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-zinc-500">
                    No recipients yet. Upload a CSV, paste rows, or add one manually.
                  </td>
                </tr>
              )}
              {entries.map((entry) => {
                const error = validated.errorsById[entry.id];
                return (
                  <tr key={entry.id} className="border-t border-zinc-800">
                    <td className="px-3 py-1.5">
                      <input
                        value={entry.address}
                        onChange={(e) => updateEntry(entry.id, { address: e.target.value })}
                        placeholder="0x..."
                        className="w-full rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-zinc-100 focus:border-emerald-500 focus:bg-zinc-950 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={entry.amount}
                        onChange={(e) => updateEntry(entry.id, { amount: e.target.value })}
                        placeholder="0.0"
                        className="w-28 rounded border border-transparent bg-transparent px-2 py-1 text-zinc-100 focus:border-emerald-500 focus:bg-zinc-950 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="text-xs text-zinc-500 hover:text-red-400"
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

        {entries.some((e) => validated.errorsById[e.id]) && (
          <ul className="mt-2 space-y-0.5 text-xs text-red-400">
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
