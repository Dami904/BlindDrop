"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GUIDE_SCRIPTS, JOURNEY_STEPS, getGuideScript } from "@/lib/guideScripts";

const STORAGE_KEY = "blinddrop:guide-widget:visited";

/** Routes that never show the widget. Currently none — the home page now
 * also hosts the "How it works" walkthrough and faucet, so it gets a short
 * welcome/overview script like every other route. */
const EXCLUDED_ROUTES = new Set<string>([]);

/**
 * "The Archivist" — a floating dossier assistant docked bottom-right on
 * desktop (bottom sheet on mobile). Explains the current page's place in the
 * 5-step journey with a short staggered script of message bubbles, plus
 * quick-reply navigation chips to jump between steps.
 */
export function GuideWidget() {
  const pathname = usePathname();
  const script = pathname ? getGuideScript(pathname) : undefined;

  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [beckon, setBeckon] = useState(false);

  // Never auto-open (a panel over the hero is a hostile first impression).
  // Instead, on the user's first ever visit, pulse the launcher and show a
  // small dismissable hint bubble inviting them in.
  useEffect(() => {
    if (!script) return;
    try {
      const visited = window.localStorage.getItem(STORAGE_KEY);
      if (!visited) {
        setBeckon(true);
        window.localStorage.setItem(STORAGE_KEY, "1");
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — skip the hint.
    }
    // Only ever evaluate this once per mount of a scripted route sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // The hint retires as soon as the guide is opened once.
  useEffect(() => {
    if (open) setBeckon(false);
  }, [open]);

  // Reset + stagger the message reveal whenever the panel opens on a new script.
  useEffect(() => {
    if (!open || !script) return;
    setVisibleCount(0);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setVisibleCount(script.messages.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    script.messages.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleCount((c) => Math.max(c, i + 1));
        }, 420 * (i + 1))
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [open, script, pathname]);

  // Focus trap + Escape-to-close while open.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    panel?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        launcherRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!pathname || EXCLUDED_ROUTES.has(pathname)) return null;
  if (!script) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-end px-3 pb-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:p-0">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="The Archivist — page guide"
          tabIndex={-1}
          className="panel unseal-enter flex max-h-[70vh] w-full flex-col overflow-hidden sm:mb-3 sm:w-[22rem]"
        >
          <div className="divider-stamped flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="seal-badge" data-state="active" aria-hidden="true">
                ?
              </span>
              <div>
                <p className="font-display text-sm" style={{ color: "var(--gold)" }}>
                  The Archivist
                </p>
                <p className="font-data text-[0.6875rem]" style={{ color: "var(--text-faint)" }}>
                  {script.step ? `step ${script.step} of 5` : script.label}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                launcherRef.current?.focus();
              }}
              aria-label="Close guide"
              className="btn-quiet"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {script.messages.slice(0, visibleCount).map((m, i) => (
              <div key={i} className="panel-paper unseal-enter px-3 py-2 text-sm leading-snug">
                {m.text}
              </div>
            ))}
            {visibleCount >= script.messages.length && script.nextHref && script.nextLabel && (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                <Link href={script.nextHref} className="link-gold">
                  {script.nextLabel} →
                </Link>
              </p>
            )}
          </div>

          <div className="divider-stamped px-4 py-3">
            <p className="eyebrow mb-2">jump to step</p>
            <div className="flex flex-wrap gap-1.5">
              {JOURNEY_STEPS.map((s) => (
                <Link
                  key={`${s.step}-${s.href}`}
                  href={s.href}
                  className="btn btn-ghost"
                  style={
                    script.step === s.step
                      ? { borderColor: "var(--gold)", color: "var(--gold)" }
                      : undefined
                  }
                  aria-current={script.step === s.step ? "step" : undefined}
                >
                  {s.step}. {s.label}
                </Link>
              ))}
              <Link href="/#how-it-works" className="btn btn-ghost">
                Open full guide
              </Link>
            </div>
          </div>
        </div>
      )}

      <span className="flex items-end gap-2">
        {beckon && !open && (
          <span
            className="panel-paper unseal-enter hidden px-3 py-1.5 text-xs sm:inline-block"
            style={{ color: "var(--callout-gold-text)" }}
          >
            First time? The Archivist can walk you through.
          </span>
        )}
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close the Archivist guide" : "Open the Archivist guide"}
          aria-expanded={open}
          className={`seal-badge h-11 w-11 shrink-0 !text-base shadow-lg ${beckon && !open ? "guide-beckon" : ""}`}
          data-state={open ? "active" : undefined}
        >
          {open ? "✕" : "?"}
        </button>
      </span>
    </div>
  );
}

// Re-export for convenience where a caller only needs script lookup, keeping
// the widget as the single import surface for guide-related UI.
export { GUIDE_SCRIPTS };
