import { motion } from "framer-motion";
import { STATIONS, type StationId } from "@/data/stations";
import { PROFILE } from "@/data/profile";
import { cn } from "@/lib/utils";

export function Wordmark() {
  return (
    <div className="relative">
      <h1 className="font-display text-2xl font-extrabold leading-none tracking-tight text-(--sky-ink,#111111) sm:text-3xl">
        {PROFILE.name}
      </h1>
      <div className="mt-1.5 text-[11px] tracking-[0.12em] text-(--sky-mute,#6b6b6b) uppercase">
        {PROFILE.role}
      </div>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return (
    <motion.p
      role="status"
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-full bg-hq-accent px-4 py-2 text-[12px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(43,60,255,0.6)]"
    >
      {text}
    </motion.p>
  );
}

interface DockProps {
  visited: ReadonlySet<StationId>;
  current: StationId | null;
  onTravel: (id: StationId) => void;
}

export function Dock({ visited, current, onTravel }: DockProps) {
  return (
    <nav aria-label="Stations">
      <ul className="flex overflow-hidden rounded-full border border-hq-line bg-white/90 backdrop-blur">
        {STATIONS.map((s, i) => (
          <li key={s.id} className={cn(i > 0 && "border-l border-hq-line")}>
            <button
              type="button"
              onClick={() => onTravel(s.id)}
              aria-label={s.label}
              aria-current={current === s.id}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-hq-ink transition-colors hover:bg-hq-bg sm:px-3.5",
                current === s.id && "bg-hq-bg font-semibold",
              )}
            >
              <span className={cn("tabular-nums", visited.has(s.id) ? "text-hq-accent" : "text-hq-mute")}>
                0{s.hotkey}
              </span>
              <span className="hidden lg:inline">{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const HINTS: [string, string][] = [
  ["WASD", "walk"],
  ["Space", "jump"],
  ["Click", "go"],
  ["Drag", "look"],
  ["E", "open"],
  ["1–8", "travel"],
  ["M", "map"],
  ["Esc", "close"],
];

export function Hint() {
  return (
    <ul className="flex flex-col gap-1 text-[10px] font-medium text-(--sky-ink,#111111) [text-shadow:0_0_4px_var(--sky-bottom,#ffffff)] max-sm:hidden pointer-coarse:hidden">
      {HINTS.map(([k, v]) => (
        <li key={k} className="flex items-center gap-1.5">
          <kbd className="min-w-10 rounded-md border border-hq-line bg-white/90 px-1 py-px text-center font-sans text-hq-ink shadow-sm backdrop-blur [text-shadow:none]">{k}</kbd>
          {v}
        </li>
      ))}
    </ul>
  );
}

export function Replay({ onReplay }: { onReplay: () => void }) {
  return (
    <button
      type="button"
      onClick={onReplay}
      aria-label="Replay intro"
      title="Replay intro"
      className="grid size-8 place-items-center rounded-full border border-hq-line bg-white/80 text-[12px] font-semibold text-hq-ink backdrop-blur transition-colors hover:bg-white max-sm:size-11 pointer-coarse:size-11"
    >
      ?
    </button>
  );
}
