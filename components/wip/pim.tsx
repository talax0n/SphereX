import { memo, type CSSProperties } from "react";

/**
 * Pim: a chubby sky-blue cat-blob in a yellow hard hat, drawn as flat sticker art.
 * Every moving part is its own `data-part` group; the stage's animation loop writes their transforms.
 * Swappable features (eyes, mouth, brows, props, effects) are `data-v="group:variant"` elements it shows and hides.
 */

export const INK = "#2b2233";
const BODY = "#7cc8f5";
const SHADE = "#57a6dc";
const BELLY = "#e8f6ff";
const HAT = "#ffc83d";
const HAT_SHADE = "#efa528";
const PINK = "#ff98ad";
const MOUTH = "#7c2d3f";
const WOOD = "#b8743d";

export type Pose = {
  x: number; // across the stage, in half stage widths
  toSign: number; // 0 at home, 1 standing just left of the WIP sign
  y: number; // up is negative
  sx: number;
  sy: number;
  rot: number; // lean, degrees, about the feet
  face: number; // 1 faces right, -1 is mirrored
  bob: number;
  tilt: number;
  hat: number;
  hatY: number;
  armL: number; // degrees outward from hanging down
  armR: number;
  legL: number;
  legR: number;
  tail: number;
  eyeX: number; // -1..1, in stage terms (left/right on screen)
  eyeY: number;
  lid: number; // 0 open, 1 shut
  sign: number; // the WIP sign's wobble, degrees
};

export const REST: Pose = { x: 0, toSign: 0, y: 0, sx: 1, sy: 1, rot: 0, face: 1, bob: 0, tilt: 0, hat: 0, hatY: 0, armL: 16, armR: 16, legL: 0, legR: 0, tail: 0, eyeX: 0, eyeY: 0, lid: 0, sign: 0 };
export const POSE_KEYS = Object.keys(REST) as (keyof Pose)[];

export type Look = {
  eyes: "dot" | "happy" | "x" | "closed";
  mouth: "smile" | "open" | "flat" | "o" | "wobble";
  brows: "none" | "worried" | "focused" | "up";
  prop: "none" | "hammer" | "watch";
  fx: "none" | "stars" | "zzz" | "confetti";
};

export const LOOK: Look = { eyes: "dot", mouth: "smile", brows: "none", prop: "none", fx: "none" };

export type Act = {
  label: string;
  doing: string;
  /** seconds; idle has none, the director decides how long it lasts */
  dur: number;
  /** how much the eyes follow the cursor */
  follow: number;
  /** crosses the stage, so it is off when motion is reduced */
  run?: boolean;
  pose: (t: number) => Partial<Pose>;
  look?: (t: number) => Partial<Look>;
};

const TAU = Math.PI * 2;
const { sin, abs, PI } = Math;
const cl = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const io = (u: number) => u * u * (3 - 2 * u);
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
/** 0 before a, eases to 1, holds, eases back to 0 by b */
const pulse = (t: number, a: number, b: number, e = 0.25) => io(seg(t, a, a + e)) * (1 - io(seg(t, b - e, b)));

