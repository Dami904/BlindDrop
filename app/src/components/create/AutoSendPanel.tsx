"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";
import {
  isEmailJsConfigComplete,
  resolveEmailJsConfig,
  saveEmailJsConfig,
  sendClaimEmail,
  type EmailJsConfig,
} from "@/lib/emailjs";

/** One recipient eligible for auto-send — an email plus their already-sealed claim link. */
export interface AutoSendRecipient {
  address: string;
  email: string;
  claimLink: string;
}

export type AutoSendState = "queued" | "sending" | "sent" | "failed";

export interface AutoSendStatusEntry {
  state: AutoSendState;
  reason?: string;
}

/** EmailJS's documented rate limit is roughly 1 request/second on the free tier. */
const SEND_SPACING_MS = 1100;

/**
 * Shared state + sending logic for the optional bulk-email feature, lifted
 * out of the panel component so a per-recipient "Auto-send" button elsewhere
 * in the packet list (see ClaimPacketsStep) can trigger single sends and
 * read the same status map the panel's "Send all" button drives.
 */
export function useAutoSend(recipients: AutoSendRecipient[]) {
  const [config, setConfig] = useState<EmailJsConfig | null>(null);
  const [envConfigured, setEnvConfigured] = useState(false);
  const [usingOwnAccount, setUsingOwnAccount] = useState(false);
  const [draft, setDraft] = useState<EmailJsConfig>({ serviceId: "", templateId: "", publicKey: "" });
  const [statuses, setStatuses] = useState<Map<string, AutoSendStatusEntry>>(new Map());
  const [isSending, setIsSending] = useState(false);

  // Resolve config on mount (client-only — localStorage isn't available
  // during server rendering): a saved override wins if complete, otherwise
  // the app's own env-provided EmailJS config is used as the default.
  useEffect(() => {
    const resolved = resolveEmailJsConfig();
    setConfig(resolved.config);
    setEnvConfigured(resolved.envConfigured);
    setUsingOwnAccount(resolved.source === "saved");
    if (resolved.config) setDraft(resolved.config);
  }, []);

  const configComplete = isEmailJsConfigComplete(config);

  function saveConfig() {
    saveEmailJsConfig(draft);
    const resolved = resolveEmailJsConfig();
    setConfig(resolved.config);
    setUsingOwnAccount(resolved.source === "saved");
  }

  function setStatus(address: string, entry: AutoSendStatusEntry) {
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(address.toLowerCase(), entry);
      return next;
    });
  }

  async function sendOne(recipient: AutoSendRecipient) {
    if (!config) return;
    setStatus(recipient.address, { state: "sending" });
    const result = await sendClaimEmail(config, {
      toEmail: recipient.email,
      claimLink: recipient.claimLink,
      recipientAddress: recipient.address,
    });
    if (result.ok) {
      setStatus(recipient.address, { state: "sent" });
    } else {
      setStatus(recipient.address, { state: "failed", reason: result.message });
    }
  }

  /** Sends sequentially, spaced out to stay under EmailJS's rate limit. */
  async function sendSequentially(targets: AutoSendRecipient[]) {
    if (!config || targets.length === 0 || isSending) return;
    setIsSending(true);
    setStatuses((prev) => {
      const next = new Map(prev);
      for (const r of targets) next.set(r.address.toLowerCase(), { state: "queued" });
      return next;
    });
    try {
      for (let i = 0; i < targets.length; i++) {
        await sendOne(targets[i]);
        if (i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, SEND_SPACING_MS));
        }
      }
    } finally {
      setIsSending(false);
    }
  }

  function sendAll() {
    void sendSequentially(recipients);
  }

  function retryFailed() {
    const failed = recipients.filter(
      (r) => statuses.get(r.address.toLowerCase())?.state === "failed"
    );
    void sendSequentially(failed);
  }

  const sentCount = recipients.filter((r) => statuses.get(r.address.toLowerCase())?.state === "sent").length;
  const failedCount = recipients.filter((r) => statuses.get(r.address.toLowerCase())?.state === "failed").length;

  return {
    config,
    envConfigured,
    usingOwnAccount,
    draft,
    setDraft,
    saveConfig,
    configComplete,
    statuses,
    isSending,
    sendAll,
    retryFailed,
    sendOne: (recipient: AutoSendRecipient) => void sendSequentially([recipient]),
    sentCount,
    failedCount,
  };
}

