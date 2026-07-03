"use client";

import { useId, useState, type ReactNode } from "react";

export interface CollapsibleProps {
  /** Always-visible trigger content — rendered inside the toggle button. */
  trigger: ReactNode;
  children: ReactNode;
  /** Uncontrolled initial state (ignored once `open` is supplied). */
  defaultOpen?: boolean;
  /** Controlled open state. Omit for uncontrolled usage. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Disables the trigger (e.g. a future step that can't be opened yet). */
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
}

/**
 * Minimal, accessible disclosure widget shared by the home "how it works"
 * strip, the faucet card, and the per-step summaries on /disperse. Uses a
 * CSS grid-rows trick for a smooth open/close transition (which the global
 * prefers-reduced-motion rule in globals.css already zeroes out), and marks
 * the collapsed panel `inert` so it drops out of the tab order while hidden.
 */
export function Collapsible({
  trigger,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  disabled = false,
  className = "",
  triggerClassName = "",
  panelClassName = "",
}: CollapsibleProps) {
  const [openState, setOpenState] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const panelId = useId();

  function toggle() {
    if (disabled) return;
    const next = !open;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={toggle}
        className={triggerClassName || "flex w-full items-center justify-between gap-3 text-left"}
      >
        {trigger}
      </button>
      <div
        id={panelId}
        role="region"
        inert={!open ? true : undefined}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        } ${panelClassName}`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
