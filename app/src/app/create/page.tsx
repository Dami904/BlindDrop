"use client";

import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { RecipientsStep } from "@/components/create/RecipientsStep";
import { CampaignStep, type DeployedCampaign } from "@/components/create/CampaignStep";
import { ClaimPacketsStep } from "@/components/create/ClaimPacketsStep";
import { newRecipientEntry, validateRecipientEntries, type RecipientEntry } from "@/lib/csv";

function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
}

const STEPS = [
  { id: 1, label: "Recipients" },
  { id: 2, label: "Campaign" },
  { id: 3, label: "Claim packets" },
] as const;

export default function CreatePage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [entries, setEntries] = useState<RecipientEntry[]>([newRecipientEntry()]);
  const [deployed, setDeployed] = useState<DeployedCampaign | null>(null);
  const [userSalt] = useState<Hex>(() => randomSalt());

  const validated = useMemo(() => validateRecipientEntries(entries), [entries]);

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">Case file · new distribution</p>
      <h1 className="font-display mt-2 text-3xl">Create Distribution</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Set up a new confidential token distribution with FHE-encrypted amounts per recipient.
      </p>

      <ol className="mt-8 flex items-center gap-3 text-sm">
        {STEPS.map((s, i) => {
          const state = step === s.id ? "active" : s.id < step ? "done" : undefined;
          const reachable =
            s.id === 1 || (s.id === 2 && validated.valid.length > 0) || (s.id === 3 && !!deployed);
          return (
            <li key={s.id} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => reachable && setStep(s.id)}
                disabled={!reachable}
                className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: step === s.id ? "var(--gold)" : "var(--text-dim)" }}
              >
                <span className="seal-badge" data-state={state}>
                  {s.id}
                </span>
                <span className="font-data text-xs tracking-wide uppercase">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span aria-hidden style={{ color: "var(--text-faint)" }}>
                  ···
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="panel mt-8 p-6">
        {step === 1 && (
          <RecipientsStep entries={entries} onChange={setEntries} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <CampaignStep
            recipients={validated.valid}
            userSalt={userSalt}
            deployed={deployed}
            onDeployed={setDeployed}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && deployed && (
          <ClaimPacketsStep recipients={validated.valid} deployed={deployed} />
        )}
      </div>
    </div>
  );
}
