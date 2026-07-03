"use client";

import { useMemo, useState } from "react";
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

  const prereqSteps = [
    { label: "Register your wallet pair", done: isRegistered.data === true },
    { label: "Approve token operator", done: approvals.data?.both === true },
    { label: "Disperse", done: disperse.isSuccess },
  ];

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

      <section className="mt-8 space-y-3">
        <label className="label">ERC-7984 confidential token address</label>
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="0x…"
          className="field font-data"
        />
        {!tokenValid && tokenInput.length > 0 && (
          <p className="text-xs" style={{ color: "var(--err)" }}>
            Not a valid address.
          </p>
        )}
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Defaults to the CTTT test token from the faucet. Need test tokens?{" "}
          <a href="/faucet" className="link-gold">
            Claim some →
          </a>
        </p>
      </section>

      <section className="panel mt-8 p-6">
        <h2 className="font-display text-lg">Recipients</h2>
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
      </section>

      {ready && token && (
        <section className="panel mt-6 p-6">
          <h2 className="eyebrow mb-4">Prerequisites checklist</h2>
          <ol className="flex flex-col gap-6">
            <li>
              <div className="flex items-center gap-3">
                <span className="seal-badge" data-state={prereqSteps[0].done ? "done" : "active"}>
                  {prereqSteps[0].done ? "✓" : "1"}
                </span>
                <h3 className="font-display text-base">Register your wallet pair</h3>
              </div>
              <p className="mt-1 ml-10 text-sm" style={{ color: "var(--text-dim)" }}>
                One-time setup: the disperse singleton deploys a dedicated wallet pair for your
                address to hold funds mid-transfer.
              </p>
              <div className="ml-10">
                <button
                  type="button"
                  onClick={() => register.mutate({ token }, { onSuccess: invalidateDisperseQueries })}
                  disabled={isRegistered.data === true || register.isPending}
                  className="btn btn-seal mt-3"
                >
                  {isRegistered.data === true ? "Registered" : register.isPending ? "Registering…" : "Register"}
                </button>
                {register.isError && (
                  <p className="mt-2 text-xs" style={{ color: "var(--err)" }}>
                    {register.error?.message}
                  </p>
                )}
              </div>
            </li>

            <li>
              <div className="flex items-center gap-3">
                <span className="seal-badge" data-state={prereqSteps[1].done ? "done" : isRegistered.data === true ? "active" : undefined}>
                  {prereqSteps[1].done ? "✓" : "2"}
                </span>
                <h3 className="font-display text-base">Approve token operator</h3>
              </div>
              <p className="mt-1 ml-10 text-sm" style={{ color: "var(--text-dim)" }}>
                Your registered wallets must be approved as ERC-7984 operators for this token
                before a wallet-mode disperse can move funds.
              </p>
              <div className="ml-10">
                <button
                  type="button"
                  onClick={() => approve.mutate({ token }, { onSuccess: invalidateDisperseQueries })}
                  disabled={isRegistered.data !== true || approvals.data?.both === true || approve.isPending}
                  className="btn btn-seal mt-3"
                >
                  {approvals.data?.both === true ? "Approved" : approve.isPending ? "Approving…" : "Approve operator"}
                </button>
                {approve.isError && (
                  <p className="mt-2 text-xs" style={{ color: "var(--err)" }}>
                    {approve.error?.message}
                  </p>
                )}
              </div>
            </li>

            <li>
              <div className="flex items-center gap-3">
                <span className="seal-badge" data-state={prereqSteps[2].done ? "done" : approvals.data?.both === true ? "active" : undefined}>
                  {prereqSteps[2].done ? "✓" : "3"}
                </span>
                <h3 className="font-display text-base">Disperse</h3>
              </div>

              <div className="ml-10">
                {preflight.data && !preflight.data.ready && preflight.data.blockerErrors.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs" style={{ color: "var(--warn)" }}>
                    {preflight.data.blockerErrors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
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
                  className="btn btn-gold mt-3"
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
              </div>
            </li>
          </ol>
        </section>
      )}
    </div>
  );
}
