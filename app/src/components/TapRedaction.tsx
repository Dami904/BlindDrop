"use client";

import { useState, type ReactNode } from "react";

/**
 * A redacted span that reveals on hover (pointer devices, via CSS) AND
 * toggles on click/tap or Enter/Space — hover alone is dead on touch
 * devices. `aria-pressed` mirrors the toggled state; the CSS rule
 * `.redaction-reveal[aria-pressed="true"]` keeps it revealed without hover.
 */
export function TapRedaction({ className, children }: { className?: string; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={revealed}
      title="Hover or tap to reveal — that's the point: only you can."
      onClick={() => setRevealed((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setRevealed((v) => !v);
        }
      }}
      className={`redaction redaction-reveal ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
