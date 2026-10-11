import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { type Pulse, ago, say } from "@/data/pulse";

const DAY = 86_400_000;

/** The live-agents pill under the wordmark; click it (or press `) for a tiny `ps` of the sessions, with a way to go watch them. */
export function Ps({ pulse, onWatch }: { pulse: Pulse; onWatch: () => void }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Backquote") setOpen((o) => !o);
      else if (e.code === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener("keydown", key);
      clearInterval(id);
    };
  }, []);

  const { agents, lastSeen, runsToday } = pulse;
  const live = agents.filter((a) => a.phase !== "done").length;
  const recent = lastSeen > 0 && now - lastSeen < DAY;
  const toggle = () => {
    setNow(Date.now());
    setOpen((o) => !o);
  };
  const watch = () => {
    setOpen(false);
    onWatch();
  };

  return (
    <div className="relative mt-3 w-fit">
      {(live > 0 || recent || open) && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-hq-line bg-white/90 px-3 py-1.5 text-[11px] text-hq-ink backdrop-blur transition-colors hover:bg-white max-sm:max-w-60 max-sm:rounded-2xl max-sm:py-2 pointer-coarse:py-2"
        >
          {live > 0 ? (
            <>
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-hq-accent/60 motion-reduce:hidden" />
                <span className="relative size-2 rounded-full bg-hq-accent" />
              </span>
              Theo is building right now · {live} {live === 1 ? "agent" : "agents"} at work
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-hq-mute/50" />
              {recent
                ? `Last built ${ago(Math.max(0, now - lastSeen))} · ${runsToday} ${runsToday === 1 ? "run" : "runs"} today`
                : "No agents running"}
            </>
          )}
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="pointer-events-auto absolute top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-hq-line bg-white/90 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-hq-ink shadow-sm backdrop-blur"
          >
            <p className="text-hq-mute">$ ps agents</p>
            {agents.length ? (
              <ul>
                {agents.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-hq-accent">●</span>
                    <span className="min-w-0 flex-1 truncate">{a.title ?? "untitled"}</span>
                    <span className="text-hq-mute">
                      {a.provider} · {say(a)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>no agents running</p>
            )}
            <p className="text-hq-mute">
              {runsToday} runs today{lastSeen > 0 && ` · seen ${ago(Math.max(0, now - lastSeen))}`}
            </p>
            <button
              type="button"
              onClick={watch}
              className="mt-2 rounded-full border border-hq-line bg-white px-3 py-1 font-sans text-[11px] font-semibold text-hq-accent transition-colors hover:bg-hq-bg max-sm:py-2"
            >
              Go watch →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
