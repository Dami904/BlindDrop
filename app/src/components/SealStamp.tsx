import type { ReactNode } from "react";

interface SealStampProps {
  /** Headline shown next to the wax-seal mark, e.g. "Campaign deployed". */
  children: ReactNode;
  className?: string;
}

/**
 * Success-moment treatment: a small wax-seal mark that stamps in next to a
 * headline, in the dossier's own idiom rather than generic confetti. The mark
 * scale-overshoots into place (`.seal-stamp-mark`, see globals.css) — a quick
 * "thunk" like a physical stamp landing — and appears instantly under
 * `prefers-reduced-motion`.
 */
export function SealStamp({ children, className }: SealStampProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <SealStampGlyph />
      <span className="font-display text-base" style={{ color: "var(--text)" }}>
        {children}
      </span>
    </div>
  );
}

function SealStampGlyph() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden
      className="seal-stamp-mark shrink-0"
    >
      <circle cx="15" cy="15" r="13" fill="var(--seal)" stroke="var(--gold)" strokeWidth="1.5" />
      <circle cx="15" cy="15" r="9.5" fill="none" stroke="var(--gold-bright)" strokeWidth="0.75" opacity="0.6" />
      <path
        d="M15 7.5l2.1 4.4 4.8.6-3.5 3.3.9 4.8-4.3-2.3-4.3 2.3.9-4.8-3.5-3.3 4.8-.6L15 7.5z"
        fill="var(--gold-bright)"
      />
    </svg>
  );
}
