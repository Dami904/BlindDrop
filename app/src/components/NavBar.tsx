"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { ConnectButton } from "@/components/ConnectButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/create", label: "Create" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/claim", label: "Claim & Verify" },
  { href: "/disperse", label: "Disperse" },
];

export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        borderColor: "var(--line)",
        background: "var(--header-bg)",
        backdropFilter: "blur(10px)",
      }}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-4 min-[480px]:gap-4 min-[480px]:px-6">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="font-display text-lg tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Blind<span style={{ color: "var(--seal)" }}>Drop</span>
        </Link>
        <div className="hidden items-center gap-1 min-[480px]:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className="relative px-3 py-2 font-data text-xs tracking-wide uppercase transition-colors"
                style={{ color: active ? "var(--gold)" : "var(--text-dim)" }}
              >
                {link.label}
                {active && (
                  <span
                    className="absolute inset-x-2 -bottom-[1px] h-[2px]"
                    style={{ background: "var(--gold)" }}
                  />
                )}
              </Link>
            );
          })}
        </div>
        <div className="flex min-w-0 shrink items-center gap-2">
          <ThemeToggle className="!hidden min-[480px]:!inline-flex" />
          <NetworkBadge className="!hidden min-[480px]:!inline-flex" />
          <ConnectButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="btn btn-ghost px-2.5 py-2.5 min-[480px]:!hidden"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="border-t px-6 py-3 min-[480px]:hidden"
          style={{ borderColor: "var(--line)", background: "var(--ink-1)" }}
        >
          <div className="flex flex-col gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className="rounded-[var(--r-sm)] px-3 py-2.5 font-data text-sm uppercase tracking-wide"
                  style={{
                    color: active ? "var(--gold)" : "var(--text-dim)",
                    background: active ? "var(--gold-dim)" : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
            <MobileNetworkRow />
            <div className="mt-2 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <span className="font-data text-xs uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
                Theme
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * Connection-aware network badge shown next to the wallet button. On Sepolia
 * it's a quiet ok-dot confirmation; on any other chain it becomes a warn
 * button that switches the wallet back to Sepolia. Hidden while disconnected.
 */
function NetworkBadge({ className }: { className?: string }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) return null;

  if (chainId === sepolia.id) {
    return (
      <span
        className={`items-center gap-1.5 rounded-[var(--r-sm)] border px-2 py-1 font-data text-[0.65rem] uppercase tracking-wide ${className ?? "inline-flex"}`}
        style={{
          borderColor: "var(--line)",
          background: "var(--ok-dim)",
          color: "var(--callout-ok-text)",
        }}
        title="Connected to Sepolia"
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--ok)" }}
        />
        ⌗ Sepolia
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => switchChain({ chainId: sepolia.id })}
      disabled={isPending}
      className={`items-center gap-1.5 rounded-[var(--r-sm)] border px-2 py-1 font-data text-[0.65rem] uppercase tracking-wide ${className ?? "inline-flex"}`}
      style={{
        borderColor: "var(--warn)",
        background: "var(--warn-dim)",
        color: "var(--callout-warn-text)",
      }}
      title="Switch to Sepolia"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--warn)" }}
      />
      {isPending ? "Switching…" : "Wrong network"}
    </button>
  );
}

/** Mobile-menu row for the network badge — mirrors the Theme row layout. */
function MobileNetworkRow() {
  const { isConnected } = useAccount();
  if (!isConnected) return null;
  return (
    <div className="mt-2 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--line)" }}>
      <span className="font-data text-xs uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
        Network
      </span>
      <NetworkBadge />
    </div>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {open ? (
        <path d="M2 2 14 14M14 2 2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