const R1 = 0.35, R2 = 1.75, R3 = 2.25, R4 = 3.75;
const run = (d: 1 | -1): Act => ({
  label: d > 0 ? "Run right" : "Run left",
  doing: d > 0 ? "dashing off for more nails" : "racing to fetch a plank",
  dur: 4.5,
  follow: 0,
  run: true,
  pose(t) {
    const out = t > R1 && t < R2;
    const back = t > R3 && t < R4;
    const mov = out ? d : back ? -d : 0;
    const x = t < R1 ? 0 : t < R2 ? 1.7 * d * seg(t, R1, R2) ** 2 : t < R3 ? 1.7 * d : 1.7 * d * (1 - seg(t, R3, R4)) ** 2;
    const face = t < R3 ? d : mix(-d, 1, io(seg(t, R4 + 0.2, R4 + 0.5)));
    if (t < R1) {
      const u = io(t / R1);
      return { x, face, sy: 1 - 0.1 * u, sx: 1 + 0.08 * u, rot: -7 * d * u, armL: 16 - 22 * u, armR: 16 - 22 * u, eyeX: d };
    }
    if (mov) {
      const s = sin(t * 17);
      return { x, face, legL: 38 * s, legR: -38 * s, armL: 34 + 40 * s, armR: 34 - 40 * s, bob: -8 * abs(s), rot: 9 * mov, tail: 25 * sin(t * 8), eyeX: mov };
    }
    if (t >= R4) {
      const u = seg(t, R4, R4 + 0.6);
      return { x, face, rot: 10 * d * (1 - u) * Math.cos(u * 7), armL: 16 + 40 * (1 - u), armR: 16 + 40 * (1 - u), sx: 1 + 0.06 * (1 - u) };
    }
    return { x, face };
  },
  look: (t) => (t > R1 && t < R4 ? { mouth: "open", brows: "focused" } : t < R1 ? { mouth: "flat", brows: "focused" } : {}),
});

const scout = (d: 1 | -1): Act => ({
  label: d > 0 ? "Look right" : "Look left",
  doing: d > 0 ? "scouting to the right" : "scouting to the left",
  dur: 3.6,
  follow: 0,
  pose(t) {
    const a = pulse(t, 0.1, 2.3, 0.4);
    const peek = pulse(t, 2.5, 3.2, 0.15);
    const dir = d * a - d * 0.9 * peek;
    const scan = 0.12 * sin((t - 0.5) * 3) * a;
    return { eyeX: dir + scan * d, eyeY: -0.2 * a, tilt: 7 * dir, rot: 4 * dir, lid: 0.3 * a, armL: d < 0 ? mix(16, 75, a) : 16, armR: d > 0 ? mix(16, 75, a) : 16, tail: 10 * sin(t * 3) };
  },
  look: (t) => (t > 0.3 && t < 2.3 ? { mouth: "o", brows: "up" } : t > 2.5 && t < 3.2 ? { brows: "up" } : {}),
});

