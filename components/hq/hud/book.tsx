import { type PointerEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { PROFILE } from "@/data/profile";
import { STATIONS, STATION_BY_ID, type StationId } from "@/data/stations";
import { cn } from "@/lib/utils";
import { BOOK, firstPage } from "../panels";

/** leaf 0 is the contents inside the cover; leaf n is BOOK page n, so leaf numbers are page numbers */
const LEAVES = BOOK.length + 1;
/** the board is stiff and slow, paper is light (StPageFlip's hard and soft pages) */
const COVER_FOR = 0.9;
const PAGE_FOR = 0.7;
const EASE = [0.65, 0, 0.35, 1] as const;
/** a horizontal swipe this long turns the page, as in StPageFlip */
const SWIPE = 30;

/** what one side of a sheet shows: the cover, a blank, or a leaf */
type Face = "cover" | null | number;
type Side = "left" | "right" | "full";

/**
 * A leaf in mid-turn, swinging on the spine from one angle to another over the pages `under` it.
 * A hard leaf is the cover board, which is bigger than the paper; `next` is the first leaf on view
 * once it lands, or "closed" when the cover just shut.
 */
interface Turn {
  id: number;
  side: Side;
  hard: boolean;
  from: number;
  to: number;
  front: Face;
  back: Face;
  under: Face[];
  next: number | "closed";
}

/** where each half of the open book sits; the boards fill it, the paper sits inside the boards' overhang */
const HALF: Record<Side, string> = {
  left: "inset-y-0 left-0 w-1/2",
  right: "inset-y-0 left-1/2 w-1/2",
  full: "inset-0",
};
const PAPER: Record<Side, string> = {
  left: "inset-y-2 left-2 right-0",
  right: "inset-y-2 left-0 right-2",
  full: "inset-y-2 left-0 right-2",
};
/** a turning paper leaf, placed over its page directly so it shares the book's perspective */
const LEAF: Record<Side, string> = {
  left: "inset-y-2 left-2 right-1/2",
  right: "inset-y-2 left-1/2 right-2",
  full: "inset-y-2 left-0 right-2",
};
/** fine grain for the leather and the paper */
const grain = (opacity: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='${opacity}'/%3E%3C/svg%3E")`;
/** worn brown leather: rubbed lighter where hands hold it, darker at the edges */
const LEATHER = {
  backgroundColor: "#5c3920",
  backgroundImage: `radial-gradient(ellipse at 35% 25%, rgba(255,214,160,0.16), transparent 55%), radial-gradient(ellipse at 90% 95%, rgba(0,0,0,0.4), transparent 55%), ${grain(0.55)}`,
  backgroundBlendMode: "normal, normal, multiply",
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 0 36px rgba(0,0,0,0.5)",
};
/** yellowed paper, browner towards its edges and into the gutter */
const paper = (side: Side) => ({
  backgroundColor: "#f5ead2",
  backgroundImage: [
    `linear-gradient(${side === "left" ? "to left" : "to right"}, rgba(70,40,10,0.28), rgba(70,40,10,0.08) 3%, transparent 12%)`,
    "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(150,100,35,0.2) 100%)",
    grain(0.12),
  ].join(", "),
  backgroundBlendMode: "normal, normal, multiply",
});
const GOLD = "bg-[linear-gradient(180deg,#f5dc97,#c99a45_55%,#8c6220)] bg-clip-text text-transparent [filter:drop-shadow(0_1px_0_rgba(0,0,0,0.55))]";

const TURN_BTN =
  "grid size-9 place-items-center rounded-full border border-hq-line bg-white/90 text-hq-ink shadow-sm backdrop-blur transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-30";

/** the paper block's edge: one hairline per few leaves on that side of the spine */
function edge(leaves: number, side: Side) {
  const lines = Math.min(4, Math.ceil(leaves / 3));
  const dir = side === "left" ? -1 : 1;
  return Array.from({ length: lines }, (_, i) => `${dir * (2 * i + 1)}px ${i + 1}px 0 #c4ab7c, ${dir * (2 * i + 2)}px ${i + 1}px 0 #ead9b3`).join(", ");
}

function Cover() {
  return (
    <div style={LEATHER} className="relative flex h-full flex-col overflow-hidden rounded-l-[3px] rounded-r-xl p-5 pl-8">
      {/* the hinge groove a hardback bends along, and light catching the rounded spine */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.45),rgba(255,220,170,0.12)_2.5%,transparent_6%,rgba(0,0,0,0.3)_7%,transparent_8.5%)]" />
      <div className="relative flex flex-1 flex-col items-center justify-between rounded-md border-4 border-double border-[#b88d45]/70 p-6 text-center">
        <p className={cn(GOLD, "font-serif text-[11px] tracking-[0.4em] uppercase")}>Portfolio</p>
        <div className="flex flex-col items-center">
          <span className={cn(GOLD, "font-serif text-lg")}>❦</span>
          <h2 className={cn(GOLD, "mt-2 font-serif text-6xl font-bold italic leading-none max-sm:text-5xl")}>{PROFILE.name}</h2>
          <span className="mt-4 h-px w-24 bg-[#b88d45]/70" />
          <p className={cn(GOLD, "mt-3 font-serif text-[12px] tracking-[0.25em] uppercase")}>{PROFILE.role}</p>
        </div>
        <p className={cn(GOLD, "font-serif text-[11px] tracking-[0.15em]")}>{PROFILE.location}</p>
      </div>
    </div>
  );
}

