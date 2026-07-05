"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import {
  useAirdropIsPaused,
  useSetPaused,
  useWithdraw,
  FheHandleNotAllowedError,
} from "@tokenops/sdk/fhe-airdrop/react";
import type { DeployedCampaign } from "@/components/create/CampaignStep";
import { TxStatusLine, TxHashLink } from "@/components/TxStatus";
import { ErrorNote } from "@/components/ErrorNote";
import { describeMutationError, type FriendlyError } from "@/lib/errors";

interface CampaignControlsProps {
  deployed: DeployedCampaign;
}

/**
 * Admin-only, collapsed "Campaign controls" section — pause/resume claims
 * and sweep the remaining pool back to the admin. Only rendered by the
 * caller when the connected wallet matches `deployed.admin`; this component
 * additionally guards its own mutations against that same check so a stale
 * render (e.g. wallet switched mid-session) can't fire an admin-only tx.
 */
export function CampaignControls({ deployed }: CampaignControlsProps) {
  const { address } = useAccount();

  const isPaused = useAirdropIsPaused({ address: deployed.airdrop });
  const setPaused = useSetPaused({ address: deployed.airdrop });
  const withdraw = useWithdraw({ address: deployed.airdrop });

  const [pauseError, setPauseError] = useState<FriendlyError | null>(null);
  const [withdrawError, setWithdrawError] = useState<FriendlyError | null>(null);
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);

  const now = Math.floor(Date.now() / 1000);
  const claimWindowEnded = deployed.endTimestamp < now;

  async function togglePaused() {
    if (!address) return;
    setPauseError(null);
    try {
      await setPaused.mutateAsync({ paused: !isPaused.data });
      await isPaused.refetch();
    } catch (err) {
      setPauseError(
        describeMutationError(err, "Couldn't update the pause state — you can try again.")
      );
    }
  }

  async function sweep() {
    if (!address) return;
    if (!claimWindowEnded) {
      const ok = window.confirm(
        "Sweeping now pulls the entire remaining pool — recipients who haven't claimed will no longer be able to. Continue?"
      );
      if (!ok) return;
    }
    setWithdrawError(null);
    setWithdrawTx(null);
    try {
      const hash = await withdraw.mutateAsync({ recipient: address });
      setWithdrawTx(hash);
    } catch (err) {
      if (err instanceof FheHandleNotAllowedError) {
        setWithdrawError({ message: "This campaign's pool is empty or was never funded." });
        return;
      }
      setWithdrawError(
        describeMutationError(err, "Couldn't sweep the pool — you can try again.")
      );
    }
  }

  return (
    <details className="panel p-4">
      <summary className="cursor-pointer font-data text-xs tracking-wide uppercase" style={{ color: "var(--text-dim)" }}>
        Campaign controls
      </summary>

      <div className="mt-4 flex flex-col gap-6">
        {/* Pause / resume */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm" style={{ color: "var(--text)" }}>
                {isPaused.isLoading
                  ? "Checking pause status…"
                  : isPaused.data
                    ? "Claims are paused"
                    : "Claims are active"}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
                Paused campaigns reject all claims until resumed.
              </p>
            </div>
            {/* Once swept in-session the pool is empty, so pausing/resuming is
                moot — replace the control with a quiet note rather than offer a
                no-op action. The un-swept flow is untouched. */}
            {withdrawTx ? (
              <p className="shrink-0 text-xs" style={{ color: "var(--text-faint)" }}>
                Pool swept — nothing left to claim or pause.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void togglePaused()}
                disabled={isPaused.isLoading || setPaused.isPending}
                className="btn btn-gold shrink-0 text-xs"
              >
                {setPaused.isPending
                  ? isPaused.data
                    ? "Resuming…"
                    : "Pausing…"
                  : isPaused.data
                    ? "Resume claims"
                    : "Pause claims"}
              </button>
            )}
          </div>
          {!withdrawTx && <TxStatusLine awaitingWallet={setPaused.isPending} className="mt-2" />}
          {pauseError && (
            <ErrorNote className="mt-2" message={pauseError.message} detail={pauseError.detail} />
          )}
        </div>

        {/* Sweep unclaimed tokens */}
        <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm" style={{ color: "var(--text)" }}>
                Sweep unclaimed tokens
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
                {claimWindowEnded
                  ? "The claim window has ended — pulls the entire remaining pool back to your wallet."
                  : "The claim window is still open — sweeping early cuts off anyone who hasn't claimed yet."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void sweep()}
              disabled={withdraw.isPending}
              className="btn btn-ghost shrink-0 text-xs"
            >
              {withdraw.isPending ? "Sweeping…" : "Sweep pool"}
            </button>
          </div>
          <TxStatusLine awaitingWallet={withdraw.isPending} className="mt-2" />
          {withdrawTx && (
            <p className="mt-2 text-xs" style={{ color: "var(--ok)" }}>
              Pool swept. <TxHashLink hash={withdrawTx} />
            </p>
          )}
          {withdrawError && (
            <ErrorNote className="mt-2" message={withdrawError.message} detail={withdrawError.detail} />
          )}
        </div>
      </div>
    </details>
  );
}
