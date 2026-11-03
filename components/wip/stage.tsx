"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ACT_NAMES, ACTS, INK, LOOK, Pim, POSE_KEYS, REST, type Act, type ActName, type Look, type Pose } from "./pim";

const BLEND = 320; // ms to ease from one state's pose into the next
const REACTIONS: ActName[] = ["wave", "jump", "celebrate", "fall"];
const pickFrom = (pool: ActName[]) => pool[Math.floor(Math.random() * pool.length)];
const fmt = (n: number) => n.toFixed(2);

// read after hydration, so the server's markup (motion allowed) is corrected on the client
const CALM = "(prefers-reduced-motion: reduce)";
const onCalmChange = (f: () => void) => {
  const q = matchMedia(CALM);
  q.addEventListener("change", f);
  return () => q.removeEventListener("change", f);
};
const useCalm = () => useSyncExternalStore(onCalmChange, () => matchMedia(CALM).matches, () => false);

/** Flat sticker props for the stage. */
function Sign() {
  return (
    <svg viewBox="0 0 150 130" className="block h-auto w-full" overflow="visible" aria-hidden>
      <rect x="28" y="40" width="14" height="90" rx="3" fill="#b8743d" stroke={INK} strokeWidth="4.5" />
      <rect x="108" y="40" width="14" height="90" rx="3" fill="#b8743d" stroke={INK} strokeWidth="4.5" />
      <rect x="6" y="8" width="138" height="78" rx="10" fill="#f6c06a" stroke={INK} strokeWidth="5" />
      <path d="M11 68 H139 V76 Q139 81 134 81 H16 Q11 81 11 76 Z" fill="#e3a14e" />
      <path d="M20 22 H58" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
      <text x="75" y="60" textAnchor="middle" fontSize="34" fontWeight="800" fill={INK} fontFamily="var(--font-syne), sans-serif">
        WIP
      </text>
      <circle cx="18" cy="20" r="3" fill={INK} />
      <circle cx="132" cy="20" r="3" fill={INK} />
    </svg>
  );
}

function Cone() {
  return (
    <svg viewBox="0 0 80 96" className="block h-auto w-full" overflow="visible" aria-hidden>
      <path d="M33 8 Q40 2 47 8 L66 80 H14 Z" fill="#ff7a3d" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M27 32 H53 L57 48 H23 Z" fill="#fff" />
      <path d="M48 12 L62 72" stroke="#e45e24" strokeWidth="7" strokeLinecap="round" opacity="0.7" />
      <path d="M33 8 Q40 2 47 8 L66 80 H14 Z" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <rect x="4" y="78" width="72" height="14" rx="5" fill="#e45e24" stroke={INK} strokeWidth="5" />
    </svg>
  );
}

