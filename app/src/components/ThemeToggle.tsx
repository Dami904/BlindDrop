"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "blinddrop:theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private mode etc.) — theme just won't persist.
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  // Rendered content depends on data-theme, which is stamped by an inline
  // script before hydration — read it only after mount to avoid a mismatch.
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? (theme === "dark" ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
      className={`btn btn-ghost px-2.5 py-2.5 ${className ?? ""}`}
    >
      {!mounted ? (
        <span className="inline-block h-4 w-4" aria-hidden />
      ) : theme === "dark" ? (
        <SunIcon />
      ) : (
        <LampIcon />
      )}
    </button>
  );
}

/* dark mode active → show the sun (click to switch to daylight) */
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.13 1.13M4.23 11.77 3.1 12.9M12.9 12.9l-1.13-1.13M4.23 4.23 3.1 3.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* light mode active → show a desk lamp / wax stamp (click to switch to ink-black) */
function LampIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2.5 12 2.5 9.2 7.2 6.8 7.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.8 7.2 5.6 13.5M9.2 7.2 10.4 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.8 13.5h6.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
