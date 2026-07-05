"use client";

import { useState } from "react";
import { describeAmountError, splitEvenly, type RecipientEntry } from "@/lib/csv";

interface AmountsHelperProps {
  entries: RecipientEntry[];
  onChange: (entries: RecipientEntry[]) => void;
}

/** True when an entry has content worth assigning an amount to — mirrors the
 * "blank trailing row" skip used by {@link validateRecipientEntries}. */
function isNonEmpty(entry: RecipientEntry): boolean {
  return !!entry.address.trim() || !!entry.amount.trim();
}

/**
 * Compact "Amounts" helper row above the recipients ledger: bulk-set every
 * non-empty row to the same amount, or split a total evenly across them.
 * Operates purely on the existing `entries`/`onChange` contract — no new
 * state lives outside this component beyond the two input fields.
 */
export function AmountsHelper({ entries, onChange }: AmountsHelperProps) {
  const [setValue, setSetValue] = useState("");
  const [setError, setSetError] = useState<string | null>(null);

  const [splitTotal, setSplitTotal] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);

  const nonEmptyCount = entries.filter(isNonEmpty).length;

  function applySetAll() {
    setSetError(null);
    const error = describeAmountError(setValue);
    if (error) {
      setSetError(error);
      return;
    }
    onChange(entries.map((e) => (isNonEmpty(e) ? { ...e, amount: setValue } : e)));
  }

  function applySplit() {
    setSplitError(null);
    const error = describeAmountError(splitTotal);
    if (error) {
      setSplitError(error);
      return;
    }
    if (nonEmptyCount === 0) {
      setSplitError("Add at least one recipient before splitting a total.");
      return;
    }
    const shares = splitEvenly(splitTotal, nonEmptyCount);
    let i = 0;
    onChange(
      entries.map((e) => {
        if (!isNonEmpty(e)) return e;
        const amount = shares[i];
        i += 1;
        return { ...e, amount };
      })
    );
  }

  return (
    <div className="panel flex flex-col gap-3 p-3">
      <p className="eyebrow">Amounts</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Set all to…</label>
          <input
            value={setValue}
            onChange={(e) => setSetValue(e.target.value)}
            placeholder="0.0"
            className="field tabular mt-1 w-32"
          />
        </div>
        <button
          type="button"
          onClick={applySetAll}
          disabled={!setValue.trim() || nonEmptyCount === 0}
          className="btn btn-ghost text-xs"
        >
          Apply to {nonEmptyCount || 0} row{nonEmptyCount === 1 ? "" : "s"}
        </button>
      </div>
      {setError && (
        <p className="text-xs" style={{ color: "var(--err)" }}>
          {setError}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Split… evenly</label>
          <input
            value={splitTotal}
            onChange={(e) => setSplitTotal(e.target.value)}
            placeholder="0.0"
            className="field tabular mt-1 w-32"
          />
        </div>
        <button
          type="button"
          onClick={applySplit}
          disabled={!splitTotal.trim() || nonEmptyCount === 0}
          className="btn btn-ghost text-xs"
        >
          Split across {nonEmptyCount || 0} row{nonEmptyCount === 1 ? "" : "s"}
        </button>
      </div>
      {splitError && (
        <p className="text-xs" style={{ color: "var(--err)" }}>
          {splitError}
        </p>
      )}
      <p className="text-[0.6875rem]" style={{ color: "var(--text-faint)" }}>
        First recipient receives any rounding remainder.
      </p>
    </div>
  );
}