export type UseAutoSend = ReturnType<typeof useAutoSend>;

function statusLabel(entry: AutoSendStatusEntry | undefined): string {
  switch (entry?.state) {
    case "queued":
      return "Queued";
    case "sending":
      return "Sending…";
    case "sent":
      return "Sent ✓";
    case "failed":
      return `Failed${entry.reason ? `: ${entry.reason}` : ""}`;
    default:
      return "";
  }
}

/** Small inline status chip for a single recipient — used both inside the panel's list and next to a per-row "Auto-send" button. */
export function AutoSendStatusChip({ entry }: { entry: AutoSendStatusEntry | undefined }) {
  if (!entry) return null;
  const color =
    entry.state === "sent"
      ? "var(--callout-ok-text)"
      : entry.state === "failed"
        ? "var(--err)"
        : "var(--text-dim)";
  return (
    <span className="text-[0.6875rem]" style={{ color }}>
      {statusLabel(entry)}
    </span>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  id?: string;
}

/** Small accessible on/off switch, styled with the design system's ink/seal tokens. Native
 * `<button>` semantics give keyboard operability (Space/Enter) for free; `role="switch"` +
 * `aria-checked` convey the on/off state to assistive tech. */
export function ToggleSwitch({ checked, onChange, label, id }: ToggleSwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <label htmlFor={switchId} className="flex cursor-pointer items-center justify-between gap-4 select-none">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        id={switchId}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{
          background: checked ? "var(--seal)" : "var(--ink-3)",
          border: `1px solid ${checked ? "var(--seal-bright)" : "var(--line)"}`,
          transitionDuration: "var(--dur-fast)",
        }}
      >
        <span
          aria-hidden
          className="inline-block h-4 w-4 rounded-full transition-transform"
          style={{
            background: "var(--paper)",
            transform: checked ? "translateX(22px)" : "translateX(3px)",
            transitionDuration: "var(--dur-fast)",
          }}
        />
      </button>
    </label>
  );
}

export interface AutoSendPanelProps {
  recipients: AutoSendRecipient[];
  auto: UseAutoSend;
}

/**
 * "Auto-send emails (optional)" — collapsed panel offering to bulk-send
 * claim-link emails through the admin's own EmailJS account. Nothing here is
 * required: the mailto / share / copy-link actions elsewhere keep working
 * whether or not this is ever configured.
 */
