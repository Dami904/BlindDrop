"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Tiny accessible jargon tooltip: a small "?" button that toggles a
 * positioned note on click or keyboard activation. Escape and click-outside
 * close it. No dependencies — plain button + absolutely-positioned panel.
 */
export function InfoTip({ label, note }: { label: string; note: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`What is ${label}?`}
        className="mx-1 inline-flex h-[1.05rem] w-[1.05rem] items-center justify-center rounded-full border align-text-bottom font-data text-[0.65rem] leading-none transition-colors"
        style={{
          borderColor: open ? "var(--gold)" : "var(--line-strong)",
          color: open ? "var(--gold-bright)" : "var(--text-dim)",
          background: open ? "var(--gold-dim)" : "transparent",
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-1/2 z-30 mt-1.5 block w-60 -translate-x-1/2 rounded-[var(--r-md)] border p-3 text-left text-xs leading-relaxed normal-case tracking-normal shadow-lg"
          style={{
            borderColor: "var(--line-strong)",
            background: "var(--paper)",
            color: "var(--text-dim)",
            boxShadow: "var(--shadow-card)",
            top: "100%",
          }}
        >
          <span className="font-data block text-[0.65rem] uppercase tracking-wide" style={{ color: "var(--gold)" }}>
            {label}
          </span>
          <span className="mt-1 block">{note}</span>
        </span>
      )}
    </span>
  );
}
