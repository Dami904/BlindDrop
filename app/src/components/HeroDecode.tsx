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
  const [settled, setSettled] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setSettled(true);
      return;
    }

    const chars = text.split("");
    let frame = 0;
    // Slower, weighted pace — glyphs settle left-to-right like light
    // resolving through ciphertext rather than a fast typewriter tick.
    const totalFrames = 22;
    const interval = setInterval(() => {
      frame++;
      // ease the reveal curve so it decelerates into the final word
      const t = frame / totalFrames;
      const eased = 1 - Math.pow(1 - t, 2.2);
      const revealCount = Math.floor(eased * chars.length);
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
        setSettled(true);
      }
    }, 55);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <Tag
      aria-label={text}
      style={{
        transition: "text-shadow 500ms ease-out",
        textShadow: settled ? "none" : "0 0 18px var(--seal-bright)",
      }}
    >
      {display}
    </Tag>
  );
}
