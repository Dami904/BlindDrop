"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClaimPanel } from "@/components/ClaimPanel";
import { VerifyPanel } from "@/components/VerifyPanel";

function ClaimContent() {
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token") ?? "";

  const [verifyToken, setVerifyToken] = useState(tokenFromQuery);
  const verifySectionRef = useRef<HTMLDivElement>(null);

  const handleClaimed = useCallback((token: string) => {
    setVerifyToken(token);
    // Scroll the now-prefilled verify section into view instead of linking away.
    requestAnimationFrame(() => {
      verifySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">Recipient intake</p>
      <h1 className="font-display mt-2 text-3xl">Claim Tokens</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Open the claim packet your airdrop admin gave you, then submit it from the connected
        wallet it was issued to.
      </p>

      <ClaimPanel onClaimed={handleClaimed} />

      <div ref={verifySectionRef} id="verify" className="divider-stamped mt-16 pt-16 scroll-mt-20">
        <p className="eyebrow">The unsealing</p>
        <h2 className="font-display mt-2 text-3xl">Verify your allocation</h2>
        <p className="mt-3" style={{ color: "var(--text-dim)" }}>
          Read your confidential ERC-7984 balance and decrypt it locally via the Zama relayer.
          Only the connected wallet can decrypt its own balance — no one else, including this app,
          can see the plaintext amount.
        </p>

        <VerifyPanel initialToken={verifyToken} />
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