function Contents({ onJump }: { onJump: (leaf: number) => void }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="font-display text-3xl font-extrabold tracking-tight">Contents</h2>
      <ol className="mt-5 space-y-1">
        {STATIONS.map((s) => {
          const leaf = firstPage(s.id) + 1;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onJump(leaf)}
                className="flex w-full items-baseline gap-2 rounded-md py-1.5 text-left text-[14px] text-hq-ink transition-colors hover:text-[#8a5a2b]"
              >
                <span className="w-6 text-[11px] tabular-nums text-hq-mute">0{s.hotkey}</span>
                {s.label}
                <span className="mx-1 flex-1 translate-y-[-3px] border-b border-dotted border-hq-line" />
                <span className="text-[12px] tabular-nums text-hq-mute">{leaf}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Page({ leaf }: { leaf: number }) {
  const { chapter, Content } = BOOK[leaf - 1];
  const station = STATION_BY_ID[chapter];
  const opens = firstPage(chapter) === leaf - 1;
  return (
    <div className="flex h-full flex-col">
      <p className="font-serif text-[10px] tracking-[0.25em] text-[#8b6f47] uppercase">
        0{station.hotkey} · {station.label}
      </p>
      {opens && <h2 className="mt-2 font-display text-4xl font-extrabold leading-none tracking-tight max-sm:text-3xl">{station.label}</h2>}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <Content />
      </div>
    </div>
  );
}


/** one side of a sheet of paper; the gutter darkens towards the spine */
function Sheet({ face, side, onJump }: { face: Face; side: Side; onJump: (leaf: number) => void }) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col px-7 pt-6 pb-3 text-[#2b1d10] max-sm:px-5",
        side === "left" ? "rounded-l-[3px]" : "rounded-r-[3px]",
      )}
      style={paper(side)}
    >
      <div className="min-h-0 flex-1">{face === 0 ? <Contents onJump={onJump} /> : typeof face === "number" && <Page leaf={face} />}</div>
      {typeof face === "number" && face > 0 && (
        <p className={cn("pt-2 font-serif text-[11px] tabular-nums text-[#8b6f47]", side === "left" ? "text-left" : "text-right")}>{face}</p>
      )}
    </div>
  );
}

/** One face of a turning leaf: paper, or for the cover board either the cover or the board with its pasted-down page. */
function Face({ face, side, hard, onJump }: { face: Face; side: Side; hard: boolean; onJump: (leaf: number) => void }) {
  if (face === "cover") return <Cover />;
  if (!hard) return <Sheet face={face} side={side} onJump={onJump} />;
  return (
    <div style={LEATHER} className={cn("h-full", side === "left" ? "rounded-l-xl rounded-r-[3px]" : "rounded-r-xl rounded-l-[3px]")}>
      <div className={cn("absolute", PAPER[side])}>
        <Sheet face={face} side={side} onJump={onJump} />
      </div>
    </div>
  );
}