export const ACTS = {
  idle: {
    label: "Idle",
    doing: "just hanging around",
    dur: Infinity,
    follow: 1,
    pose(t) {
      const br = sin((t * TAU) / 2.6);
      const c = t % 7.5;
      const g = pulse(c, 5.4, 6.6) - pulse(c, 2.6, 3.8);
      return { sy: 1 + 0.03 * br, sx: 1 - 0.022 * br, armL: 16 + 4 * br, armR: 16 + 4 * br, tail: 12 * sin(t * 1.7), eyeX: 0.9 * g, tilt: 5 * g };
    },
  },
  wave: {
    label: "Wave",
    doing: "saying hi",
    dur: 2.8,
    follow: 0.6,
    pose(t) {
      const w = sin(t * 10);
      return { armR: 145 + 24 * w, armL: 22, tilt: -5 + 2 * w, y: -3 * abs(sin(t * 5)), tail: 22 * sin(t * 8) };
    },
    look: () => ({ eyes: "happy", mouth: "open" }),
  },
  jump: {
    label: "Jump",
    doing: "jumping for joy",
    dur: 1.7,
    follow: 0.3,
    pose(t) {
      if (t < 0.35) {
        const u = io(t / 0.35);
        return { sy: 1 - 0.2 * u, sx: 1 + 0.14 * u, armL: 16 - 24 * u, armR: 16 - 24 * u };
      }
      if (t < 1.05) {
        const u = (t - 0.35) / 0.7;
        const k = abs(1 - 2 * u);
        return { y: -340 * u * (1 - u), sy: 1 + 0.15 * k, sx: 1 - 0.1 * k, armL: 150 - 30 * u, armR: 150 - 30 * u, legL: -16, legR: -16, tail: 35, hatY: -12 * sin(PI * u) };
      }
      if (t < 1.4) {
        const k = (1 - seg(t, 1.05, 1.4)) ** 2;
        return { sy: 1 - 0.24 * k, sx: 1 + 0.18 * k, armL: 16 + 30 * k, armR: 16 + 30 * k };
      }
      return {};
    },
    look: (t) => (t < 0.35 ? { mouth: "flat", brows: "focused" } : t < 1.2 ? { eyes: "happy", mouth: "open" } : {}),
  },
  runLeft: run(-1),
  runRight: run(1),
  hammer: {
    label: "Hammer",
    doing: "nailing up the sign",
    dur: 4.6,
    follow: 0,
    pose(t) {
      const toSign = t < 0.7 ? io(t / 0.7) : t < 3.9 ? 1 : 1 - io(seg(t, 3.9, 4.5));
      const walking = t < 0.7 || (t > 3.9 && t < 4.5);
      const s = sin(t * 18);
      // the sign shakes after every blow and settles
      const q = (t - 0.8) / 0.6 - 0.7;
      const since = q >= 0 && t < 4.2 ? (q - Math.floor(Math.min(q, 4.4))) * 0.6 : 9;
      const base = { toSign, legL: walking ? 22 * s : 0, legR: walking ? -22 * s : 0, bob: walking ? -4 * abs(s) : 0, eyeX: 0.8, eyeY: 0.15, armL: 28, armR: 35, tail: 10 * sin(t * 3), sign: 4 * Math.exp(-since * 7) * sin(since * 45) };
      if (t < 0.8 || t > 3.85) return base;
      const p = ((t - 0.8) / 0.6) % 1;
      if (p < 0.55) {
        const u = io(p / 0.55);
        return { ...base, armR: mix(55, 165, u), rot: -5 * u };
      }
      if (p < 0.7) {
        const u = seg(p, 0.55, 0.7) ** 2;
        return { ...base, armR: mix(165, 50, u), rot: mix(-5, 6, u) };
      }
      const k = 1 - seg(p, 0.7, 1);
      return { ...base, armR: mix(55, 50, k), rot: 6 * k, sy: 1 - 0.07 * k, sx: 1 + 0.05 * k };
    },
    look: (t) => (t > 0.8 && t < 3.85 ? { prop: "hammer", brows: "focused", mouth: "flat" } : { prop: "hammer" }),
  },
  fall: {
    label: "Trip",
    doing: "tripping over nothing",
    dur: 3.9,
    follow: 0,
    pose(t) {
      const F = -82, L = 50;
      if (t < 0.45) {
        const s = sin(t * 16);
        return { legL: 20 * s, legR: -20 * s, bob: -4 * abs(s), armL: 16 + 15 * s, armR: 16 - 15 * s };
      }
      if (t < 0.8) {
        const u = seg(t, 0.45, 0.8);
        return { rot: 9 * sin(u * PI), armL: 16 + 115 * u + 25 * sin(t * 30), armR: 16 + 115 * u + 25 * sin(t * 30 + 2), legR: -25 * u };
      }
      if (t < 1.05) {
        const u = seg(t, 0.8, 1.05) ** 2;
        return { rot: F * u, y: -L * u, armL: 140, armR: 140, legL: -20, legR: 20, hatY: -6 * u };
      }
      if (t < 2.55) {
        const k = 1 - seg(t, 1.05, 1.35);
        return { rot: F + 5 * sin(k * PI) * k, y: -L, sy: 1 - 0.08 * k, armL: 70, armR: 120, legL: 10, legR: -10, tail: 8 * sin(t * 2), hat: -14 };
      }
      if (t < 3.15) {
        const u = seg(t, 2.55, 3.15);
        const back = 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2; // ease out with a little overshoot
        return { rot: F * (1 - back), y: -L * (1 - io(u)), armL: 60, armR: 60, hat: -14 * (1 - u) };
      }
      const k = 1 - seg(t, 3.15, 3.9);
      return { sx: 1 + 0.07 * sin(t * 35) * k, tilt: 10 * sin(t * 20) * k };
    },
    look: (t) =>
      t < 0.45 ? {} : t < 1.05 ? { brows: "worried", mouth: "o" } : t < 2.7 ? { eyes: "x", mouth: "wobble", fx: "stars" } : t < 3.3 ? { brows: "worried", mouth: "wobble", fx: "stars" } : { brows: "worried" },
  },
  waiting: {
    label: "Waiting",
    doing: "waiting on the build",
    dur: 5.2,
    follow: 0.3,
    pose(t) {
      const tap = 16 * Math.max(0, sin(t * 9));
      const w = pulse(t, 1.2, 3.2, 0.35);
      const sigh = pulse(t, 3.5, 4.9, 0.4);
      return { legR: tap * (1 - w), armL: mix(18, 108, w), armR: 18 + 6 * sin(t * 2), eyeX: -0.9 * w, eyeY: 0.35 * w, tilt: -8 * w + 3 * sigh, sy: 1 - 0.07 * sigh, sx: 1 + 0.05 * sigh, bob: 3 * sigh, lid: 0.45 * sigh, tail: 16 * sin(t * 6) };
    },
    look: (t) => ({ prop: "watch", brows: "focused", mouth: t > 3.6 && t < 4.6 ? "o" : "flat" }),
  },
  lookLeft: scout(-1),
  lookRight: scout(1),
  sleep: {
    label: "Nap",
    doing: "napping on the job",
    dur: 7,
    follow: 0,
    pose(t) {
      const br = sin((t * TAU) / 3.4);
      const n = pulse(t, 0, 6.5, 0.8);
      return { sy: 1 - 0.08 * n + 0.04 * br * n, sx: 1 + 0.06 * n - 0.03 * br * n, bob: 5 * n, tilt: (12 + 3 * br) * n, hat: 10 * n, armL: 16 - 10 * n, armR: 16 - 10 * n, tail: 4 * sin(t) };
    },
    look: (t) => (t > 0.5 && t < 6.4 ? { eyes: "closed", mouth: "o", fx: "zzz" } : {}),
  },
  celebrate: {
    label: "Celebrate",
    doing: "celebrating a good day",
    dur: 3.4,
    follow: 0,
    pose(t) {
      const h = abs(sin(t * PI * 2.4));
      return { y: -32 * h, sy: 0.92 + 0.14 * h, sx: 1.06 - 0.1 * h, armL: 140 + 25 * sin(t * 15), armR: 140 + 25 * sin(t * 15 + PI), rot: 6 * sin(t * 7.5), tail: 30 * sin(t * 12), legL: -10 * h, legR: -10 * h };
    },
    look: () => ({ eyes: "happy", mouth: "open", fx: "confetti" }),
  },
} satisfies Record<string, Act>;

