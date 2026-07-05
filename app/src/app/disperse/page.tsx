"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useQueryClient } from "@tanstack/react-query";
import { useMetadata, useZamaSDK, useConfidentialIsOperator, useConfidentialSetOperator } from "@zama-fhe/react-sdk";
import {
  useIsRegistered,
  useRegister,
  useHasApprovedSubwallets,
  useApproveTokenOnWallets,
  usePreflightDisperse,
  useDisperse,
} from "@tokenops/sdk/fhe-disperse/react";
import { getConfidentialTestTokenAddress, getFheDisperseSingletonAddress } from "@tokenops/sdk";
import { DisperseRecipients } from "@/components/disperse/DisperseRecipients";
import { TokenIdentityCard } from "@/components/TokenIdentityCard";
import { TokenAmountSummary } from "@/components/TokenAmountSummary";
import { TokenSelect } from "@/components/TokenSelect";
import {
  newRecipientEntry,
  scaleAmountToUnits,
  validateRecipientEntries,
  type RecipientEntry,
} from "@/lib/csv";
import { toTokenOpsEncryptor } from "@/lib/encryptor";
import { isSepoliaChainId, SEPOLIA_CHAIN_ID, etherscanTxUrl } from "@/lib/packet";
import { formatConfidentialAmount } from "@/lib/confidential";
import { TxHashLink, TxStatusLine } from "@/components/TxStatus";
import { InfoTip } from "@/components/InfoTip";
import { ErrorNote } from "@/components/ErrorNote";
import { describeMutationError, type FriendlyError } from "@/lib/errors";
import { SealStamp } from "@/components/SealStamp";
import { saveDisperseReceipt, type DisperseReceipt } from "@/lib/disperse-history";

const CONFIDENTIAL_DECIMALS = 6;

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Receipt card shown once a disperse transaction succeeds — token identity,
 * recipient count, total (human units), tx hash/link, and a timestamp. The
 * amounts here are the sender's local record only; on-chain the transfer
 * amounts remain FHE-encrypted.
 */