/** The leaf swinging on the spine; it darkens as it stands up off the page, the way StPageFlip shades a flip. */
function Leaf({ turn, duration, onLand, onJump }: { turn: Turn; duration: number; onLand: () => void; onJump: (leaf: number) => void }) {
  const rot = useMotionValue(turn.from);
  const shade = useTransform(rot, (r) => Math.sin((Math.abs(r) * Math.PI) / 180) * 0.28);
  const sides: [Side, Side] = turn.side === "full" ? ["full", "full"] : turn.side === "right" ? ["right", "left"] : ["left", "right"];
  const hinge = turn.side === "left" ? "origin-right" : "origin-left";
  return (
    <motion.div
      style={{ rotateY: rot }}
      animate={{ rotateY: turn.to }}
      transition={{ duration, ease: EASE, delay: turn.id === 0 && duration > 0.1 ? 0.35 : 0 }}
      onAnimationComplete={onLand}
      className={cn("absolute [transform-style:preserve-3d]", hinge, (turn.hard ? HALF : LEAF)[turn.side])}
    >
      {[0, 1].map((i) => (
        <div key={i} className={cn("absolute inset-0 [backface-visibility:hidden]", i && "[transform:rotateY(180deg)]")}>
          <Face face={i ? turn.back : turn.front} side={sides[i]} hard={turn.hard} onJump={onJump} />
          <motion.div
            style={{ opacity: shade }}
            className={cn(
              "pointer-events-none absolute inset-0 rounded-[inherit] from-black to-transparent",
              sides[i] === "left" ? "bg-linear-to-l" : "bg-linear-to-r",
            )}
          />
        </div>
      ))}
    </motion.div>
  );
}

const nullable = (leaf: number): Face => (leaf < LEAVES ? leaf : null);

