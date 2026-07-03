"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";

const links = [
  { href: "/guide", label: "Guide" },
  { href: "/create", label: "Create" },
  { href: "/claim", label: "Claim" },
  { href: "/verify", label: "Verify" },
  { href: "/disperse", label: "Disperse" },
  { href: "/faucet", label: "Faucet" },
];

export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        borderColor: "var(--line)",
        background: "rgba(11,13,16,0.82)",
        backdropFilter: "blur(10px)",
      }}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="font-display text-lg tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Blind<span style={{ color: "var(--seal-bright)" }}>Drop</span>
        </Link>
        <div className="hidden items-center gap-1 sm:flex">
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
        <div className="flex items-center gap-2">
          <ConnectButton />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="btn btn-ghost px-2.5 py-2.5 sm:hidden"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="border-t px-6 py-3 sm:hidden"
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
          </div>
        </div>
      )}
    </header>
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
