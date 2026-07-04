"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/** If IntersectionObserver never fires (layout quirks, browser bugs, or the
 * element already being off-DOM-flow in a way that never intersects),
 * reveal everything shortly after mount rather than leaving it hidden. */
const SAFETY_TIMEOUT_MS = 1500;

/**
 * Scroll-triggered progressive disclosure. Fades + lifts content into place
 * the first time it enters the viewport.
 *
 * Progressive enhancement: content renders visible by default (no `.reveal`
 * class at all) so screenshots, skimmers, no-JS visitors, and anyone hitting
 * a failed/unsupported IntersectionObserver always see real content instead
 * of a permanent void. Only once this component has mounted on the client
 * does it arm the hidden-until-scrolled-into-view state — and even then, a
 * safety timeout guarantees everything becomes visible within ~1.5s.
 * `prefers-reduced-motion` still short-circuits the animation via the
 * `.reveal`/`.reveal-in` CSS itself.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    setArmed(true);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);

    const timeout = window.setTimeout(() => setVisible(true), SAFETY_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, []);

  const classes = [armed ? "reveal" : "", visible ? "reveal-in" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}>
      {children}
    </div>
  );
}
