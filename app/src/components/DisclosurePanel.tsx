"use client";

/**
 * Selective disclosure — a recipient grants a chosen third party the right to
 * decrypt THEIR OWN confidential balance on a given token, revocable at any
 * time. Built against `@zama-fhe/react-sdk`'s delegation hooks; semantics
 * confirmed by reading `node_modules/@zama-fhe/react-sdk/dist/index.d.ts`,
 * `node_modules/@zama-fhe/sdk/dist/esm/query/index.d.ts` (option-builder
 * signatures) and the compiled `query/index.js` (enabled-guards / mutationFn
 * bodies) and `index-DoVo9J1n.d.ts` (the `Delegations` service class):
 *
 * - Grant/revoke are ON-CHAIN TRANSACTIONS, not signatures.
 *   `useDelegateDecryption(tokenAddress)` calls `ACL.delegateForUserDecryption()`;
 *   `useRevokeDelegation(tokenAddress)` calls `ACL.revokeDelegationForUserDecryption()`.
 *   Both return a `TransactionResult` (hash + mined receipt), so they render
 *   with the same `TxStatusLine` treatment as every other write in this app.
 * - Scope is per (contract, delegator, delegate) tuple — delegation is
 *   token-scoped, not account-global. A recipient must grant separately per
 *   confidential token they want to share.
 * - `delegateAddress` param plus an optional `expirationDate?: Date`
 *   (defaults to permanent, `uint64.max`, when omitted). The SDK enforces
 *   `expirationDate` must be >=1h out (`DelegationExpirationTooSoonError`),
 *   delegate !== self (`DelegationSelfNotAllowedError`), and
 *   delegate !== the contract address itself (`DelegationDelegateEqualsContractError`).
 * - `useDelegationStatus({ contractAddress, delegatorAddress, delegateAddress })`
 *   reads `ACL.isHandleDelegatedForUserDecryption`-style state directly
 *   on-chain (no relayer/gateway round trip) — it's signer-independent and
 *   the query is auto-disabled until all three addresses are present, so it's
 *   safe to mount unconditionally once the token is known.
 * - The delegate's read is `useDecryptBalanceAs(tokenAddress)` with
 *   `{ delegatorAddress }` — NOT a manual viem `confidentialBalanceOf` read.
 *   Internally it reads the delegator's encrypted balance handle for you and
 *   performs a delegated EIP-712 user-decryption via the relayer, so it's a
 *   SIGNATURE prompt (like `useConfidentialBalance`), not a transaction —
 *   returns a plain `bigint`, no tx hash.
 * - After a grant transaction mines, the relayer's gateway needs ~1-2 minutes
 *   to sync the ACL state cross-chain before delegated decryption will
 *   succeed (`DelegationNotPropagatedError` if attempted too soon) — the
 *   on-chain `isActive` status itself updates immediately, only the
 *   *decrypt* path has the propagation lag.
 */

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import {
  useDelegateDecryption,
  useDelegationStatus,
  useDecryptBalanceAs,
  useMetadata,
  useRevokeDelegation,
} from "@zama-fhe/react-sdk";
import { TokenSelect } from "@/components/TokenSelect";
import { InfoTip } from "@/components/InfoTip";
import { ErrorNote } from "@/components/ErrorNote";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";
import { TxStatusLine } from "@/components/TxStatus";
import {
  describeDelegatedDecryptError,
  describeDelegationError,
  formatConfidentialAmount,
} from "@/lib/confidential";

const CONFIDENTIAL_DECIMALS = 6;
const PERMANENT_EXPIRY = BigInt(2) ** BigInt(64) - BigInt(1);

function isHexAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type Mode = "grant" | "decrypt";

const MODES: { id: Mode; label: string }[] = [
  { id: "grant", label: "Grant & manage" },
  { id: "decrypt", label: "Decrypt as delegate" },
];

