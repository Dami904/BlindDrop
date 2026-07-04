"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useQueryClient } from "@tanstack/react-query";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import {
  useIsRegistered,
  useRegister,
  useHasApprovedSubwallets,
  useApproveTokenOnWallets,
  usePreflightDisperse,
  useDisperse,
} from "@tokenops/sdk/fhe-disperse/react";
import { getConfidentialTestTokenAddress } from "@tokenops/sdk";
import { DisperseRecipients } from "@/components/disperse/DisperseRecipients";
import { TokenIdentityCard } from "@/components/TokenIdentityCard";
import { TokenAmountSummary } from "@/components/TokenAmountSummary";
import { TokenSelect } from "@/components/TokenSelect";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";
import {
  newRecipientEntry,
  scaleAmountToUnits,
  validateRecipientEntries,
  type RecipientEntry,
} from "@/lib/csv";
import { toTokenOpsEncryptor } from "@/lib/encryptor";
import { isSepoliaChainId, SEPOLIA_CHAIN_ID, etherscanTxUrl } from "@/lib/packet";

const CONFIDENTIAL_DECIMALS = 6;

function isHexAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

type SectionState = "idle" | "active" | "done";

/**
 * One numbered section of the disperse flow: a wax-seal step marker,
 * title, and one-line summary shown once the section is complete and
 * collapsed. Auto-collapses on completion; the visitor can re-expand any
 * section (done or not) to review or edit it.
 */