export function AutoSendPanel({ recipients, auto }: AutoSendPanelProps) {
  const [open, setOpen] = useState(false);
  const [ownAccountOpen, setOwnAccountOpen] = useState(false);
  const total = recipients.length;

  const configFields = (
    <>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>
        Uses your own EmailJS account (free at emailjs.com). Create an email template
        containing the variables <code>{"{{to_email}}"}</code>, <code>{"{{claim_link}}"}</code>,{" "}
        <code>{"{{recipient_address}}"}</code> — set the template&apos;s To field to{" "}
        <code>{"{{to_email}}"}</code>.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Service ID</span>
          <input
            type="text"
            value={auto.draft.serviceId}
            onChange={(e) => auto.setDraft((d) => ({ ...d, serviceId: e.target.value }))}
            className="field mt-1"
            placeholder="service_xxxxxxx"
          />
        </label>
        <label className="block">
          <span className="label">Template ID</span>
          <input
            type="text"
            value={auto.draft.templateId}
            onChange={(e) => auto.setDraft((d) => ({ ...d, templateId: e.target.value }))}
            className="field mt-1"
            placeholder="template_xxxxxxx"
          />
        </label>
        <label className="block">
          <span className="label">Public key</span>
          <input
            type="text"
            value={auto.draft.publicKey}
            onChange={(e) => auto.setDraft((d) => ({ ...d, publicKey: e.target.value }))}
            className="field mt-1"
            placeholder="public key"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={auto.saveConfig} className="btn btn-ghost w-fit text-xs">
          Save settings
        </button>
        {auto.config && (
          <span className="text-xs" style={{ color: auto.configComplete ? "var(--callout-ok-text)" : "var(--text-faint)" }}>
            {auto.configComplete ? "Settings saved" : "Settings saved, but incomplete"}
          </span>
        )}
      </div>
    </>
  );

  return (
    <div className="panel">
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        triggerClassName="flex w-full items-center justify-between gap-4 p-4 text-left"
        trigger={
          <>
            <span className="min-w-0 flex-1">
              <span className="eyebrow">Optional</span>
              <span className="font-display mt-1 block text-base">Auto-send emails</span>
              {!open && (
                <span className="mt-1 block text-xs" style={{ color: "var(--text-dim)" }}>
                  Bulk-send {total} claim link{total === 1 ? "" : "s"}
                  {auto.envConfigured ? "." : " through your own EmailJS account."}
                </span>
              )}
            </span>
            <ChevronIcon open={open} />
          </>
        }
      >
        <div className="flex flex-col gap-4 px-4 pb-4">
          {auto.envConfigured ? (
            <>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Emails send from your browser via the app&apos;s shared EmailJS quota.
              </p>
              <div className="rounded-[var(--r-md)] border" style={{ borderColor: "var(--line)" }}>
                <Collapsible
                  open={ownAccountOpen}
                  onOpenChange={setOwnAccountOpen}
                  triggerClassName="flex w-full items-center justify-between gap-3 p-3 text-left text-xs"
                  trigger={
                    <>
                      <span style={{ color: "var(--text-dim)" }}>Use your own EmailJS account instead</span>
                      <ChevronIcon open={ownAccountOpen} />
                    </>
                  }
                >
                  <div className="flex flex-col gap-4 p-3 pt-0">{configFields}</div>
                </Collapsible>
              </div>
            </>
          ) : (
            configFields
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={auto.sendAll}
              disabled={!auto.configComplete || auto.isSending || total === 0}
              className="btn btn-seal w-fit text-xs"
            >
              {auto.isSending ? "Sending…" : `Send all (${total})`}
            </button>
            {auto.failedCount > 0 && !auto.isSending && (
              <button type="button" onClick={auto.retryFailed} className="btn btn-gold w-fit text-xs">
                Retry failed ({auto.failedCount})
              </button>
            )}
            {(auto.sentCount > 0 || auto.failedCount > 0) && (
              <span className="font-data text-xs" style={{ color: "var(--text-dim)" }}>
                {auto.sentCount} sent{auto.failedCount > 0 ? `, ${auto.failedCount} failed` : ""} / {total}
              </span>
            )}
          </div>

          {recipients.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
              {recipients.map((r) => {
                const entry = auto.statuses.get(r.address.toLowerCase());
                if (!entry) return null;
                return (
                  <li key={r.address} className="flex items-center justify-between gap-2">
                    <span style={{ color: "var(--text-dim)" }}>
                      {shortAddress(r.address)} — {r.email}
                    </span>
                    <AutoSendStatusChip entry={entry} />
                  </li>
                );
              })}
            </ul>
          )}

          {!auto.envConfigured && (
            <p className="text-[0.6875rem]" style={{ color: "var(--text-faint)" }}>
              Emails send straight from your browser through your own EmailJS account — BlindDrop
              never sees the recipient list.
            </p>
          )}
        </div>
      </Collapsible>
    </div>
  );
}
