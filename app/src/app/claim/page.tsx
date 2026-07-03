"use client";

import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClaimPanel } from "@/components/ClaimPanel";
import { VerifyPanel } from "@/components/VerifyPanel";
import { Stepper, type StepDef } from "@/components/Stepper";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";

function ClaimContent() {
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token") ?? "";

  const [verifyToken, setVerifyToken] = useState(tokenFromQuery);
  const [packetLoaded, setPacketLoaded] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [verified, setVerified] = useState(false);
  // Deep link (?token=) opens the verify section immediately; otherwise it
  // stays dimmed/collapsed until the claim succeeds or the visitor opens it.
  const [verifyOpen, setVerifyOpen] = useState(!!tokenFromQuery);
  const verifySectionRef = useRef<HTMLDivElement>(null);

  const handlePacketLoaded = useCallback(() => setPacketLoaded(true), []);

  const handleClaimed = useCallback((token: string) => {
    setClaimed(true);
    setVerifyToken(token);
    setVerifyOpen(true);
    // Scroll the now-prefilled verify section into view instead of linking away.
    requestAnimationFrame(() => {
      verifySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const handleVerified = useCallback(() => setVerified(true), []);

  const steps: StepDef[] = useMemo(
    () => [
      { label: "Load packet", state: packetLoaded ? "done" : "active" },
      { label: "Claim", state: claimed ? "done" : packetLoaded ? "active" : "idle" },
      { label: "Verify & decrypt", state: verified ? "done" : claimed ? "active" : "idle" },
    ],
    [packetLoaded, claimed, verified]
  );

  const verifyReachable = claimed || verifyOpen;

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">Recipient intake</p>
      <h1 className="font-display mt-2 text-3xl">Claim Tokens</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Open the claim packet your airdrop admin gave you, then submit it from the connected
        wallet it was issued to.
      </p>

      <div className="mt-8">
        <Stepper steps={steps} />
      </div>

      <div className="mt-10">
        <ClaimPanel onClaimed={handleClaimed} onPacketLoaded={handlePacketLoaded} />
      </div>

      <div ref={verifySectionRef} id="verify" className="divider-stamped mt-20 pt-16 scroll-mt-20">
        <Collapsible
          open={verifyOpen}
          onOpenChange={setVerifyOpen}
          triggerClassName="flex w-full items-start justify-between gap-4 text-left"
          trigger={
            <>
              <span style={{ opacity: verifyReachable ? 1 : 0.55 }}>
                <span className="eyebrow">Stage 3 · The unsealing</span>
                <h2 className="font-display mt-2 text-3xl">Verify your allocation</h2>
                <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
                  Read your confidential ERC-7984 balance and decrypt it locally via the Zama
                  relayer. Only the connected wallet can decrypt its own balance — no one else,
                  including this app, can see the plaintext amount.
                </p>
                {!verifyReachable && (
                  <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
                    Unlocks after you claim, or open it early ↓
                  </p>
                )}
              </span>
              <span className="mt-1 shrink-0" style={{ color: "var(--text-dim)" }}>
                <ChevronIcon open={verifyOpen} />
              </span>
            </>
          }
        >
          <div className="pt-8">
            <VerifyPanel initialToken={verifyToken} onVerified={handleVerified} />
          </div>
        </Collapsible>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimContent />
    </Suspense>
  );
}
