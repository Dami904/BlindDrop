"use client";

import { useEffect, useState } from "react";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";
import { FaucetPanel } from "@/components/FaucetPanel";

/**
 * The faucet, collapsed by default so it doesn't dominate the home page.
 * Auto-expands (and stays in sync) whenever the URL hash is `#faucet`,
 * whether that's on first load or a same-page hash change (e.g. clicking
 * one of the "Need test tokens?" links elsewhere on the page).
 */
export function FaucetSection() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function syncFromHash() {
      if (window.location.hash === "#faucet") setOpen(true);
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <div className="panel">
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        triggerClassName="flex w-full items-center justify-between gap-4 p-6 text-left"
        panelClassName=""
        trigger={
          <>
            <span className="min-w-0 flex-1">
              <span className="eyebrow">Optional · Sepolia testnet</span>
              <span className="font-display mt-1 block text-xl">Need test tokens?</span>
              {!open && (
                <span className="mt-1 block text-sm" style={{ color: "var(--text-dim)" }}>
                  Claim the TTT / CTTT test-token pair to try the full flow.
                </span>
              )}
            </span>
            <ChevronIcon open={open} />
          </>
        }
      >
        <div className="px-6 pb-6">
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Claim the TokenOps test-token pair on Sepolia — TTT (plain ERC-20) and CTTT (its
            ERC-7984 confidential wrapper) — so you can go from zero to a full confidential
            distribution demo in minutes.
          </p>
          <FaucetPanel />
        </div>
      </Collapsible>
    </div>
  );
}