function Section({
  n,
  title,
  state,
  summary,
  open,
  onOpenChange,
  children,
}: {
  n: number;
  title: string;
  state: SectionState;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className="panel mt-8">
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        triggerClassName="flex w-full items-center justify-between gap-4 p-6 text-left"
        trigger={
          <>
            <span className="flex min-w-0 items-center gap-3">
              <span className="seal-badge shrink-0" data-state={state === "idle" ? undefined : state}>
                {state === "done" ? "✓" : n}
              </span>
              <span className="min-w-0">
                <span className="font-display block text-lg">{title}</span>
                {!open && summary && (
                  <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-dim)" }}>
                    {summary}
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0" style={{ color: "var(--text-dim)" }}>
              <ChevronIcon open={open} />
            </span>
          </>
        }
      >
        <div className="px-6 pb-6">{children}</div>
      </Collapsible>
    </section>
  );
}

export default function DispersePage() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const queryClient = useQueryClient();
  const zamaSDK = useZamaSDK();

  const wrongChain = !isSepoliaChainId(chainId);
  const ready = isConnected && !wrongChain;

  const defaultToken = isSepoliaChainId(chainId)
    ? getConfidentialTestTokenAddress(SEPOLIA_CHAIN_ID) ?? ""
    : "";
  const [tokenInput, setTokenInput] = useState(defaultToken);
  const tokenValid = isHexAddress(tokenInput);
  const token = tokenValid ? (tokenInput as Address) : undefined;

  const [entries, setEntries] = useState<RecipientEntry[]>([newRecipientEntry()]);
  const validated = useMemo(() => validateRecipientEntries(entries), [entries]);

  const recipients = useMemo(
    () => validated.valid.map((r) => r.address) as Address[],
    [validated.valid]
  );
  const amounts = useMemo(
    () => validated.valid.map((r) => scaleAmountToUnits(r.amount, CONFIDENTIAL_DECIMALS)),
    [validated.valid]
  );
  const totalAmountUnits = useMemo(() => amounts.reduce((sum, a) => sum + a, BigInt(0)), [amounts]);

  function invalidateDisperseQueries() {
    queryClient.invalidateQueries({ queryKey: ["tokenops-sdk", "fhe-disperse"] });
  }

  const isRegistered = useIsRegistered({
    user: address,
  });
  const register = useRegister();

  const approvals = useHasApprovedSubwallets({
    user: address,
    token,
  });
  const approve = useApproveTokenOnWallets();

  const preflight = usePreflightDisperse({
    user: address,
    token,
    recipients: recipients.length > 0 ? recipients : undefined,
    amounts: amounts.length > 0 ? amounts : undefined,
    mode: "wallet",
  });

  const disperse = useDisperse({
    encryptor: () => toTokenOpsEncryptor(zamaSDK.relayer),
  });

  const canSubmit =
    ready &&
    !!token &&
    recipients.length > 0 &&
    !!preflight.data?.ready &&
    !disperse.isPending;

  // Section 1: setup (token + recipients). "Done" once there's a valid
  // token and at least one valid recipient — matches the gating that
  // previously revealed the prerequisites checklist.
  const setupDone = ready && !!token && recipients.length > 0;
  const registeredDone = isRegistered.data === true;
  const approvedDone = approvals.data?.both === true;
  const disperseDone = disperse.isSuccess;

  const [openOverrides, setOpenOverrides] = useState<Record<number, boolean>>({});
  function sectionOpen(n: number, doneByDefault: boolean) {
    return openOverrides[n] ?? !doneByDefault;
  }
  function setSectionOpen(n: number, open: boolean) {
    setOpenOverrides((o) => ({ ...o, [n]: open }));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">One-shot distribution</p>
      <h1 className="font-display mt-2 text-3xl">Disperse Tokens</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Batch-send encrypted token amounts to many recipients in a single confidential
        transaction — no campaign or claim step required.
      </p>

      {!isConnected && (
        <div className="callout callout-warn mt-8">Connect your wallet to disperse tokens.</div>
      )}

      {isConnected && wrongChain && (
        <div className="callout callout-warn callout-between mt-8">
          <span>Switch to Sepolia (chain {SEPOLIA_CHAIN_ID}) to disperse tokens.</span>
          <button
            type="button"
            onClick={() => switchChain({ chainId: sepolia.id })}
            disabled={isSwitching}
            className="btn btn-gold ml-4 shrink-0 text-xs"
          >
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      )}

      <Section
        n={1}
        title="Token & recipients"
        state={setupDone ? "done" : "active"}
        summary={
          setupDone
            ? `${recipients.length} recipient${recipients.length === 1 ? "" : "s"} · token ${tokenInput.slice(0, 6)}…${tokenInput.slice(-4)}`
            : undefined
        }
        open={sectionOpen(1, setupDone)}
        onOpenChange={(o) => setSectionOpen(1, o)}
      >
        <div className="space-y-3">
          <label className="label">ERC-7984 confidential token</label>
          <TokenSelect value={tokenInput} onChange={setTokenInput} />
          {!tokenValid && tokenInput.length > 0 && (
            <p className="text-xs" style={{ color: "var(--err)" }}>
              Not a valid address.
            </p>
          )}
          {token && <TokenIdentityCard address={token} />}
          {token && recipients.length > 0 && (
            <TokenAmountSummary
              token={token}
              amountUnits={totalAmountUnits}
              recipientCount={recipients.length}
              className="text-sm"
            />
          )}
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            Defaults to the CTTT test token from the faucet. Need test tokens?{" "}
            <Link href="/#faucet" className="link-gold">
              Claim some →
            </Link>
          </p>
        </div>

        <div className="divider-stamped mt-6 pt-6">
          <h3 className="eyebrow">Recipients</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
            Upload a CSV, paste rows, or add recipients manually. Format:{" "}
            <code className="font-data" style={{ color: "var(--text)" }}>
              address,amount
            </code>{" "}
            per line.
          </p>
          <div className="mt-4">
            <DisperseRecipients entries={entries} onChange={setEntries} validated={validated} />
          </div>
        </div>
      </Section>

      {ready && token && (
        <>
          <Section
            n={2}
            title="Register your wallet pair"
            state={registeredDone ? "done" : "active"}
            summary={registeredDone ? "Registered" : undefined}
            open={sectionOpen(2, registeredDone)}
            onOpenChange={(o) => setSectionOpen(2, o)}
          >
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              One-time setup: the disperse singleton deploys a dedicated wallet pair for your
              address to hold funds mid-transfer.
            </p>
            <button
              type="button"
              onClick={() => register.mutate({ token }, { onSuccess: invalidateDisperseQueries })}
              disabled={registeredDone || register.isPending}
              className="btn btn-seal mt-3"
            >
              {registeredDone ? "Registered" : register.isPending ? "Registering…" : "Register"}
            </button>
            {register.isError && (
              <p className="mt-2 text-xs" style={{ color: "var(--err)" }}>
                {register.error?.message}
              </p>
            )}
          </Section>

          <Section
            n={3}
            title="Approve token operator"
            state={approvedDone ? "done" : registeredDone ? "active" : "idle"}
            summary={approvedDone ? "Approved" : undefined}
            open={sectionOpen(3, approvedDone)}
            onOpenChange={(o) => setSectionOpen(3, o)}
          >
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              Your registered wallets must be approved as ERC-7984 operators for this token
              before a wallet-mode disperse can move funds.
            </p>
            <button
              type="button"
              onClick={() => approve.mutate({ token }, { onSuccess: invalidateDisperseQueries })}
              disabled={!registeredDone || approvedDone || approve.isPending}
              className="btn btn-seal mt-3"
            >
              {approvedDone ? "Approved" : approve.isPending ? "Approving…" : "Approve operator"}
            </button>
            {approve.isError && (
              <p className="mt-2 text-xs" style={{ color: "var(--err)" }}>
                {approve.error?.message}
              </p>
            )}
          </Section>

          <Section
            n={4}
            title="Disperse"
            state={disperseDone ? "done" : approvedDone ? "active" : "idle"}
            summary={disperseDone && disperse.data ? `Sent · ${disperse.data.hash.slice(0, 10)}…` : undefined}
            open={sectionOpen(4, disperseDone)}
            onOpenChange={(o) => setSectionOpen(4, o)}
          >
            {preflight.data && !preflight.data.ready && preflight.data.blockerErrors.length > 0 && (
              <ul className="mb-3 list-inside list-disc space-y-0.5 text-xs" style={{ color: "var(--warn)" }}>
                {preflight.data.blockerErrors.map((err, i) => (
                  <li key={i}>{err.message}</li>
                ))}
              </ul>
            )}
            {token && recipients.length > 0 && (
              <TokenAmountSummary
                token={token}
                amountUnits={totalAmountUnits}
                recipientCount={recipients.length}
                className="mb-3 text-sm"
                showRawUnits
              />
            )}
            <button
              type="button"
              onClick={() =>
                disperse.mutate(
                  { token, mode: "wallet", recipients, amounts },
                  { onSuccess: invalidateDisperseQueries }
                )
              }
              disabled={!canSubmit}
              className="btn btn-gold"
            >
              {disperse.isPending ? "Dispersing…" : "Disperse tokens"}
            </button>

            {disperse.isSuccess && disperse.data && (
              <div className="callout callout-ok mt-3 text-xs">
                Dispersed. Tx:{" "}
                <a href={etherscanTxUrl(disperse.data.hash)} target="_blank" rel="noreferrer" className="font-data underline">
                  {disperse.data.hash.slice(0, 10)}…
                </a>
              </div>
            )}
            {disperse.isError && (
              <p className="callout callout-err mt-3 text-xs">
                {disperse.error?.message ?? "Disperse failed."}
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
