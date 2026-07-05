"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Hex } from "viem";
import { RecipientsStep, RECIPIENTS_DRAFT_KEY } from "@/components/create/RecipientsStep";
import { CampaignStep, type DeployedCampaign } from "@/components/create/CampaignStep";
import { ClaimPacketsStep } from "@/components/create/ClaimPacketsStep";
import { newRecipientEntry, validateRecipientEntries, type RecipientEntry } from "@/lib/csv";
import {
  clearDeployedCampaign,
  clearPackets,
  loadDeployedCampaign,
  saveDeployedCampaign,
} from "@/lib/create-storage";

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

  // Restore a deployed campaign (public on-chain identity — airdrop address,
  // token, claim window) so an admin who navigated away or reloaded lands
  // back on step 3 instead of being forced to re-deploy. Runs once on mount.
  // If the recipients draft hasn't been restored yet (RecipientsStep only
  // restores it when actually mounted, i.e. on step 1), restore it here too
  // so the jump straight to step 3 has a recipient list to work with.
  useEffect(() => {
    const stored = loadDeployedCampaign();
    if (!stored) return;
    try {
      const raw = localStorage.getItem(RECIPIENTS_DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as RecipientEntry[];
        if (Array.isArray(saved) && saved.some((e) => e.address?.trim() || e.amount?.trim())) {
          setEntries(saved);
        }
      }
    } catch {
      // corrupt/foreign draft — ignore, ClaimPacketsStep still works with an
      // empty recipient list (restored packets aren't keyed off it)
    }
    setDeployed(stored);
    setStep(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the deployed campaign's public identity whenever it changes.
  useEffect(() => {
    if (deployed) saveDeployedCampaign(deployed);
  }, [deployed]);

  function startNewCampaign() {
    if (!deployed) return;
    const ok = window.confirm(
      "Start a new campaign? This clears the saved campaign and its sealed packets from this browser. The recipient list is kept."
    );
    if (!ok) return;
    clearDeployedCampaign();
    clearPackets(deployed.airdrop);
    setDeployed(null);
    setStep(1);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">Case file · new distribution</p>
      <h1 className="font-display mt-2 text-3xl sm:text-4xl">Create Distribution</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Set up a new confidential token distribution with FHE-encrypted amounts per recipient.
      </p>

      <ol className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
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

      {deployed && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
          <Link href="/campaigns" className="link-gold text-xs">
            Manage your campaigns →
          </Link>
          <button type="button" onClick={startNewCampaign} className="link-gold text-xs">
            Start a new campaign
          </button>
        </div>
      )}

      <div className="panel mt-10 p-8">
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
