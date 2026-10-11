import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Navigation2, X } from "lucide-react";
import { Vector3 } from "three";
import { STATIONS, type StationId } from "@/data/stations";
import { ACCENT } from "../scene/clay";
import { IDENTITY } from "../scene/dioramas";
import { LANDMARKS, MINIMAP_VIEW, R } from "../scene/planet";
import { ctl } from "../game";

interface Charted {
  visited: ReadonlySet<StationId>;
}

const REDRAW_MS = 66;
const reduced = typeof window === "undefined" ? null : window.matchMedia("(prefers-reduced-motion: reduce)");
const at = { x: 0, y: 0 };
const right = new Vector3();

/**
 * The marks the live planet underneath can't show: visited checks and the
 * player's heading. Projects straight down over the player, as the scene's minimap camera does.
 */
function draw(canvas: HTMLCanvasElement, { visited }: Charted) {
  const ctx = canvas.getContext("2d");
  const size = canvas.clientWidth;
  if (!ctx || !size) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(size * dpr)) canvas.width = canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const c = size / 2;
  const k = (c * R) / MINIMAP_VIEW;
  const { n, heading } = ctl.player;
  const up = ctl.north;
  right.crossVectors(up, n);
  /** false when p is on the far side, after pinning it to the rim */
  const place = (p: Vector3) => {
    at.x = p.dot(right);
    at.y = p.dot(up);
    const front = p.dot(n) > 0;
    const s = front ? k : k / (Math.hypot(at.x, at.y) || 1);
    at.x = c + at.x * s;
    at.y = c - at.y * s;
    return front;
  };

  ctx.lineCap = ctx.lineJoin = "round";
  for (const s of STATIONS) {
    const front = place(LANDMARKS[s.id].n);
    if (front && visited.has(s.id)) {
      ctx.beginPath();
      ctx.moveTo(at.x - 3, at.y);
      ctx.lineTo(at.x - 0.75, at.y + 2.2);
      ctx.lineTo(at.x + 3, at.y - 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
    }
  }

  const a = Math.atan2(heading.dot(right), heading.dot(up));
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5.25, 4.9);
  ctx.lineTo(0, 2.45);
  ctx.lineTo(-5.25, 4.9);
  ctx.closePath();
  ctx.fillStyle = "#111111";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}

/** Redraws at ~15Hz while mounted; the latest props are read through a ref so the loop never restarts. */
function useChart(charted: Charted) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(charted);
  useEffect(() => {
    live.current = charted;
  });
  useEffect(() => {
    const tick = () => canvas.current && draw(canvas.current, live.current);
    tick();
    const id = setInterval(tick, REDRAW_MS);
    return () => clearInterval(id);
  }, []);
  return canvas;
}

/** A see-through button: the scene draws the live planet into the circle underneath it. */
export function Minimap({ onOpen, ...charted }: Charted & { onOpen: () => void }) {
  const canvas = useChart(charted);
  return (
    <button
      type="button"
      ref={(el) => {
        ctl.minimap = el;
        return () => {
          ctl.minimap = null;
        };
      }}
      onClick={onOpen}
      aria-label="Open map (M)"
      title="Map (M)"
      className="relative block size-[132px] rounded-full border border-hq-line shadow-[0_10px_30px_-16px_rgba(0,0,0,0.25)] transition-colors hover:border-hq-accent max-sm:size-24"
    >
      <canvas ref={canvas} className="absolute inset-0 size-full rounded-full" aria-hidden />
      <kbd className="absolute -top-1 -left-1 rounded border border-hq-line bg-white px-1 py-px font-sans text-[10px] text-hq-mute pointer-coarse:hidden">
        M
      </kbd>
    </button>
  );
}

/** The map's header; the globe, its labels and the drag all live in the scene. */
export function MapChrome({ onClose }: { onClose: () => void }) {
  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced?.matches ? 0 : 0.2 }}
      role="dialog"
      aria-label="Map"
      className="absolute top-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-hq-line bg-white/90 py-1.5 pr-1.5 pl-4 text-hq-ink shadow-[0_12px_30px_-18px_rgba(0,0,0,0.25)] backdrop-blur sm:top-6"
    >
      <h2 className="font-display text-lg font-extrabold leading-none tracking-tight">Map</h2>
      <p className="whitespace-nowrap text-[11px] text-hq-mute">
        Drag to spin · <span className="pointer-coarse:hidden">Click</span>
        <span className="hidden pointer-coarse:inline">Tap</span> a place to go
      </p>
      <kbd className="rounded-md border border-hq-line px-1.5 py-0.5 text-[10px] text-hq-mute pointer-coarse:hidden">M</kbd>
      <button
        type="button"
        onClick={onClose}
        autoFocus
        aria-label="Close map"
        className="grid size-8 place-items-center rounded-full border border-hq-line transition-colors hover:bg-hq-bg pointer-coarse:size-11"
      >
        <X className="size-4" />
      </button>
    </motion.header>
  );
}

/** Screen-edge pointers to places out of view. The scene picks, places and turns them every frame. */
export function EdgeArrows({ onTravel }: { onTravel: (id: StationId) => void }) {
  return (
    <div aria-label="Places out of view" role="group">
      {STATIONS.map((s, i) => (
        <button
          key={s.id}
          type="button"
          ref={(el) => {
            ctl.edges[i] = el;
            return () => {
              ctl.edges[i] = null;
            };
          }}
          onClick={() => onTravel(s.id)}
          aria-label={`Go to ${s.label}`}
          style={{ visibility: "hidden" }}
          className="absolute top-0 left-0 z-10 flex items-center gap-1.5 rounded-full border border-hq-line bg-white/95 py-1 pr-2.5 pl-1 text-[11px] max-sm:size-11 max-sm:justify-center max-sm:p-0 font-medium text-hq-ink shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)] backdrop-blur transition-colors hover:border-hq-accent pointer-coarse:min-h-11"
        >
          <span className="grid size-6 place-items-center rounded-full text-white" style={{ background: IDENTITY[s.id].top }}>
            <Navigation2 className="size-3.5 fill-current" aria-hidden />
          </span>
          <span className="max-sm:sr-only">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