export interface DisclosurePanelProps {
  /** Token address to pre-fill, e.g. the one currently selected in the verify
   * section above. Purely a starting value — this panel keeps its own token
   * selection since a grant can target a different token than the one being
   * verified. */
  initialToken?: string;
  defaultOpen?: boolean;
}

/**
 * "Share my allocation" — collapsed by default. Lets the connected wallet
 * grant/revoke a delegate's right to decrypt its own confidential balance on
 * a chosen token, and (in the other tab) lets a delegate decrypt someone
 * else's balance once shared with them.
 */
export function DisclosurePanel({ initialToken, defaultOpen = false }: DisclosurePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<Mode>("grant");
  const [tokenInput, setTokenInput] = useState(initialToken ?? "");

  const tokenValid = useMemo(() => isHexAddress(tokenInput), [tokenInput]);
  const token = tokenValid ? (tokenInput.trim() as Address) : undefined;

  return (
    <div className="divider-stamped mt-20 pt-16">
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        triggerClassName="flex w-full items-start justify-between gap-4 text-left"
        trigger={
          <>
            <span>
              <span className="eyebrow">Selective disclosure</span>
              <h2 className="font-display mt-2 text-3xl">Share my allocation</h2>
              <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
                Grant someone you choose — an auditor, an accountant — the right to read your
                numbers. Revocable any time; nothing becomes public.
              </p>
            </span>
            <span className="mt-1 shrink-0" style={{ color: "var(--text-dim)" }}>
              <ChevronIcon open={open} />
            </span>
          </>
        }
      >
        <div className="pt-8">
          <div className="flex gap-1 border-b" style={{ borderColor: "var(--line)" }} role="tablist">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className="relative px-4 py-2 font-data text-xs tracking-wide uppercase transition-colors"
                style={{ color: mode === m.id ? "var(--gold)" : "var(--text-dim)" }}
              >
                {m.label}
                {mode === m.id && (
                  <span className="absolute inset-x-2 -bottom-[1px] h-[2px]" style={{ background: "var(--gold)" }} />
                )}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <label className="label">ERC-7984 confidential token</label>
            <TokenSelect value={tokenInput} onChange={setTokenInput} />
            {tokenInput && !tokenValid && (
              <p className="text-xs" style={{ color: "var(--err)" }}>
                That doesn&apos;t look like a valid contract address.
              </p>
            )}
          </div>

          {token && mode === "grant" && (
            <div className="mt-6">
              <GrantManageSection token={token} />
            </div>
          )}
          {token && mode === "decrypt" && (
            <div className="mt-6">
              <DecryptAsDelegateSection token={token} />
            </div>
          )}

          <p className="mt-8 text-xs" style={{ color: "var(--text-faint)" }}>
            Delegated decryption shares read access through the FHE access-control layer on-chain
            <InfoTip
              label="Delegated decryption"
              note="Access is enforced by the encryption itself, not by this app — the delegate's wallet can only decrypt what the on-chain ACL says it's allowed to."
            />
            — revoking removes that access immediately.
          </p>
        </div>
      </Collapsible>
    </div>
  );
}