/** The portfolio as a hardback: it arrives shut, swings its cover open at the station's chapter and turns page by page. */
export function Book({ id, onClose }: { id: StationId; onClose: () => void }) {
  const [pair] = useState(() => typeof window === "undefined" || window.innerWidth >= 640);
  const n = pair ? 2 : 1;
  const start = firstPage(id) + 1;
  const [pos, setPos] = useState(start - (start % n));
  const turnId = useRef(0);
  const [turn, setTurn] = useState<Turn | null>(() => ({
    id: 0,
    side: pair ? "right" : "full",
    hard: true,
    from: 0,
    to: -180,
    front: "cover",
    back: pair ? pos : null,
    under: pair ? [null, nullable(pos + 1)] : [pos],
    next: pos,
  }));
  const still = useReducedMotion();
  const station = STATION_BY_ID[BOOK[Math.max(pos, 1) - 1].chapter];

  const begin = (t: Omit<Turn, "id">) => setTurn((cur) => cur ?? { ...t, id: ++turnId.current });
  const forward = () => {
    if (pos + n >= LEAVES) return;
    begin(
      pair
        ? { side: "right", hard: false, from: 0, to: -180, front: pos + 1, back: pos + 2, under: [pos, nullable(pos + 3)], next: pos + 2 }
        : { side: "full", hard: false, from: 0, to: -180, front: pos, back: null, under: [pos + 1], next: pos + 1 },
    );
  };
  const backward = () => {
    if (pos === 0) return;
    begin(
      pair
        ? { side: "left", hard: false, from: 0, to: 180, front: pos, back: pos - 1, under: [pos - 2, nullable(pos + 1)], next: pos - 2 }
        : { side: "full", hard: false, from: -180, to: 0, front: pos - 1, back: null, under: [pos], next: pos - 1 },
    );
  };
  const shut = () =>
    begin(
      pair
        ? { side: "left", hard: true, from: 0, to: 180, front: pos, back: "cover", under: [null, nullable(pos + 1)], next: "closed" }
        : { side: "full", hard: true, from: -180, to: 0, front: "cover", back: null, under: [pos], next: "closed" },
    );
  const jump = (leaf: number) => {
    if (!turn) setPos(leaf - (leaf % n));
  };
  const land = () => {
    if (!turn) return;
    if (turn.next === "closed") return onClose();
    setPos(turn.next);
    setTurn(null);
  };

  // re-bound every render so the keys always turn from the page on view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") backward();
      else if (e.key === "ArrowRight") forward();
      else if (e.key === "Escape") {
        // the cover shuts first, so the game's own Escape must not drop the book mid-swing
        e.stopPropagation();
        shut();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const swipeFrom = useRef<number | null>(null);
  const press = (e: PointerEvent) => {
    swipeFrom.current = e.pointerType === "mouse" ? null : e.clientX;
  };
  const release = (e: PointerEvent) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null) return;
    if (e.clientX - from < -SWIPE) forward();
    else if (e.clientX - from > SWIPE) backward();
  };

  const shown: Face[] = turn ? turn.under : pair ? [pos, nullable(pos + 1)] : [pos];
  const sides: Side[] = pair ? ["left", "right"] : ["full"];
  const closed = turn?.front === "cover" || turn?.back === "cover";
  const shutting = turn?.next === "closed";
  const duration = still ? 0.01 : turn?.hard ? COVER_FOR : PAGE_FOR;
  /** leaves already read sit under the left page, the rest under the right */
  const stack = (side: Side) => (side === "left" ? pos : LEAVES - pos - n);

  return (
    <motion.div
      role="dialog"
      aria-label={station.label}
      initial={{ opacity: 0, y: 40, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="absolute inset-x-0 z-30 mx-auto flex w-[min(880px,94vw)] flex-col items-center gap-3 max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-sm:w-[calc(100vw-1rem)] sm:top-1/2 sm:-translate-y-1/2"
    >
      <motion.div
        initial={pair ? { x: "-25%" } : false}
        animate={{ x: pair && shutting ? "-25%" : 0 }}
        transition={{ duration: still ? 0.01 : COVER_FOR, ease: EASE, delay: shutting ? COVER_FOR / 2 : turn?.id === 0 ? 0.35 : 0 }}
        onPointerDown={press}
        onPointerUp={release}
        className="relative h-[min(600px,calc(100dvh-12rem))] w-full touch-pan-y drop-shadow-[0_30px_40px_rgba(0,0,0,0.3)] [perspective:2400px] max-sm:h-[62dvh]"
      >
        {sides.map((side) => (
          <div
            key={side}
            style={LEATHER}
            className={cn(
              "absolute",
              HALF[side],
              side === "left" ? "rounded-l-xl rounded-r-[3px]" : "rounded-r-xl rounded-l-[3px]",
              side === "left" && closed && "invisible",
            )}
          />
        ))}
        {shown.map((face, i) => (
          <div key={i} className={cn("absolute", HALF[sides[i]], face === null && closed && "invisible")}>
            <div className={cn("absolute", PAPER[sides[i]])} style={{ boxShadow: edge(stack(sides[i]), sides[i]) }}>
              <Sheet face={face} side={sides[i]} onJump={jump} />
            </div>
          </div>
        ))}
        {turn && <Leaf key={turn.id} turn={turn} duration={duration} onLand={land} onJump={jump} />}
      </motion.div>
      <nav aria-label="Pages" className={cn("flex items-center gap-3 transition-opacity", closed && "pointer-events-none opacity-0")}>
        <button type="button" aria-label="Previous page" onClick={backward} disabled={pos === 0} className={TURN_BTN}>
          <ChevronLeft className="size-4" />
        </button>
        <p className="min-w-20 rounded-full bg-white/90 px-3 py-1 text-center text-[11px] tabular-nums text-hq-mute shadow-sm backdrop-blur" aria-live="polite">
          {pos === 0 ? "Contents" : pair && pos + 1 < LEAVES ? `${pos}–${pos + 1}` : pos} / {LEAVES - 1}
        </p>
        <button type="button" aria-label="Next page" onClick={forward} disabled={pos + n >= LEAVES} className={TURN_BTN}>
          <ChevronRight className="size-4" />
        </button>
        <button type="button" aria-label="Close book" onClick={shut} className={cn(TURN_BTN, "ml-2")}>
          <X className="size-4" />
        </button>
      </nav>
    </motion.div>
  );
}
