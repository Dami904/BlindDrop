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

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold text-zinc-50">Disperse Tokens</h1>
      <p className="mt-3 text-zinc-400">
        Batch-send encrypted token amounts to many recipients in a single confidential
        transaction — no campaign or claim step required.
      </p>

      {!isConnected && (
        <div className="mt-8 rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          Connect your wallet to disperse tokens.
        </div>
      )}

      {isConnected && wrongChain && (
        <div className="mt-8 flex items-center justify-between rounded-xl border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          <span>Switch to Sepolia (chain {SEPOLIA_CHAIN_ID}) to disperse tokens.</span>
          <button
            type="button"
            onClick={() => switchChain({ chainId: sepolia.id })}
            disabled={isSwitching}
            className="ml-4 shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSwitching ? "Switching…" : "Switch to Sepolia"}
          </button>
        </div>
      )}

      <section className="mt-8 space-y-3">
        <label className="block text-sm font-medium text-zinc-300">
          ERC-7984 confidential token address
        </label>
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="0x…"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
        />
        {!tokenValid && tokenInput.length > 0 && (
          <p className="text-xs text-red-400">Not a valid address.</p>
        )}
        <p className="text-xs text-zinc-500">
          Defaults to the CTTT test token from the faucet. Need test tokens?{" "}
          <a href="/faucet" className="text-emerald-400 hover:text-emerald-300">
            Claim some →
          </a>
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
        <h2 className="text-lg font-medium text-zinc-100">Recipients</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Upload a CSV, paste rows, or add recipients manually. Format:{" "}
          <code className="text-zinc-300">address,amount</code> per line.
        </p>
        <div className="mt-4">
          <DisperseRecipients entries={entries} onChange={setEntries} validated={validated} />
        </div>
      </section>

      {ready && token && (
        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
          <h2 className="text-lg font-medium text-zinc-100">1. Register your wallet pair</h2>
          <p className="mt-1 text-sm text-zinc-400">
            One-time setup: the disperse singleton deploys a dedicated wallet pair for your
            address to hold funds mid-transfer.
          </p>
          <button
            type="button"
            onClick={() =>
              register.mutate({ token }, { onSuccess: invalidateDisperseQueries })
            }
            disabled={isRegistered.data === true || register.isPending}
            className="mt-3 rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRegistered.data === true
              ? "Registered"
              : register.isPending
              ? "Registering…"
              : "Register"}
          </button>
          {register.isError && (
            <p className="mt-2 text-xs text-red-400">{register.error?.message}</p>
          )}

          <h2 className="mt-6 text-lg font-medium text-zinc-100">2. Approve token operator</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Your registered wallets must be approved as ERC-7984 operators for this token before
            a wallet-mode disperse can move funds.
          </p>
          <button
            type="button"
            onClick={() =>
              approve.mutate({ token }, { onSuccess: invalidateDisperseQueries })
            }
            disabled={isRegistered.data !== true || approvals.data?.both === true || approve.isPending}
            className="mt-3 rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {approvals.data?.both === true
              ? "Approved"
              : approve.isPending
              ? "Approving…"
              : "Approve operator"}
          </button>
          {approve.isError && (
            <p className="mt-2 text-xs text-red-400">{approve.error?.message}</p>
          )}

          <h2 className="mt-6 text-lg font-medium text-zinc-100">3. Disperse</h2>
          {preflight.data && !preflight.data.ready && preflight.data.blockerErrors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-300">
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
            className="mt-3 rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {disperse.isPending ? "Dispersing…" : "Disperse tokens"}
          </button>

          {disperse.isSuccess && disperse.data && (
            <div className="mt-3 rounded-md border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
              Dispersed. Tx:{" "}
              <a
                href={etherscanTxUrl(disperse.data.hash)}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-emerald-200"
              >
                {disperse.data.hash.slice(0, 10)}…
              </a>
            </div>
          )}
          {disperse.isError && (
            <p className="mt-3 rounded-md border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {disperse.error?.message ?? "Disperse failed."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
