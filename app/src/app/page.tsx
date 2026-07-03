import Link from "next/link";
import { HeroDecode } from "@/components/HeroDecode";
import { Reveal } from "@/components/Reveal";

const journey = [
  {
    mark: "I",
    title: "Fund",
    body: "Mint or wrap a confidential ERC-7984 token, then top up the airdrop contract. Only your own wallet ever sees the total.",
    href: "/faucet",
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
      <section className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 pt-20 pb-16 text-center sm:pt-28">
        <div className="hero-aura" aria-hidden />

        <div className="eyebrow flex items-center gap-2">
          <SealMark />
          Zama FHEVM · TokenOps SDK · Sepolia
        </div>

        <h1 className="font-display mt-6 max-w-3xl text-4xl leading-[1.05] sm:text-7xl">
          <HeroDecode text="Every allocation," />
          <br />
          <span
            style={{
              backgroundImage: "var(--gradient-reveal)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
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
          <Link href="/faucet" className="btn btn-quiet px-6 py-3 text-sm">
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
        <div className="mx-auto max-w-5xl px-6 py-16">
          <Reveal>
            <p className="eyebrow text-center">The dossier, in three steps</p>
          </Reveal>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
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
        </div>
      </section>

      <section className="border-t" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto grid max-w-5xl gap-6 px-6 py-16 sm:grid-cols-3">
          <Reveal>
            <Fact label="Encrypted in transit" value="FHE ciphertext" />
          </Reveal>
          <Reveal delay={100}>
            <Fact label="Recipient list" value="Off-chain, packet-only" />
          </Reveal>
          <Reveal delay={200}>
            <Fact label="Decryption" value="Local, wallet-signed" />
          </Reveal>
        </div>

        <Reveal className="mx-auto max-w-5xl px-6 pb-16 text-center">
          <Link href="/guide" className="link-gold text-sm">
            New here? Walk through the full journey →
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 pl-4" style={{ borderColor: "var(--seal)" }}>
      <p className="eyebrow">{label}</p>
      <p className="font-display mt-1 text-lg">{value}</p>
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
