import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="mb-4 text-sm font-medium uppercase tracking-widest text-emerald-400">
        Built on Zama FHEVM · TokenOps · Sepolia
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
        Confidential airdrops, end to end.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-zinc-400">
        ShieldDrop encrypts distribution amounts with fully homomorphic
        encryption and keeps recipient lists off-chain — token creators
        disperse in private, and recipients claim without ever exposing
        the size of the drop.
      </p>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/create"
          className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
        >
          Create an Airdrop
        </Link>
        <Link
          href="/claim"
          className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-900"
        >
          Claim Tokens
        </Link>
      </div>
    </div>
  );
}