export type ActName = keyof typeof ACTS;
export const ACT_NAMES = Object.keys(ACTS) as ActName[];

/** props for a swappable feature: shown when its group is set to this variant */
const v = <K extends keyof Look>(group: K, variant: Look[K]) => ({
  "data-v": `${group}:${variant}`,
  style: (LOOK[group] === variant ? undefined : { display: "none" }) as CSSProperties | undefined,
});

const line = { fill: "none", stroke: INK, strokeWidth: 4.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ink = { stroke: INK, strokeWidth: 5, strokeLinejoin: "round" } as const;

function Eye({ part, cx }: { part: string; cx: number }) {
  return (
    <g data-part={part} transform={`translate(${cx} 124)`}>
      <g {...v("eyes", "dot")}>
        <ellipse rx="8.5" ry="11" fill={INK} />
        <circle cx="-2.6" cy="-4.2" r="3.2" fill="#fff" />
      </g>
      <path {...v("eyes", "happy")} d="M-9 4 Q0 -10 9 4" {...line} />
      <path {...v("eyes", "closed")} d="M-9 -1 Q0 8 9 -1" {...line} />
      <path {...v("eyes", "x")} d="M-7 -7 L7 7 M7 -7 L-7 7" {...line} />
    </g>
  );
}

const STAR = "M0 -8 L2.4 -2.6 L8 -2.2 L3.6 1.6 L5 7.4 L0 4.2 L-5 7.4 L-3.6 1.6 L-8 -2.2 L-2.4 -2.6 Z";
const ORBIT = "M-46 0 A46 15 0 1 1 46 0 A46 15 0 1 1 -46 0";
const CONFETTI = ["#ff6b6b", "#ffc83d", "#4ecb8f", "#7c8cff", "#ff98ad", "#57a6dc"];

export const Pim = memo(function Pim() {
  return (
    <svg viewBox="0 0 200 212" overflow="visible" className="block h-auto w-full" aria-hidden>
      <defs>
        <clipPath id="pim-body">
          <ellipse cx="100" cy="130" rx="62" ry="56" />
        </clipPath>
        <clipPath id="pim-dome">
          <path d="M64 88 Q64 46 100 44 Q136 46 136 88 Z" />
        </clipPath>
      </defs>

      <g data-part="shadow">
        <ellipse cx="100" cy="205" rx="48" ry="6" fill={INK} opacity="0.14" />
      </g>

      <g data-part="root">
        <g data-part="tail">
          <path d="M150 160 C178 160 186 132 168 116" fill="none" stroke={INK} strokeWidth="15" strokeLinecap="round" />
          <path d="M150 160 C178 160 186 132 168 116" fill="none" stroke={BODY} strokeWidth="6" strokeLinecap="round" />
        </g>
        <g data-part="legL">
          <rect x="80" y="158" width="19" height="46" rx="9.5" fill={SHADE} {...ink} />
        </g>
        <g data-part="legR">
          <rect x="101" y="158" width="19" height="46" rx="9.5" fill={SHADE} {...ink} />
        </g>

        <g data-part="body">
          <g data-part="head">
            {/* ears poke out from under the hat */}
            <path d="M66 100 L50 60 Q49 50 59 53 L96 80 Z" fill={BODY} {...ink} />
            <path d="M66 89 L58 66 L82 80 Z" fill={PINK} />
            <path d="M134 100 L150 60 Q151 50 141 53 L104 80 Z" fill={BODY} {...ink} />
            <path d="M134 89 L142 66 L118 80 Z" fill={PINK} />
          </g>

          <ellipse cx="100" cy="130" rx="62" ry="56" fill={SHADE} />
          <g clipPath="url(#pim-body)">
            <ellipse cx="91" cy="121" rx="60" ry="54" fill={BODY} />
            <ellipse cx="100" cy="164" rx="36" ry="24" fill={BELLY} />
          </g>
          <ellipse cx="100" cy="130" rx="62" ry="56" fill="none" {...ink} />
          <ellipse cx="66" cy="102" rx="11" ry="6" fill="#fff" opacity="0.75" transform="rotate(-38 66 102)" />
          <circle cx="57" cy="117" r="3" fill="#fff" opacity="0.75" />

          <g data-part="face">
            <ellipse cx="66" cy="141" rx="8" ry="5" fill={PINK} opacity="0.85" />
            <ellipse cx="134" cy="141" rx="8" ry="5" fill={PINK} opacity="0.85" />
            <Eye part="eyeL" cx={80} />
            <Eye part="eyeR" cx={120} />
            <g {...v("brows", "worried")}>
              <path d="M70 107 L88 103" {...line} />
              <path d="M112 103 L130 107" {...line} />
            </g>
            <g {...v("brows", "focused")}>
              <path d="M71 102 L88 108" {...line} />
              <path d="M112 108 L129 102" {...line} />
            </g>
            <g {...v("brows", "up")}>
              <path d="M71 104 Q79 97 88 102" {...line} />
              <path d="M112 102 Q121 97 129 104" {...line} />
            </g>

            <path {...v("mouth", "smile")} d="M91 139 Q95.5 145 100 140 Q104.5 145 109 139" {...line} strokeWidth={3.8} />
            <path {...v("mouth", "open")} d="M90 138 Q100 141 110 138 Q108 154 100 154 Q92 154 90 138 Z" fill={MOUTH} {...ink} strokeWidth={3.8} />
            <path {...v("mouth", "flat")} d="M93 142 L107 142" {...line} strokeWidth={3.8} />
            <ellipse {...v("mouth", "o")} cx="100" cy="143" rx="4.5" ry="5.5" fill={MOUTH} {...ink} strokeWidth={3.5} />
            <path {...v("mouth", "wobble")} d="M89 143 Q92.5 138 96 143 Q99.5 148 103 143 Q106.5 138 110 143" {...line} strokeWidth={3.8} />

            <g data-part="hat">
              <path d="M64 88 Q64 46 100 44 Q136 46 136 88 Z" fill={HAT} />
              <g clipPath="url(#pim-dome)">
                <path d="M118 40 Q138 50 138 90 L112 90 Q120 64 118 40 Z" fill={HAT_SHADE} />
              </g>
              <path d="M64 88 Q64 46 100 44 Q136 46 136 88 Z" fill="none" {...ink} />
              <path d="M92 46 Q91 64 92 86 L108 86 Q109 64 108 46" fill={HAT} {...ink} strokeWidth={4} />
              <path d="M76 70 Q78 58 88 52" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
              <rect x="52" y="82" width="96" height="13" rx="6.5" fill={HAT_SHADE} {...ink} />
            </g>
            <g {...v("fx", "stars")} transform="translate(100 58)">
              {[0, 0.4, 0.8].map((d) => (
                <path key={d} d={STAR} fill={HAT} stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
                  <animateMotion path={ORBIT} dur="1.2s" begin={`-${d}s`} repeatCount="indefinite" />
                </path>
              ))}
            </g>
          </g>
        </g>

        <g data-part="armL" transform="translate(44 128) rotate(16)">
          <rect x="-8.5" y="-6" width="17" height="38" rx="8.5" fill={BODY} {...ink} />
          <g {...v("prop", "watch")}>
            <rect x="-10" y="15" width="20" height="8" rx="2" fill={INK} />
            <circle cy="19" r="6.5" fill="#fff" stroke={INK} strokeWidth="3" />
            <path d="M0 15.5 V19 H2.5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </g>
        <g data-part="armR" transform="translate(156 128) rotate(-16)">
          <g {...v("prop", "hammer")}>
            <rect x="-3.5" y="16" width="7" height="44" rx="3" fill={WOOD} stroke={INK} strokeWidth="3.5" />
            <path d="M-14 52 H10 Q16 52 16 58 Q16 64 10 64 H-14 Z" fill="#9aa3b5" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          </g>
          <rect x="-8.5" y="-6" width="17" height="38" rx="8.5" fill={BODY} {...ink} />
        </g>
      </g>

      <g {...v("fx", "zzz")} fill={INK} fontWeight="800" fontFamily="var(--font-syne), sans-serif">
        <text x="148" y="72" fontSize="30" className="pim-z">z</text>
        <text x="166" y="50" fontSize="24" className="pim-z" style={{ animationDelay: "0.8s" }}>z</text>
        <text x="184" y="30" fontSize="18" className="pim-z" style={{ animationDelay: "1.6s" }}>z</text>
      </g>
      <g {...v("fx", "confetti")}>
        {Array.from({ length: 18 }, (_, i) => (
          <rect
            key={i}
            className="pim-confetti"
            x={-60 + ((i * 37) % 320)}
            y={-40 - ((i * 23) % 60)}
            width="7"
            height="11"
            rx="1.5"
            fill={CONFETTI[i % CONFETTI.length]}
            style={{ "--dx": `${((i * 29) % 50) - 25}px`, "--spin": `${360 + ((i * 71) % 360)}deg`, "--d": `${1.6 + ((i * 13) % 10) / 10}s`, "--delay": `${-((i * 0.17) % 1.6)}s` } as CSSProperties}
          />
        ))}
      </g>
    </svg>
  );
});
