"use client";

import Link from "next/link";
import { useState } from "react";
import { Collapsible, ChevronIcon } from "@/components/Collapsible";

interface Step {
  n: number;
  title: string;
  oneLiner: string;
  href: string;
  cta: string;
  what: string;
  crypto: string;
}

const steps: Step[] = [
  {
    n: 1,
    title: "Get test tokens",
    oneLiner: "Mint TTT and its confidential wrapper CTTT to your wallet.",
    href: "/#faucet",
    cta: "Jump to the faucet",
    what: "Mint TTT and its confidential ERC-7984 wrapper, CTTT, straight to your wallet.",
    crypto:
      "Minting the confidential token creates an encrypted balance on-chain — the amount is public here, but your total balance is stored as ciphertext from this point on.",
  },
  {
    n: 2,
    title: "Create a distribution",
    oneLiner: "List recipients, deploy an airdrop contract, and fund it.",
    href: "/create",
    cta: "Start creating",
    what: "List recipients, deploy an airdrop contract, and fund it with the total allocation.",
    crypto:
      "Each recipient's amount gets encrypted client-side before it ever reaches the network, so no observer — including this app — can see who gets how much.",
  },
  {
    n: 3,
    title: "Share claim packets",
    oneLiner: "One sealed packet per recipient: ciphertext plus a signature.",
    href: "/create",
    cta: "Generate packets",
    what: "BlindDrop seals one claim packet per recipient: an encrypted amount plus an admin signature authorizing them alone to claim it.",
    crypto:
      "The packet is just ciphertext and a signature — send it by any channel you like, it reveals nothing to anyone but its intended recipient.",
  },
  {
    n: 4,
    title: "Recipient claims",
    oneLiner: "Drop the packet in and submit from the wallet it was issued to.",
    href: "/claim",
    cta: "Go to claim",
    what: "The recipient drops their packet in and submits it from the exact wallet it was issued to.",
    crypto:
      "The claim transaction moves the encrypted amount on-chain without ever decrypting it — the contract operates on ciphertext directly.",
  },
  {
    n: 5,
    title: "Verify & decrypt",
    oneLiner: "Read the new balance and decrypt it locally, wallet-signed.",
    href: "/claim#verify",
    cta: "Verify a balance",
    what: "The recipient reads their new confidential balance and decrypts it locally.",
    crypto:
      "A wallet-signed request lets the Zama relayer decrypt just that one balance for that one signer — the plaintext number never leaves the recipient's browser.",
  },
];

/**
 * Compact accordion replacing five fully-stacked "how it works" blocks.
 * Only one step's detail is expanded at a time, so the section reads as a
 * short list of titles + one-liners until the visitor asks for more.
 */
export function HowItWorksAccordion() {
  const [openStep, setOpenStep] = useState<number | null>(null);

  return (
    <div className="mt-10 flex flex-col divide-y" style={{ borderColor: "var(--line)" }}>
      {steps.map((step) => {
        const open = openStep === step.n;
        return (
          <div key={step.n} className="border-t first:border-t-0" style={{ borderColor: "var(--line)" }}>
            <Collapsible
              open={open}
              onOpenChange={(next) => setOpenStep(next ? step.n : null)}
              triggerClassName="flex w-full items-center gap-4 py-4 text-left"
              trigger={
                <>
                  <span className="seal-badge shrink-0" data-state={open ? "active" : undefined}>
                    {step.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-display block text-base">{step.title}</span>
                    <span className="mt-0.5 block truncate text-xs sm:text-sm" style={{ color: "var(--text-dim)" }}>
                      {step.oneLiner}
                    </span>
                  </span>
                  <ChevronIcon open={open} />
                </>
              }
            >
              <div className="pb-6 pl-11">
                <p className="text-sm" style={{ color: "var(--text)" }}>
                  {step.what}
                </p>
                <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
                  <span className="eyebrow mr-1" style={{ fontSize: "0.625rem" }}>
                    Under the hood
                  </span>
                  {step.crypto}
                </p>
                <Link href={step.href} className="link-gold mt-3 inline-block text-sm">
                  {step.cta} →
                </Link>
              </div>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
