"use client";

import { useEffect, useState } from "react";

const TYPE_MS = 55;
const ERASE_MS = 28;
const HOLD_MS = 1800;

export function Headline({ phrases }: { phrases: string[] }) {
  // Starts fully typed, so the server render and the first paint show a whole headline.
  const [at, setAt] = useState({ phrase: 0, chars: phrases[0].length + 1, erasing: false });
  const full = `${phrases[at.phrase]}.`;

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const typed = at.chars === full.length;
    const next = at.erasing
      ? at.chars > 0
        ? { ...at, chars: still ? 0 : at.chars - 1 }
        : { phrase: (at.phrase + 1) % phrases.length, chars: 0, erasing: false }
      : typed
        ? { ...at, erasing: true }
        : { ...at, chars: still ? full.length : at.chars + 1 };
    const timer = setTimeout(() => setAt(next), typed && !at.erasing ? HOLD_MS : at.erasing ? ERASE_MS : TYPE_MS);
    return () => clearTimeout(timer);
  }, [at, full.length, phrases.length]);

  return (
    // The label gives screen readers the whole phrase, not one letter at a time.
    // The size tracks the column width so the longest phrase always fits one line, which keeps the height fixed.
    <h1 aria-label={`I build ${full}`} className="whitespace-nowrap text-[min(4.5rem,11.5cqw)] font-bold leading-[1.05] tracking-tight">
      <span aria-hidden className="block">I build</span>
      <span aria-hidden className="block">
        {full.slice(0, at.chars)}
        <span className="ml-1 inline-block h-[0.8em] w-[0.06em] animate-pulse bg-accent motion-reduce:animate-none" />
      </span>
    </h1>
  );
}