function DisperseReceiptCard({ receipt }: { receipt: DisperseReceipt }) {
  const [copied, setCopied] = useState(false);

  function copyReceipt() {
    navigator.clipboard?.writeText(JSON.stringify(receipt, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="envelope-card mt-4">
      <div className="envelope-flap" aria-hidden />
      <div className="relative z-10 p-5 pt-12">
        <SealStamp>Dispersed</SealStamp>
        <p className="mt-2 eyebrow">Disperse receipt</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt style={{ color: "var(--text-dim)" }}>Token</dt>
            <dd className="font-data text-right" style={{ color: "var(--text)" }}>
              {receipt.token.symbol ? `${receipt.token.symbol} · ` : ""}
              {receipt.token.address.slice(0, 6)}…{receipt.token.address.slice(-4)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt style={{ color: "var(--text-dim)" }}>Recipients</dt>
            <dd className="tabular" style={{ color: "var(--text)" }}>
              {receipt.recipientCount}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt style={{ color: "var(--text-dim)" }}>Total amount</dt>
            <dd className="font-data tabular" style={{ color: "var(--text)" }}>
              {receipt.totalAmountHuman}
              {receipt.token.symbol ? ` ${receipt.token.symbol}` : ""}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt style={{ color: "var(--text-dim)" }}>Transaction</dt>
            <dd>
              <a href={receipt.etherscanUrl} target="_blank" rel="noreferrer" className="link-gold font-data">
                {receipt.txHash.slice(0, 10)}…
              </a>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt style={{ color: "var(--text-dim)" }}>Timestamp</dt>
            <dd className="font-data text-xs" style={{ color: "var(--text)" }}>
              {receipt.timestamp}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex gap-3">
          <button type="button" onClick={copyReceipt} className="btn btn-ghost text-xs">
            {copied ? "Copied!" : "Copy receipt"}
          </button>
          <button
            type="button"
            onClick={() => downloadJson(`disperse-receipt-${receipt.txHash}.json`, receipt)}
            className="btn btn-gold text-xs"
          >
            Download receipt
          </button>
        </div>

        <p className="mt-4 text-xs" style={{ color: "var(--text-faint)" }}>
          {receipt.note}
        </p>
      </div>
    </div>
  );
}

/** Small wrapper so call sites don't need to invoke `describeMutationError` twice
 * (once for the message, once for the detail) at every error render. */
function MutationErrorNote({ error, fallback, className }: { error: unknown; fallback: string; className?: string }) {
  const info = describeMutationError(error, fallback);
  return <ErrorNote className={className} message={info.message} detail={info.detail} />;
}

function isHexAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/**
 * Map a disperse-mutation error to a plain-language message. The disperse
 * singleton pulls the encrypted total from the caller's own wallet via an
 * ERC-7984 operator transfer before fanning it out to the sub-wallets — if
 * the caller never granted the singleton operator status on the token, the
 * transaction reverts with `ERC7984UnauthorizedSpender(address,address)`
 * (selector `0x79f2cb38`).
 */
function describeDisperseError(error: unknown): FriendlyError {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("79f2cb38") || raw.includes("UnauthorizedSpender")) {
    return {
      message: "The disperse contract isn't approved to move your tokens yet — complete the approval step above.",
      detail: raw,
    };
  }
  return describeMutationError(error, "Couldn't submit the disperse transaction — you can try again.");
}

type StageState = "idle" | "active" | "done";

/**
 * Top-of-page stage stepper: three logical stages (setup, authorizations,
 * disperse), reusing the `.seal-badge` wax-seal marker from the create
 * wizard. Clicking a reachable stage's badge navigates back to review/edit
 * it — mirrors the create wizard's clickable stepper.
 */
function DisperseStepper({
  stage,
  onNavigate,
  reachable,
}: {
  stage: 1 | 2 | 3;
  onNavigate: (n: 1 | 2 | 3) => void;
  reachable: (n: 1 | 2 | 3) => boolean;
}) {
  const stages: { n: 1 | 2 | 3; label: string; state: StageState }[] = [
    { n: 1, label: "Recipients & token", state: stage === 1 ? "active" : stage > 1 ? "done" : "idle" },
    { n: 2, label: "Authorizations", state: stage === 2 ? "active" : stage > 2 ? "done" : "idle" },
    { n: 3, label: "Disperse", state: stage === 3 ? "active" : "idle" },
  ];
  return (
    <ol className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {stages.map((s, i) => {
        const canGo = reachable(s.n);
        return (
          <li key={s.n} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => canGo && onNavigate(s.n)}
              disabled={!canGo}
              className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: s.state === "active" ? "var(--gold)" : "var(--text-dim)" }}
            >
              <span className="seal-badge" data-state={s.state === "idle" ? undefined : s.state}>
                {s.state === "done" ? "✓" : s.n}
              </span>
              <span className="font-data text-xs tracking-wide uppercase">{s.label}</span>
            </button>
            {i < stages.length - 1 && (
              <span aria-hidden style={{ color: "var(--text-faint)" }}>
                ···
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One row of the "Authorizations" checklist (register / approve subwallets /
 * approve singleton) — a mini wax-seal badge, label, and an action button on
 * the right. Mirrors the funding checklist pattern in create/CampaignStep.tsx.
 */
function ChecklistItem({
  n,
  state,
  label,
  action,
  children,
}: {
  n: number;
  state: StageState;
  label: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="seal-badge shrink-0"
        data-state={state === "idle" ? undefined : state}
        style={{ width: "1.5rem", height: "1.5rem" }}
      >
        {state === "done" ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--text)" }}>
            {label}
          </p>
          {action}
        </div>
        {children}
      </div>
    </div>
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
  // Metadata for the receipt's token name/symbol/decimals — safe to call with
  // a placeholder address since the query is disabled until a real token exists.
  const tokenMetadata = useMetadata(token ?? ("0x0000000000000000000000000000000000000000" as Address), {
    enabled: !!token,
  });

  const [receipt, setReceipt] = useState<DisperseReceipt | null>(null);

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

  // The disperse SINGLETON (not the sub-wallets) pulls the encrypted total
  // out of the caller's own wallet via an ERC-7984 operator transfer before
  // splitting it across the sub-wallets — so the caller must separately
  // grant the singleton operator status on the token. `usePreflightDisperse`
  // does NOT surface this for wallet-mode disperses (its `hasApprovedSingleton`
  // field is only populated for `mode: "direct"`), so this is checked
  // independently here.
  const singletonAddress = isSepoliaChainId(chainId)
    ? getFheDisperseSingletonAddress(SEPOLIA_CHAIN_ID)
    : undefined;
  const isSingletonOperator = useConfidentialIsOperator({
    address: token,
    spender: singletonAddress,
    holder: address,
  });
  const setSingletonOperator = useConfidentialSetOperator(token ?? ("0x0000000000000000000000000000000000000000" as Address));

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

  const singletonApprovedDone = isSingletonOperator.data === true;

  const canSubmit =
    ready &&
    !!token &&
    recipients.length > 0 &&
    !!preflight.data?.ready &&
    singletonApprovedDone &&
    !disperse.isPending;

  // Stage 1: setup (token + recipients). "Done" once there's a valid
  // token and at least one valid recipient — matches the gating that
  // previously revealed the prerequisites checklist.
  const setupDone = ready && !!token && recipients.length > 0;
  const registeredDone = isRegistered.data === true;
  const approvedDone = approvals.data?.both === true;
  const disperseDone = disperse.isSuccess;
  // Stage 2 as a whole ("Authorizations") is done once all three checklist
  // items underneath it are done.
  const authorizationsDone = registeredDone && approvedDone && singletonApprovedDone;

  const [stage, setStage] = useState<1 | 2 | 3>(1);

  // Auto-advance forward once each stage's existing done-state flips true —
  // and step back if a prerequisite is lost (e.g. wallet disconnects, chain
  // switches away). Depending only on the boolean (not on `stage`) means a
  // visitor who manually navigates back to a completed stage via the
  // stepper isn't immediately bounced forward again.
  useEffect(() => {
    if (!setupDone && stage !== 1) setStage(1);
  }, [setupDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (setupDone && stage === 1) setStage(2);
  }, [setupDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authorizationsDone && stage === 3) setStage(2);
  }, [authorizationsDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (authorizationsDone && stage === 2) setStage(3);
  }, [authorizationsDone]); // eslint-disable-line react-hooks/exhaustive-deps

  function stageReachable(n: 1 | 2 | 3): boolean {
    if (n === 1) return true;
    if (n === 2) return setupDone;
    return authorizationsDone;
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

      <DisperseStepper stage={stage} onNavigate={setStage} reachable={stageReachable} />

      <div className="panel mt-6 p-6 sm:p-8">
        {stage === 1 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="seal-badge" data-state="active">
                1
              </span>
              <h2 className="font-display text-lg">Token & recipients</h2>
            </div>
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
          </div>
        )}

        {stage === 2 && ready && token && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="seal-badge" data-state="active">
                2
              </span>
              <h2 className="font-display text-lg">Authorizations</h2>
            </div>
            <p className="-mt-3 ml-10 text-sm" style={{ color: "var(--text-dim)" }}>
              Three one-time approvals before a wallet-mode disperse can move funds.
            </p>

            <ChecklistItem
              n={1}
              state={registeredDone ? "done" : "active"}
              label="Register your wallet pair — a dedicated pair is created to hold funds briefly during the transfer."
              action={
                <button
                  type="button"
                  onClick={() => register.mutate({ token }, { onSuccess: invalidateDisperseQueries })}
                  disabled={registeredDone || register.isPending}
                  className="btn btn-seal shrink-0 text-xs"
                >
                  {registeredDone ? "Registered" : register.isPending ? "Registering…" : "Register"}
                </button>
              }
            >
              {/* useRegister resolves only after the receipt is parsed for the
                  UserRegistered event — phases aren't separable mid-flight. */}
              <TxStatusLine awaitingWallet={register.isPending} className="mt-2" />
              {register.isSuccess && register.data && (
                <p className="mt-2 text-xs" style={{ color: "var(--ok)" }}>
                  Wallet pair registered. <TxHashLink hash={register.data.hash} />
                </p>
              )}
              {register.isError && (
                <MutationErrorNote
                  className="mt-2"
                  error={register.error}
                  fallback="Couldn't register your wallet pair — you can try again."
                />
              )}
            </ChecklistItem>

            <ChecklistItem
              n={2}
              state={approvedDone ? "done" : registeredDone ? "active" : "idle"}
              label="Approve token operator — your registered wallets need operator approval on this token before they can move funds."
              action={
                <button
                  type="button"
                  onClick={() => approve.mutate({ token }, { onSuccess: invalidateDisperseQueries })}
                  disabled={!registeredDone || approvedDone || approve.isPending}
                  className="btn btn-seal shrink-0 text-xs"
                >
                  {approvedDone ? "Approved" : approve.isPending ? "Approving…" : "Approve operator"}
                </button>
              }
            >
              <TxStatusLine awaitingWallet={approve.isPending} className="mt-2" />
              {approve.isSuccess && approve.data && (
                <p className="mt-2 text-xs" style={{ color: "var(--ok)" }}>
                  Sub-wallets approved. <TxHashLink hash={approve.data} />
                </p>
              )}
              {approve.isError && (
                <MutationErrorNote
                  className="mt-2"
                  error={approve.error}
                  fallback="Couldn't approve your sub-wallets — you can try again."
                />
              )}
            </ChecklistItem>

            <ChecklistItem
              n={3}
              state={singletonApprovedDone ? "done" : approvedDone ? "active" : "idle"}
              label="Allow the disperse contract to move your tokens"
              action={
                <button
                  type="button"
                  onClick={() => {
                    if (!token || !singletonAddress) return;
                    setSingletonOperator.mutate(
                      { operator: singletonAddress, until: Math.floor(Date.now() / 1000) + 3600 },
                      { onSuccess: () => isSingletonOperator.refetch() }
                    );
                  }}
                  disabled={
                    !approvedDone || singletonApprovedDone || setSingletonOperator.isPending || !singletonAddress
                  }
                  className="btn btn-seal shrink-0 text-xs"
                >
                  {singletonApprovedDone
                    ? "Approved"
                    : setSingletonOperator.isPending
                      ? "Approving…"
                      : "Approve disperse contract"}
                </button>
              }
            >
              <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                One-time approval so the disperse contract can move your tokens
                <InfoTip
                  label="Operator"
                  note="An address your token explicitly allows to move funds on your behalf — revocable, time-limited."
                />
                and split them across recipients. Separate from the wallet-pair approval above; expires after an hour.
              </p>
              {approvedDone && isSingletonOperator.isLoading && (
                <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
                  Checking approval status…
                </p>
              )}
              {approvedDone && !isSingletonOperator.isLoading && singletonApprovedDone && (
                <p className="mt-2 text-xs" style={{ color: "var(--ok)" }}>
                  Disperse contract approved to move your tokens.{" "}
                  {setSingletonOperator.data?.txHash && <TxHashLink hash={setSingletonOperator.data.txHash} />}
                </p>
              )}
              {/* Zama's setOperator mutation resolves after the mined receipt —
                  wallet-approval vs confirming isn't observable separately. */}
              <TxStatusLine awaitingWallet={setSingletonOperator.isPending} className="mt-2" />
              {setSingletonOperator.isError && (
                <MutationErrorNote
                  className="mt-2"
                  error={setSingletonOperator.error}
                  fallback="Couldn't approve the disperse contract — you can try again."
                />
              )}
            </ChecklistItem>
          </div>
        )}

        {stage === 3 && ready && token && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="seal-badge" data-state={disperseDone ? "done" : "active"}>
                {disperseDone ? "✓" : 3}
              </span>
              <h2 className="font-display text-lg">Disperse</h2>
            </div>
            {preflight.data && !preflight.data.ready && preflight.data.blockerErrors.length > 0 && (
              <ul className="list-inside list-disc space-y-0.5 text-xs" style={{ color: "var(--warn)" }}>
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
                className="text-sm"
                showRawUnits
              />
            )}
            <button
              type="button"
              onClick={() => {
                if (!token) return;
                const decimals = tokenMetadata.data?.decimals ?? CONFIDENTIAL_DECIMALS;
                const symbol = tokenMetadata.data?.symbol;
                disperse.mutate(
                  { token, mode: "wallet", recipients, amounts },
                  {
                    onSuccess: (data) => {
                      invalidateDisperseQueries();
                      const built: DisperseReceipt = {
                        token: { address: token, name: tokenMetadata.data?.name, symbol },
                        recipientCount: recipients.length,
                        totalAmountHuman: formatConfidentialAmount(totalAmountUnits, decimals),
                        totalAmountRawUnits: totalAmountUnits.toString(),
                        txHash: data.hash,
                        etherscanUrl: etherscanTxUrl(data.hash),
                        timestamp: new Date().toISOString(),
                        note:
                          "Amounts in this receipt are your local record only — on-chain, transfer amounts remain FHE-encrypted.",
                      };
                      setReceipt(built);
                      // Also log to the sender's local disperse history so it
                      // shows on the Campaigns page after a reload/navigation.
                      saveDisperseReceipt(built);
                    },
                  }
                );
              }}
              disabled={!canSubmit}
              className="btn btn-gold"
            >
              {disperse.isPending ? "Dispersing…" : "Disperse tokens"}
            </button>
            {/* useDisperse encrypts client-side then resolves after the
                receipt — no intermediate hash is observable. */}
            <TxStatusLine awaitingWallet={disperse.isPending} className="mt-2" />

            {disperse.isSuccess && disperse.data && (
              <div className="callout callout-ok mt-3 text-xs">
                Dispersed. Tx:{" "}
                <a href={etherscanTxUrl(disperse.data.hash)} target="_blank" rel="noreferrer" className="font-data underline">
                  {disperse.data.hash.slice(0, 10)}…
                </a>
              </div>
            )}
            {disperse.isError && (
              <ErrorNote
                className="mt-3"
                message={
                  disperse.error
                    ? describeDisperseError(disperse.error).message
                    : "The disperse transaction failed — you can try again."
                }
                detail={disperse.error ? describeDisperseError(disperse.error).detail : undefined}
              />
            )}
            {receipt && <DisperseReceiptCard receipt={receipt} />}
          </div>
        )}
      </div>
    </div>
  );
}
