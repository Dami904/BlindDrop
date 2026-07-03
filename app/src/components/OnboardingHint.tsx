"use client";

import Link from "next/link";
import { useState } from "react";

interface OnboardingHintProps {
  step: number;
  total: number;
  title: string;
  body: string;
  nextHref?: string;
  nextLabel?: string;
}

/**
 * Small dismissible strip that orients a first-time visitor: which step of
 * the fund → create → claim → verify journey this page represents, and
 * what to do next. Purely presentational — no effect on page logic.
 */
export function OnboardingHint({ step, total, title, body, nextHref, nextLabel }: OnboardingHintProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="callout callout-gold mt-6" style={{ justifyContent: "space-between" }}>
      <div className="flex items-start gap-3">
        <span className="seal-badge shrink-0" data-state="active">
          {step}
        </span>
        <div>
          <p className="font-display text-sm" style={{ color: "var(--gold-bright)" }}>
            {title}
            <span className="ml-2 font-data text-xs font-normal" style={{ color: "var(--text-faint)" }}>
              step {step} of {total}
            </span>
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            {body}
            {nextHref && nextLabel && (
              <>
                {" "}
                <Link href={nextHref} className="link-gold">
                  {nextLabel} →
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss guide"
        className="shrink-0 text-xs"
        style={{ color: "var(--text-faint)" }}
      >
        ✕
      </button>
    </div>
  );
}
