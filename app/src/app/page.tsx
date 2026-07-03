import Link from "next/link";
import { HeroDecode } from "@/components/HeroDecode";
import { Reveal } from "@/components/Reveal";
import { HowItWorksAccordion } from "@/components/HowItWorksAccordion";
import { FaucetSection } from "@/components/FaucetSection";

const journey = [
  {
    mark: "I",
    title: "Fund",
    body: "Mint or wrap a confidential ERC-7984 token, then top up the airdrop contract. Only your own wallet ever sees the total.",
    href: "/#faucet",
    cta: "Get testnet tokens",
  },
  {
    mark: "II",
    title: "Create",
    body: "Deploy a distribution, list recipients, and seal each allocation as an encrypted claim packet — one per address.",
    href: "/create",
    cta: "Start a distribution",
  },
  {
    mark: "III",
    title: "Claim & Verify",
    body: "Recipients open their packet and claim in one transaction, then decrypt their balance locally to see the plaintext amount.",
    href: "/claim",
    cta: "Claim an allocation",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 pt-20 pb-16 text-center sm:pt-28">
        <div className="eyebrow flex items-center gap-2">
          <SealMark />
          Zama FHEVM · TokenOps SDK · Sepolia
        </div>

        <h1 className="font-display mt-6 max-w-3xl text-4xl leading-tight sm:text-6xl">
          <HeroDecode text="Every allocation," />
          <br />
          <span style={{ color: "var(--gold)" }}>
            <HeroDecode text="sealed" /> until opened.
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-base sm:text-lg" style={{ color: "var(--text-dim)" }}>
          BlindDrop distributes tokens with fully homomorphic encryption. Amounts stay
          encrypted end-to-end, the recipient list never touches the chain, and only the
          person holding a claim packet can ever unseal their own number.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/create" className="btn btn-seal px-6 py-3 text-sm">
            Create a distribution
          </Link>
          <Link href="/claim" className="btn btn-ghost px-6 py-3 text-sm">
            Claim tokens
          </Link>
          <Link href="/#faucet" className="btn btn-quiet px-6 py-3 text-sm">
            Need test tokens? Faucet →
          </Link>
        </div>

        <div className="mt-16 flex items-center gap-3 text-xs" style={{ color: "var(--text-faint)" }}>
          <span className="redaction px-2 py-0.5">recipient list</span>
          <span>never leaves your browser</span>
          <span aria-hidden>·</span>
          <span className="redaction px-2 py-0.5 tabular">1,204.50</span>
          <span>only the recipient can decrypt</span>
        </div>
      </section>

      <section className="border-t" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-5xl px-6 py-20">
          <Reveal>
            <p className="eyebrow text-center">The dossier, in three steps</p>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {journey.map((step, i) => (
              <Reveal key={step.title} delay={i * 120}>
                <div className="panel flex h-full flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span className="seal-badge" data-state={i === 0 ? "active" : undefined}>
                      {step.mark}
                    </span>
                    <h2 className="font-display text-lg">{step.title}</h2>
                  </div>
                  <p className="mt-3 flex-1 text-sm" style={{ color: "var(--text-dim)" }}>
                    {step.body}
                  </p>
                  <Link href={step.href} className="link-gold mt-5 text-sm">
                    {step.cta} →
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-10 text-center">
            <Link href="/#how-it-works" className="link-gold text-sm">
              New here? Walk through the full journey ↓
            </Link>
          </Reveal>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-t" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-3xl px-6 py-20">
          <Reveal>
            <p className="eyebrow">Orientation</p>
          </Reveal>
          <Reveal delay={60}>
            <h2 className="font-display mt-2 text-3xl">How BlindDrop works</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="mt-3" style={{ color: "var(--text-dim)" }}>
              Five steps, start to finish. Tap a step for what&apos;s actually happening
              cryptographically underneath.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <HowItWorksAccordion />
          </Reveal>

          <Reveal delay={200} className="divider-stamped mt-10 pt-6 text-center">
            <Link href="/#faucet" className="btn btn-seal">
              Begin at step one →
            </Link>
          </Reveal>
        </div>
      </section>

      <section id="faucet" className="scroll-mt-20 border-t" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-3xl px-6 py-20">
          <Reveal>
            <FaucetSection />
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function SealMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="var(--seal-bright)" strokeWidth="1.5" />
      <path
        d="M12 6.5 13.4 9.9 17 10.3 14.3 12.7 15.1 16.3 12 14.4 8.9 16.3 9.7 12.7 7 10.3 10.6 9.9Z"
        fill="var(--seal-bright)"
      />
    </svg>
  );
}
