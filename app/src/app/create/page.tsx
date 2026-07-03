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
      <h1 className="text-3xl font-semibold text-zinc-50">Create Distribution</h1>
      <p className="mt-3 text-zinc-400">
        Set up a new confidential token distribution with FHE-encrypted amounts per recipient.
      </p>

      <ol className="mt-8 flex items-center gap-4 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (s.id === 1 || (s.id === 2 && validated.valid.length > 0) || (s.id === 3 && deployed)) {
                  setStep(s.id);
                }
              }}
              className={`flex items-center gap-2 ${
                step === s.id ? "text-emerald-400" : "text-zinc-500"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                  step === s.id ? "border-emerald-400 text-emerald-400" : "border-zinc-700"
                }`}
              >
                {s.id}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <span className="text-zinc-700">—</span>}
          </li>
        ))}
      </ol>

      <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
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
