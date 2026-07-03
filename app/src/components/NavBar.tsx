import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";

const links = [
  { href: "/create", label: "Create" },
  { href: "/claim", label: "Claim" },
  { href: "/verify", label: "Verify" },
  { href: "/disperse", label: "Disperse" },
  { href: "/faucet", label: "Faucet" },
];

export function NavBar() {
  return (
    <header className="border-b border-zinc-800 bg-black/40 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-50">
          Shield<span className="text-emerald-400">Drop</span>
        </Link>
        <div className="hidden items-center gap-6 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <ConnectButton />
      </nav>
    </header>
  );
}
