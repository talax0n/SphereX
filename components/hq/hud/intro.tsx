import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { INTRO } from "@/data/onboarding";
import { cn } from "@/lib/utils";

const touch =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;
const reduced =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The 3D close-up grows with the screen, so the bubble grows with it; phones and small laptops stay at 1. */
export function introScale(width: number, height: number) {
  return Math.min(1.75, Math.max(1, Math.min(height / 720, width / 1152)));
}

interface IntroProps {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

interface IntroThreadProps extends IntroProps {
  scale: number;
  /** false when this thread takes over from one already on screen, so its lines don't pop in a second time */
  appear: boolean;
}

/**
 * The player's speech bubbles, anchored at their top-left corner on wide screens and bottom-centre on phones.
 * The planet places them by the head; until it loads, `IntroPlaceholder` pins them where the head will be.
 */
export function IntroThread({ step, onNext, onSkip, scale, appear }: IntroThreadProps) {
  const typing = useTyping(step);
  const [settled] = useState(appear ? -1 : step);
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  // short phones can't fit four bubbles above the head without reaching the wordmark
  const first = narrow && window.innerHeight < 800 ? Math.max(0, step - 2) : 0;
  return (
    // scaled about the anchor, so the bubble's offsets from the head scale with it
    <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
      <div
        role="dialog"
        aria-label="Intro"
        className="flex w-[min(300px,calc(100vw-24px))] -translate-y-1/2 flex-col items-start gap-1.5 max-sm:w-[min(320px,calc(100vw-32px))] max-sm:-translate-x-1/2 max-sm:-translate-y-full max-sm:items-center"
      >
        {INTRO.slice(first, step + 1).map((line, j) => {
          const i = first + j;
          const current = i === step;
          return (
            <motion.button
              key={i}
              type="button"
              onClick={onNext}
              tabIndex={current ? 0 : -1}
              layout
              initial={i <= settled ? false : { opacity: 0, scale: 0.85, y: 6 }}
              animate={{ opacity: current ? 1 : narrow ? 0.45 : 0.55, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className={cn(
                "relative max-w-full origin-bottom-left rounded-[22px] bg-white px-4 py-2.5 text-left text-[15px] leading-snug text-hq-ink [filter:drop-shadow(0_0_1px_rgba(0,0,0,0.18))_drop-shadow(0_6px_14px_rgba(0,0,0,0.1))] max-sm:origin-bottom",
                // the tail points back at the speaker: left on wide screens, down on phones
                current &&
                  "rounded-bl-md before:absolute before:-left-1.5 before:bottom-2.5 before:size-4 before:rotate-45 before:rounded-[3px] before:bg-white max-sm:mb-1.5 max-sm:rounded-bl-[22px] max-sm:before:-bottom-1.5 max-sm:before:left-1/2 max-sm:before:-translate-x-1/2",
              )}
              aria-live={current ? "polite" : undefined}
            >
              {current && typing ? <Dots /> : (touch && line.touch) || line.text}
            </motion.button>
          );
        })}
        <IntroControls step={step} onNext={onNext} onSkip={onSkip} className="mt-1 pl-1 max-sm:hidden" />
      </div>
    </div>
  );
}

/**
 * The first bubble as plain HTML, server-rendered so a phone reads it while the planet is still loading.
 * Pinned where the head lands in the phone close-up; wider screens frame the head by aspect, so they wait for the planet.
 */
export function IntroPlaceholder({ pre, ...props }: IntroProps & { pre: boolean }) {
  return (
    <div data-intro-pre={pre || undefined} className="pointer-events-auto absolute top-[42.2%] left-1/2 z-[16] sm:hidden">
      <IntroThread {...props} scale={1} appear={false} />
    </div>
  );
}

/**
 * Progress, Skip and Next. Beside the thread on wide screens; on phones `hq.tsx` pins it to the
 * bottom of the screen instead, in thumb reach and clear of the bubbles.
 */
export function IntroControls({ step, onNext, onSkip, bar, className }: IntroProps & { bar?: boolean; className?: string }) {
  const last = step === INTRO.length - 1;
  return (
    <div className={cn("flex w-full items-center gap-2", bar && "flex-wrap gap-y-3", className)}>
      <ol
        className={cn("flex flex-1 gap-1.5", bar && "basis-full justify-center")}
        aria-label={`Step ${step + 1} of ${INTRO.length}`}
      >
        {INTRO.map((_, i) => (
          <li
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-300",
              i === step ? "w-4 bg-hq-accent" : "w-1.5 bg-(--sky-ink,#111111) opacity-20",
            )}
          />
        ))}
      </ol>
      <button
        type="button"
        onClick={onSkip}
        className={cn(
          "rounded-full px-2 py-1.5 text-[11px] text-(--sky-mute,#6b6b6b) transition-colors hover:text-(--sky-ink,#111111)",
          bar && "min-h-12 px-4 text-[14px]",
        )}
      >
        Skip intro
      </button>
      <button
        type="button"
        onClick={onNext}
        className={cn(
          "rounded-full bg-hq-accent px-3.5 py-1.5 text-[12px] font-semibold text-white",
          bar && "min-h-12 flex-1 text-[15px] shadow-[0_12px_30px_-12px_rgba(43,60,255,0.6)]",
        )}
      >
        {last ? "Let's go" : "Next"}
      </button>
    </div>
  );
}

// The opening line is already typed so the server can render it; the placeholder and the planet's thread share
// this, so a line typed in one doesn't type again when the other takes over.
let typed = 0;

/** A beat of "typing…" before each new line, like a chat reply. */
function useTyping(step: number) {
  const [, setShown] = useState(typed);
  useEffect(() => {
    if (typed === step) return;
    const t = setTimeout(() => setShown((typed = step)), reduced ? 0 : 420);
    return () => clearTimeout(t);
  }, [step]);
  return typed !== step;
}

function Dots() {
  return (
    <span className="flex h-[1.375em] items-center gap-1" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-hq-ink/40"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </span>
  );
}
