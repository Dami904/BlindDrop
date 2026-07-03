"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "█▓▒░#%&$@01".split("");

/**
 * The hero headline resolves out of redaction glyphs on load — a literal
 * "unsealing" moment for the first thing a visitor reads. Skips straight to
 * final text under prefers-reduced-motion.
 */
export function HeroDecode({ text, as: Tag = "span" }: { text: string; as?: "span" | "h1" }) {
  const [display, setDisplay] = useState(text);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const chars = text.split("");
    let frame = 0;
    const totalFrames = 14;
    const interval = setInterval(() => {
      frame++;
      const revealCount = Math.floor((frame / totalFrames) * chars.length);
      setDisplay(
        chars
          .map((c, i) => {
            if (c === " " || c === "\n") return c;
            if (i < revealCount) return c;
            return GLYPHS[(i + frame) % GLYPHS.length];
          })
          .join("")
      );
      if (frame >= totalFrames) {
        clearInterval(interval);
        setDisplay(text);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [text]);

  return <Tag aria-label={text}>{display}</Tag>;
}