const EXPIRY_OPTIONS = [
  { id: "never", label: "Never expires", ms: undefined as number | undefined },
  { id: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

/**
 * Recipient side: grant or revoke a delegate's right to decrypt YOUR balance
 * on `token`. Only mounted once `token` is a validated address — the SDK's
 * delegation mutation hooks take `Address` (not `Address | undefined`) and
 * build a client from it unconditionally.
 */
function GrantManageSection({ token }: { token: Address }) {
  const { address: account, isConnected } = useAccount();
  const [delegateInput, setDelegateInput] = useState("");
  const [expiryId, setExpiryId] = useState<(typeof EXPIRY_OPTIONS)[number]["id"]>("never");

  const delegateValid = isHexAddress(delegateInput);
  const delegate = delegateValid ? (delegateInput.trim() as Address) : undefined;

  const selfDelegate = !!delegate && !!account && delegate.toLowerCase() === account.toLowerCase();
  const delegateIsToken = !!delegate && delegate.toLowerCase() === token.toLowerCase();
  const delegateBlocked = selfDelegate || delegateIsToken;

  const status = useDelegationStatus({
    contractAddress: token,
    delegatorAddress: account,
    delegateAddress: delegate,
  });

  const grant = useDelegateDecryption(token);
  const revoke = useRevokeDelegation(token);

  function handleGrant() {
    if (!delegate || delegateBlocked) return;
    const opt = EXPIRY_OPTIONS.find((o) => o.id === expiryId);
    const expirationDate = opt?.ms ? new Date(Date.now() + opt.ms) : undefined;
    grant.mutate(
      { delegateAddress: delegate, expirationDate },
      { onSuccess: () => status.refetch() }
    );
  }

  function handleRevoke() {
    if (!delegate) return;
    revoke.mutate({ delegateAddress: delegate }, { onSuccess: () => status.refetch() });
  }

  if (!isConnected || !account) {
    return <div className="callout callout-warn">Connect your wallet to share your allocation.</div>;
  }

  const isActive = status.data?.isActive === true;
  const busy = grant.isPending || revoke.isPending;

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Delegate wallet address</label>
        <input
          value={delegateInput}
          onChange={(e) => setDelegateInput(e.target.value)}
          placeholder="0x…"
          className="field font-data mt-2"
          disabled={busy}
        />
        {delegateInput && !delegateValid && (
          <p className="mt-1 text-xs" style={{ color: "var(--err)" }}>
            That doesn&apos;t look like a valid wallet address.
          </p>
        )}
        {selfDelegate && (
          <p className="mt-1 text-xs" style={{ color: "var(--err)" }}>
            You can&apos;t grant access to your own wallet — enter someone else&apos;s address.
          </p>
        )}
        {delegateIsToken && !selfDelegate && (
          <p className="mt-1 text-xs" style={{ color: "var(--err)" }}>
            That&apos;s the token contract itself — enter a wallet address instead.
          </p>
        )}
      </div>

      {delegateValid && !delegateBlocked && (
        <div className="panel p-4">
          {status.isLoading && (
            <div className="flex items-center gap-2">
              <span className="redaction inline-block h-4 w-48 rounded" />
            </div>
          )}

          {!status.isLoading && (
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              <span className="font-data">{shortAddress(delegate!)}</span>{" "}
              {isActive ? (
                <>
                  can currently decrypt your balance on this token
                  {status.data && status.data.expiryTimestamp !== PERMANENT_EXPIRY && (
                    <> — expires {new Date(Number(status.data.expiryTimestamp) * 1000).toLocaleString()}</>
                  )}
                  {status.data && status.data.expiryTimestamp === PERMANENT_EXPIRY && <> — no expiry</>}.
                </>
              ) : (
                <>has no access to this token yet.</>
              )}
            </p>
          )}

          {!isActive && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Access expires</label>
                <select
                  value={expiryId}
                  onChange={(e) => setExpiryId(e.target.value as typeof expiryId)}
                  disabled={busy}
                  className="field mt-2"
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={handleGrant} disabled={busy} className="btn btn-seal">
                {grant.isPending ? "Granting…" : "Grant access"}
              </button>
            </div>
          )}

          {isActive && (
            <button type="button" onClick={handleRevoke} disabled={busy} className="btn btn-ghost mt-4">
              {revoke.isPending ? "Revoking…" : "Revoke access"}
            </button>
          )}

          <TxStatusLine
            awaitingWallet={grant.isPending || revoke.isPending}
            className="mt-3"
          />

          {grant.isError && (
            <ErrorNote
              className="mt-3"
              message={describeDelegationError(grant.error).message}
              detail={describeDelegationError(grant.error).detail}
            />
          )}
          {revoke.isError && (
            <ErrorNote
              className="mt-3"
              message={describeDelegationError(revoke.error).message}
              detail={describeDelegationError(revoke.error).detail}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Delegate side: decrypt someone else's (`delegator`'s) balance on `token`,
 * once they've granted access. `useDecryptBalanceAs` reads the delegator's
 * encrypted balance handle internally and performs the delegated
 * EIP-712 user-decryption — a signature prompt, not a transaction.
 */
function DecryptAsDelegateSection({ token }: { token: Address }) {
  const { address: account, isConnected } = useAccount();
  const [delegatorInput, setDelegatorInput] = useState("");
  const metadata = useMetadata(token);

  const delegatorValid = isHexAddress(delegatorInput);
  const delegator = delegatorValid ? (delegatorInput.trim() as Address) : undefined;
  const selfDecrypt = !!delegator && !!account && delegator.toLowerCase() === account.toLowerCase();

  const status = useDelegationStatus({
    contractAddress: token,
    delegatorAddress: delegator,
    delegateAddress: account,
  });

  const decryptAs = useDecryptBalanceAs(token);

  function handleDecrypt() {
    if (!delegator || selfDecrypt) return;
    decryptAs.mutate({ delegatorAddress: delegator });
  }

  if (!isConnected || !account) {
    return <div className="callout callout-warn">Connect your wallet to decrypt as a delegate.</div>;
  }

  const isActive = status.data?.isActive === true;

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Delegator&apos;s wallet address</label>
        <input
          value={delegatorInput}
          onChange={(e) => setDelegatorInput(e.target.value)}
          placeholder="0x…"
          className="field font-data mt-2"
          disabled={decryptAs.isPending}
        />
        {delegatorInput && !delegatorValid && (
          <p className="mt-1 text-xs" style={{ color: "var(--err)" }}>
            That doesn&apos;t look like a valid wallet address.
          </p>
        )}
        {selfDecrypt && (
          <p className="mt-1 text-xs" style={{ color: "var(--err)" }}>
            That&apos;s your own wallet — decrypt your own balance from the Verify section above.
          </p>
        )}
      </div>

      {delegatorValid && !selfDecrypt && (
        <div className="panel p-4">
          {status.isLoading && (
            <div className="flex items-center gap-2">
              <span className="redaction inline-block h-4 w-48 rounded" />
            </div>
          )}

          {!status.isLoading && !isActive && (
            <div className="callout callout-warn">
              That wallet hasn&apos;t shared with you — ask them to grant access from their side.
            </div>
          )}

          {!status.isLoading && isActive && !decryptAs.isSuccess && (
            <button
              type="button"
              onClick={handleDecrypt}
              disabled={decryptAs.isPending}
              className="btn btn-seal"
            >
              {decryptAs.isPending ? "Requesting signature…" : "Decrypt their balance"}
            </button>
          )}

          {decryptAs.isPending && (
            <div className="mt-3 flex items-center gap-3">
              <span className="redaction inline-block h-9 w-40 rounded" />
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Requesting your signature to decrypt…
              </p>
            </div>
          )}

          {decryptAs.isError && (
            <ErrorNote
              className="mt-3"
              message={describeDelegatedDecryptError(decryptAs.error).message}
              detail={describeDelegatedDecryptError(decryptAs.error).detail}
            />
          )}

          {decryptAs.isSuccess && (
            <div
              className="unseal-enter mt-3 rounded-[var(--r-lg)] border px-6 py-5"
              style={{
                borderColor: "color-mix(in srgb, var(--gold) 40%, transparent)",
                background: "var(--gold-dim)",
              }}
            >
              <p className="eyebrow">Seal broken — decrypted balance</p>
              <p className="font-display tabular mt-1 text-3xl" style={{ color: "var(--gold-bright)" }}>
                {formatConfidentialAmount(decryptAs.data, metadata.data?.decimals ?? CONFIDENTIAL_DECIMALS)}
              </p>
              <p className="font-data mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                Raw units: {decryptAs.data.toString()} ({metadata.data?.decimals ?? CONFIDENTIAL_DECIMALS} decimals)
              </p>
              <button
                type="button"
                onClick={() => decryptAs.reset()}
                className="btn btn-ghost mt-4 text-xs"
              >
                Decrypt another wallet
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