function Cloud({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 52" className={className} style={style} aria-hidden>
      <path d="M18 46 Q4 46 6 34 Q8 22 22 24 Q26 8 44 10 Q58 0 72 12 Q90 6 96 22 Q114 22 114 36 Q114 46 102 46 Z" fill="#fff" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}

export function WipStage() {
  const calm = useCalm();
  const [name, setName] = useState<ActName>("idle");
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const goRef = useRef<(n: ActName) => void>(() => {});
  const pokeRef = useRef<() => void>(() => {});
  const calmRef = useRef(calm);
  useEffect(() => {
    calmRef.current = calm;
  }, [calm]);

  // One loop poses every part of Pim each frame, straight on the DOM; React only hears about state changes.
  useEffect(() => {
    const stage = stageRef.current!;
    const wrap = wrapRef.current!;
    const sign = signRef.current!;
    const svg = wrap.querySelector("svg")!;
    const part = (n: string) => svg.querySelector<SVGGElement>(`[data-part="${n}"]`)!;
    const el = Object.fromEntries(["root", "body", "head", "face", "hat", "armL", "armR", "legL", "legR", "tail", "eyeL", "eyeR", "shadow"].map((n) => [n, part(n)]));
    const variants = [...svg.querySelectorAll<SVGElement>("[data-v]")].map((node) => {
      const [group, variant] = node.dataset.v!.split(":") as [keyof Look, string];
      return { node, group, variant };
    });

    let half = 0;
    let toSign = 0;
    const measure = () => {
      half = stage.clientWidth / 2;
      // where Pim stands so the hammer lands on the left of the board: its head swings about 100 units right of Pim's middle
      toSign = sign.offsetLeft + sign.offsetWidth * 0.2 - (wrap.offsetLeft + wrap.offsetWidth / 2) - (100 * wrap.offsetWidth) / 200;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);

    const cur: Pose = { ...REST };
    let from: Pose = { ...REST };
    let act: ActName = "idle";
    let start = performance.now();
    let hold = 1.6;
    let last: ActName = "idle";
    let shown = "";
    let pointer = { x: 0, y: 0, at: -1e9 };
    let eye = { x: 0, y: 0 };
    let blinkAt = start + 1800;
    let prev = start;

    const go = (next: ActName) => {
      if (calmRef.current && "run" in ACTS[next]) return;
      from = { ...cur };
      act = next;
      start = performance.now();
      hold = 2 + Math.random() * 2.4;
      if (next !== "idle") last = next;
      setName(next);
    };
    goRef.current = go;
    pokeRef.current = () => go(pickFrom(REACTIONS.filter((n) => n !== act && n !== last)));

    const onMove = (e: PointerEvent) => (pointer = { x: e.clientX, y: e.clientY, at: performance.now() });
    addEventListener("pointermove", onMove);

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const def: Act = ACTS[act];
      const t = (now - start) / 1000;
      if (act === "idle") {
        if (!calmRef.current && t > hold) go(pickFrom(ACT_NAMES.filter((n) => n !== "idle" && n !== last)));
      } else if (t > def.dur) go("idle");

      const target = { ...REST, ...def.pose(t) };
      const w = Math.min(1, (now - start) / BLEND);
      const k = w * w * (3 - 2 * w);
      for (const key of POSE_KEYS) cur[key] = from[key] + (target[key] - from[key]) * k;

      // eyes: the cursor wins while it is moving, then the state's own glances take over
      const r = wrap.getBoundingClientRect();
      const active = Math.min(1, Math.max(0, 1 - (now - pointer.at - 2200) / 600)) * def.follow;
      const cx = Math.max(-1, Math.min(1, (pointer.x - (r.left + r.width / 2)) / 260));
      const cy = Math.max(-1, Math.min(1, (pointer.y - (r.top + r.height * 0.58)) / 260));
      const ek = 1 - Math.exp(-dt * 16);
      eye = { x: eye.x + (cur.eyeX + (cx - cur.eyeX) * active - eye.x) * ek, y: eye.y + (cur.eyeY + (cy - cur.eyeY) * active - eye.y) * ek };

      const look = { ...LOOK, ...def.look?.(t) };
      const key = `${look.eyes}${look.mouth}${look.brows}${look.prop}${look.fx}`;
      if (key !== shown) {
        shown = key;
        for (const v of variants) v.node.style.display = look[v.group] === v.variant ? "" : "none";
      }

      if (now > blinkAt + 150) blinkAt = now + 2000 + Math.random() * 2800;
      const blink = now > blinkAt ? Math.sin(((now - blinkAt) / 150) * Math.PI) : 0;
      const lid = Math.max(cur.lid, look.eyes === "dot" ? blink : 0);

      const face = cur.face >= 0 ? Math.max(0.12, cur.face) : Math.min(-0.12, cur.face);
      const ex = eye.x * Math.sign(face) * 5;
      const ey = eye.y * 3.5;
      el.root.setAttribute("transform", `translate(100 204) translate(0 ${fmt(cur.y)}) rotate(${fmt(cur.rot)}) scale(${fmt(face * cur.sx)} ${fmt(cur.sy)}) translate(-100 -204)`);
      el.body.setAttribute("transform", `translate(0 ${fmt(cur.bob)})`);
      const tilt = `rotate(${fmt(cur.tilt)} 100 130)`;
      el.head.setAttribute("transform", tilt);
      el.face.setAttribute("transform", tilt);
      el.hat.setAttribute("transform", `translate(0 ${fmt(cur.hatY)}) rotate(${fmt(cur.hat)} 100 88)`);
      el.armL.setAttribute("transform", `translate(44 128) rotate(${fmt(cur.armL)})`);
      el.armR.setAttribute("transform", `translate(156 128) rotate(${fmt(-cur.armR)})`);
      el.legL.setAttribute("transform", `rotate(${fmt(cur.legL)} 89 165)`);
      el.legR.setAttribute("transform", `rotate(${fmt(-cur.legR)} 111 165)`);
      el.tail.setAttribute("transform", `rotate(${fmt(cur.tail)} 150 160)`);
      el.eyeL.setAttribute("transform", `translate(${fmt(80 + ex)} ${fmt(124 + ey)}) scale(1 ${fmt(1 - lid * 0.9)})`);
      el.eyeR.setAttribute("transform", `translate(${fmt(120 + ex)} ${fmt(124 + ey)}) scale(1 ${fmt(1 - lid * 0.9)})`);
      const lean = Math.sin((cur.rot * Math.PI) / 180);
      el.shadow.setAttribute("transform", `translate(${fmt(70 * lean)} 0) translate(100 204) scale(${fmt((1 + 0.5 * Math.abs(lean)) * (1 - Math.min(0.55, -cur.y / 140)))} 1) translate(-100 -204)`);
      wrap.style.transform = `translateX(${fmt(cur.x * half + cur.toSign * toSign)}px)`;
      sign.style.transform = `rotate(${fmt(cur.sign)}deg)`;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove);
      ro.disconnect();
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <section aria-label="Pim's building site" className="w-full">
        <div
          ref={stageRef}
          className="relative h-[290px] overflow-hidden rounded-[28px] border-[3px] border-wip-ink bg-[#dff0f7] shadow-[0_6px_0_var(--color-wip-ink)] sm:h-[400px] lg:h-[440px]"
        >
          <div className="absolute top-6 right-8 size-14 rounded-full border-[3px] border-wip-ink bg-[#ffd36b] sm:size-20" aria-hidden />
          <Cloud className="pim-cloud absolute top-[14%] left-0 w-24 sm:w-32" style={{ ["--d" as string]: "70s", ["--delay" as string]: "-22s" }} />
          <Cloud className="pim-cloud absolute top-[30%] left-0 w-16 sm:w-20" style={{ ["--d" as string]: "95s", ["--delay" as string]: "-70s" }} />
          <div className="absolute inset-x-0 bottom-0 h-[50px] border-t-[3px] border-wip-ink bg-[#f2d8a7] sm:h-[62px]" aria-hidden>
            <span className="absolute top-3 left-[30%] h-1.5 w-4 rounded-full bg-[#dcb77c]" />
            <span className="absolute top-6 left-[62%] h-1.5 w-6 rounded-full bg-[#dcb77c]" />
            <span className="absolute top-4 left-[86%] h-1.5 w-3 rounded-full bg-[#dcb77c]" />
          </div>
          <div className="absolute bottom-[42px] left-[5%] w-[46px] sm:bottom-[54px] sm:w-[64px]">
            <Cone />
          </div>
          <div ref={signRef} className="absolute right-[4%] bottom-[44px] w-[104px] origin-bottom sm:right-[6%] sm:bottom-[56px] sm:w-[148px]">
            <Sign />
          </div>
          <div ref={wrapRef} className="absolute bottom-[38px] left-1/2 -ml-[72px] w-[144px] sm:bottom-[48px] sm:-ml-[105px] sm:w-[210px]">
            <button
              type="button"
              onClick={() => pokeRef.current()}
              aria-label="Poke Pim"
              className="block w-full cursor-pointer rounded-3xl focus-visible:outline-offset-4"
            >
              <Pim />
            </button>
          </div>
        </div>

        <p className="mt-5 flex min-h-6 items-baseline gap-1.5 text-[15px] text-wip-mute">
          <span className="font-semibold text-wip-ink">Pim</span> is
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="text-wip-ink"
            >
              {ACTS[name].doing}
            </motion.span>
          </AnimatePresence>
        </p>

        <div role="group" aria-label="Pick what Pim does" className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
          {ACT_NAMES.map((n) => {
            const on = n === name;
            const off = calm && "run" in ACTS[n];
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                disabled={off}
                onClick={() => goRef.current(n)}
                className={`relative rounded-full border-2 border-wip-ink px-3 py-1 text-[12.5px] font-semibold transition-colors sm:text-[13px] ${on ? "text-white" : "bg-white text-wip-ink hover:bg-[#fff3d6]"} disabled:cursor-not-allowed disabled:opacity-35`}
              >
                {on && <motion.span layoutId="pim-chip" className="absolute inset-0 rounded-full bg-wip-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className="relative">{ACTS[n].label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </MotionConfig>
  );
}
