import Link from "next/link";
import { Reveal } from "@/components/Reveal";

const steps = [
  {
    n: 1,
    title: "Get test tokens",
    href: "/faucet",
    cta: "Open the faucet",
    what: "Mint TTT and its confidential ERC-7984 wrapper, CTTT, straight to your wallet.",
    crypto:
      "Minting the confidential token creates an encrypted balance on-chain — the amount is public here, but your total balance is stored as ciphertext from this point on.",
  },
  {
    n: 2,
    title: "Create a distribution",
    href: "/create",
    cta: "Start creating",
    what: "List recipients, deploy an airdrop contract, and fund it with the total allocation.",
    crypto:
      "Each recipient's amount gets encrypted client-side before it ever reaches the network, so no observer — including this app — can see who gets how much.",
  },
  {
    n: 3,
    title: "Share claim packets",
    href: "/create",
    cta: "Generate packets",
    what: "BlindDrop seals one claim packet per recipient: an encrypted amount plus an admin signature authorizing them alone to claim it.",
    crypto:
      "The packet is just ciphertext and a signature — send it by any channel you like, it reveals nothing to anyone but its intended recipient.",
  },
  {
    n: 4,
    title: "Recipient claims",
    href: "/claim",
    cta: "Go to claim",
    what: "The recipient drops their packet in and submits it from the exact wallet it was issued to.",
    crypto:
      "The claim transaction moves the encrypted amount on-chain without ever decrypting it — the contract operates on ciphertext directly.",
  },
  {
    n: 5,
    title: "Verify & decrypt",
    href: "/verify",
    cta: "Verify a balance",
    what: "The recipient reads their new confidential balance and decrypts it locally.",
    crypto:
      "A wallet-signed request lets the Zama relayer decrypt just that one balance for that one signer — the plaintext number never leaves the recipient's browser.",
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-16">
      <p className="eyebrow">Orientation</p>
      <h1 className="font-display mt-2 text-3xl">How BlindDrop works</h1>
      <p className="mt-3" style={{ color: "var(--text-dim)" }}>
        Five steps, start to finish — from minting test tokens to a recipient decrypting their
        own allocation. Each step notes what's actually happening cryptographically underneath.
      </p>

      <ol className="mt-10 flex flex-col gap-6">
        {steps.map((step, i) => (
          <li key={step.n}>
            <Reveal delay={i * 90}>
              <div className="panel flex gap-4 p-5">
                <span className="seal-badge shrink-0" data-state={i === 0 ? "active" : undefined}>
                  {step.n}
                </span>
                <div>
                  <h2 className="font-display text-lg">{step.title}</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--text)" }}>
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
              </div>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal delay={steps.length * 90} className="divider-stamped mt-10 pt-6 text-center">
        <Link href="/faucet" className="btn btn-seal">
          Begin at step one →
        </Link>
      </Reveal>
    </div>
  );
}
