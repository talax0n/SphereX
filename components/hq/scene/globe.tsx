import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Check } from "lucide-react";
import { Quaternion, Vector3 } from "three";
import { STATIONS, type StationId } from "@/data/stations";
import { cn } from "@/lib/utils";
import { ctl } from "../game";
import { IDENTITY } from "./dioramas";
import { LANDMARKS, R } from "./planet";
import { clearance } from "./waypoints";

/** the map opens looking down past the player's back, so roofs show a little of their walls */
const TILT = 0.35;
/** radians per pixel, relative to the shorter screen side: a drag across the globe turns it about half over */
const DRAG = 3.2;
const FRICTION = 4;
const LABEL_UP = 1.7;
const LIMB_FADE = 0.6;
const reduced = typeof window === "undefined" ? null : window.matchMedia("(prefers-reduced-motion: reduce)");

const q = new Quaternion();
const axis = new Vector3();
const ease = (v: number) => Math.min(1, Math.max(0, v));

/** Turns the orbit by `yaw` about screen-up and `pitch` about screen-right. */
function turn(yaw: number, pitch: number) {
  const { dir, up } = ctl.globe;
  dir.applyQuaternion(q.setFromAxisAngle(up, yaw));
  q.setFromAxisAngle(axis.crossVectors(dir, up).normalize(), pitch);
  dir.applyQuaternion(q).normalize();
  up.applyQuaternion(q).normalize();
}

interface GlobeProps {
  visited: ReadonlySet<StationId>;
  onTravel: (id: StationId) => void;
}

/**
 * The map: while mounted the camera orbits the whole planet. Dragging spins it with a little
 * inertia, and every landmark gets a label that travels there.
 */
export function Globe({ visited, onTravel }: GlobeProps) {
  const gl = useThree((s) => s.gl);
  const els = useRef<(HTMLElement | null)[]>([]);
  const held = useRef(false);
  const anchors = useMemo(
    () => [
      ...STATIONS.map((s) => LANDMARKS[s.id].n.clone().multiplyScalar(R + LABEL_UP)),
      ctl.player.n.clone().multiplyScalar(R + LIMB_FADE),
    ],
    [],
  );

  useEffect(() => {
    const g = ctl.globe;
    const { n } = ctl.player;
    g.dir.copy(n).multiplyScalar(Math.cos(TILT)).addScaledVector(ctl.north, -Math.sin(TILT));
    g.up.copy(n).multiplyScalar(Math.sin(TILT)).addScaledVector(ctl.north, Math.cos(TILT));
    g.spin.set(0, 0);
    g.open = true;

    const el = gl.domElement;
    el.style.setProperty("cursor", "grab");
    let last: { id: number; x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      if (last) return;
      last = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
      held.current = true;
      g.spin.set(0, 0);
      el.setPointerCapture(e.pointerId);
      el.style.setProperty("cursor", "grabbing");
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== last?.id) return;
      const k = DRAG / Math.min(el.clientWidth, el.clientHeight);
      const yaw = -(e.clientX - last.x) * k;
      const pitch = (e.clientY - last.y) * k;
      turn(yaw, pitch);
      const dt = Math.max(0.004, (e.timeStamp - last.t) / 1000);
      g.spin.lerp(axis.set(yaw / dt, pitch / dt, 0), 0.5);
      last = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== last?.id) return;
      // a finger that stopped before lifting shouldn't fling the globe
      if (reduced?.matches || e.timeStamp - last.t > 80) g.spin.set(0, 0);
      last = null;
      held.current = false;
      el.style.setProperty("cursor", "grab");
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      g.open = false;
      el.style.removeProperty("cursor");
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { spin, t } = ctl.globe;
    if (!held.current && spin.lengthSq() > 1e-6) {
      turn(spin.x * dt, spin.y * dt);
      spin.multiplyScalar(Math.exp(-dt * FRICTION));
    }
    // labels on the far side fade out as they pass behind the planet's limb
    anchors.forEach((a, i) => {
      const el = els.current[i];
      if (!el) return;
      const v = ease(clearance(camera.position, a) / LIMB_FADE) * ease(t * 2 - 1);
      el.style.opacity = v.toFixed(2);
      el.style.visibility = v < 0.05 ? "hidden" : "visible";
      if (i < STATIONS.length) el.style.pointerEvents = v < 0.5 ? "none" : "auto";
    });
  });

  return (
    <>
      {STATIONS.map((s, i) => {
        const lit = visited.has(s.id);
        return (
          <Html key={s.id} position={anchors[i]} center zIndexRange={[30, 21]}>
            <button
              ref={(el) => {
                els.current[i] = el;
              }}
              type="button"
              onClick={() => onTravel(s.id)}
              aria-label={`Go to ${s.label}${lit ? ", visited" : ""}`}
              style={{ opacity: 0, visibility: "hidden" }}
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-white font-medium text-hq-ink shadow-[0_6px_16px_-10px_rgba(0,0,0,0.35)] transition-[border-color,transform] hover:scale-105 hover:border-hq-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
                "border-hq-line px-2.5 py-1 text-[11px] max-sm:px-2 max-sm:text-[10px]",
              )}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: IDENTITY[s.id].top }} />
              {s.label}
              {lit && <Check className="size-3 text-hq-accent" strokeWidth={3} aria-hidden />}
            </button>
          </Html>
        );
      })}
      <Html position={anchors[STATIONS.length]} center zIndexRange={[30, 21]} style={{ pointerEvents: "none" }}>
        <span
          ref={(el) => {
            els.current[STATIONS.length] = el;
          }}
          style={{ opacity: 0, visibility: "hidden" }}
          className="block translate-y-7 rounded-full bg-hq-ink px-2 py-0.5 text-[10px] font-semibold text-white"
        >
          You
        </span>
      </Html>
    </>
  );
}
