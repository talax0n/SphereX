import { type BufferGeometry, type Color, Matrix4 } from "three";
import type { StationId } from "@/data/stations";
import { EXPERIENCE } from "@/data/experience";
import { AWARDS } from "@/data/awards";
import { bench as parkBench, books, casement, crate, door, flowers, lantern, potted, shrub, turned } from "./arch";
import { PAL, TONE, ball, box, cone, cyl, gable, merge, part, pill, ring, rod, slab, type Part, type Vec3 } from "./clay";
import type { Gesture } from "./gesture";

const { white, light, mid } = TONE;
const { slate, terracotta, wood, woodDark, leaf } = PAL;

export interface Identity {
  /** plinth, walls and the keeper's shirt */
  wall: string;
  /** roofs, tops and the keeper's cap */
  top: string;
}

export const IDENTITY: Record<StationId, Identity> = {
  about: { wall: "#f6c09f", top: terracotta },
  projects: { wall: "#a6dcc0", top: "#4f9488" },
  experience: { wall: "#f5dc8a", top: "#e59a5b" },
  skills: { wall: "#cdb8ec", top: "#8f74c9" },
  awards: { wall: "#a9cdee", top: "#f2c14e" },
  github: { wall: "#f4a99a", top: "#c9624f" },
  contact: { wall: "#bcd3a8", top: "#e9776a" },
  updates: { wall: "#f1d3a0", top: "#d9534f" },
  guestbook: { wall: "#f7c9d4", top: "#c65b7c" },
};

/** Plinth edge per station; projects is the agents' HQ, wide enough for an office, a gym and a nap corner. */
export const PLINTH_SIZE: Record<StationId, number> = {
  about: 3.2,
  projects: 6,
  experience: 3.2,
  skills: 3.2,
  awards: 3.2,
  github: 3.2,
  contact: 3.2,
  updates: 3.2,
  guestbook: 3.2,
};
export const PLINTH_HEIGHT = 0.4;
/** The plinth runs this far below the ground so its corners stay buried where the planet curves away, even the HQ's. */
const SKIRT = 0.9;

/** A flight of steps runs out from each plinth's front (+Z) edge, centred at this x, clear of the furniture inside. */
export const STAIRS: Record<StationId, number> = {
  about: 0,
  projects: 1.3,
  experience: 0,
  skills: -0.2,
  awards: 0,
  github: 0.5,
  contact: 0.6,
  updates: -0.3,
  guestbook: 0.4,
};
export const STAIR_W = 0.9;
export const STEPS = 3;
export const STEP_D = 0.26;
/** Top of tread `j` above the ground, counted out from the plinth. */
export const treadAt = (j: number) => (PLINTH_HEIGHT * (STEPS - j)) / (STEPS + 1);

/** [x0, z0, x1, z1] in plinth space, then for a block you can climb, the height of its top. */
export type Rect = readonly [number, number, number, number, number?];
/** The tallest rise a walker steps up without a jump: the podium's lowest step. */
export const STEP_UP = 0.46;
const around = (x: number, z: number, r: number): Rect => [x - r, z - r, x + r, z + r];

/** What a walker on the plinth bumps into. Rugs, flowers and other low things stay walkable. */
export const SOLIDS: Record<StationId, Rect[]> = {
  about: [
    [-1.47, -1.48, 1.25, -1.32],
    [-1.48, -1.47, -1.32, 1.25],
    [-1.26, -1.32, -0.64, -1.02],
    [0.1, -1.28, 1.1, -0.72],
    [0.3, -0.65, 0.7, -0.22],
    [-1.3, -0.96, -0.72, 0.66],
    around(-0.2, -0.1, 0.22),
    around(-1.2, 0.85, 0.12),
    around(1.0, 0.2, 0.2),
  ],
  projects: [
    [-2.95, -2.96, 2.95, -2.8],
    [-2.96, -2.81, -2.8, 2.95],
    [-2.75, -2.75, 0.25, -1.75],
    [-2.75, -1.4, 0.25, -0.4],
    [2.07, -2.33, 2.63, -0.98],
    [1.3, -2.47, 1.8, -1.48],
    [1.85, -0.65, 2.65, 0.35],
    [1.78, 0.7, 2.7, 1.3],
    [0.43, 1.62, 0.67, 2.38],
    [-2.6, 0.45, -1.3, 2.75],
    [0.55, -2.8, 1.15, -2.3],
    [0.68, -1.61, 1.02, -1.29],
    [0.55, -0.7, 1.15, -0.2],
    around(-0.45, 1.6, 0.18),
    ...[[0.15, 0.55], [0.1, 2.6], [-2.65, -0.05]].map(([x, z]) => around(x, z, 0.25)),
  ],
  experience: [
    ...EXPERIENCE.flatMap((_, i): Rect[] => {
      const x = 0.55 - i * 0.85;
      return [[x - 0.425, -0.975, x + 0.425, 0.275, 0.32 * (i + 1)], around(x + 0.3, 0.18, 0.07), around(x, -0.92, 0.05)];
    }),
    ...[[-0.32, -0.85], [0.32, -0.85], [-0.32, 0.15], [0.32, 0.15]].map(([dx, dz]) => around(0.55 - (EXPERIENCE.length - 1) * 0.85 + dx, -0.35 + dz, 0.05)),
    around(1.25, -0.95, 0.07),
  ],
  skills: [
    [-1.47, -1.53, 1.25, -1.37],
    [-1.53, -1.47, -1.37, 1.25],
    [-1.1, -1.25, 0.6, -0.55],
    [0.25, -0.7, 0.85, 0.35],
    around(-0.75, 0.25, 0.23),
    around(-1.15, 0.85, 0.12),
  ],
  awards: [
    ...[[0, 0.95], [-0.9, 0.65], [0.9, 0.45]].slice(0, Math.min(3, AWARDS.length)).flatMap(([x, h]): Rect[] => [
      [x - 0.4, -0.8, x + 0.4, 0, h],
      around(x, -0.4, 0.14),
    ]),
    ...[-1.25, 1.25].flatMap((x) => [around(x, -1.25, 0.16), around(x, -0.55, 0.16), around(x, 0.3, 0.07)]),
  ],
  github: [
    [-1.45, -1.45, 1.45, 0.37],
    [-1.4, 0.42, -0.78, 0.98],
    [-0.65, 0.78, -0.15, 1.12],
  ],
  contact: [
    [-1.27, -1.5, 0.27, -0.45],
    around(0.55, -0.95, 0.24),
    [-1.4, 0.15, -1.0, 0.55],
    [-0.7, 0.6, 0.1, 0.9],
    around(1.25, -1.4, 0.07),
  ],
  updates: [
    [-1.25, -0.8, 1.25, -0.6],
    around(-1.4, -0.3, 0.07),
    around(1.4, -1.1, 0.07),
    [-0.6, 0.3, 0.2, 0.6],
    around(-1.15, 0.6, 0.18),
  ],
  guestbook: [
    [-1.3, -1.05, 1.3, -0.85],
    [-1.15, 0.05, -0.35, 0.55],
    around(1.35, -0.2, 0.07),
    around(-1.4, -1.35, 0.07),
  ],
};
const H = Math.PI / 2;

/** Dioramas leave the plinth's front-right corner (x,z > half - 1.05) free for the progress tile. */

/**
 * Somewhere a villager goes to do something. `at` is the furniture's origin on the floor and `up`
 * how high the villager's feet sit above it. `kit` is the furniture in spot space: the villager
 * at the origin facing +Z (lying ones pivot at the feet, so their head points to -Z).
 */
export interface Spot {
  at: Vec3;
  yaw: number;
  up: number;
  move: Gesture;
  /** walk-cycle speed played in place, for the treadmill */
  pace?: number;
  kit: (c: Identity) => Part[];
  /** the furniture's moving parts, in spot space, driven by whoever is at the spot */
  rigs?: Rig[];
}

/** What a rig is posed from this frame. */
export interface Drive {
  /** the occupant's gesture clock while someone is at the rig's spot, else the scene clock */
  t: number;
  busy: boolean;
  /** 1 normally, 0 under reduced motion, as in gesture.ts */
  m: number;
  /** agents live right now */
  live: number;
}

/**
 * A moving piece of furniture: `parts` are modelled around a pivot at `at`, and copy k of them
 * is drawn at `pose`, a pivot-space transform written into `out` without allocating.
 */
export interface Rig {
  at: Vec3;
  parts: (c: Identity) => Part[];
  /** copies sharing the parts, like a belt's slats or a rack's LEDs */
  count?: number;
  pose(d: Drive, k: number, out: Matrix4): void;
  /** multiplies copy k's clay colour */
  tint?(d: Drive, k: number, out: Color): void;
}

/** Monitor centre and tilt in desk spot space; workplaces.tsx draws the live screen on its seat-facing side. */
export const SCREEN = { at: [0, 0.8, 0.68] as Vec3, tilt: 0.1, depth: 0.05, w: 0.54, h: 0.32 };

const tmp = new Matrix4();
const frac = (x: number) => x - Math.floor(x);
/** crowd.tsx eases a villager toward its work pose at 4/s, so the body trails a gesture's sine at rate w by this phase */
const lag = (w: number) => Math.atan(w / 4);

/** Seat 0.24 up, desk and monitor ahead; the seat itself is the chair rig. */
const desk = ({ top }: Identity): Part[] => [
  part(cyl(0.12, 0.14, 0.03), [0, 0.015, 0], { tone: mid, surf: "metal" }),
  part(cyl(0.03, 0.03, 0.2), [0, 0.1, 0], { tone: mid, surf: "metal" }),
  part(box(0.9, 0.06, 0.5, 0.03), [0, 0.5, 0.52], { tone: white, surf: "wood" }),
  part(box(0.06, 0.48, 0.44, 0.02), [-0.4, 0.24, 0.52], { tone: top, surf: "wood" }),
  part(box(0.06, 0.48, 0.44, 0.02), [0.4, 0.24, 0.52], { tone: top, surf: "wood" }),
  part(box(0.36, 0.02, 0.13, 0.01), [0, 0.54, 0.34], { tone: light, surf: "fabric" }),
  part(cyl(0.03, 0.08, 0.14), [0, 0.6, 0.72], { tone: mid, surf: "metal" }),
  part(box(0.62, 0.4, SCREEN.depth, 0.03), SCREEN.at, { rot: [SCREEN.tilt, 0, 0], tone: white, surf: "wood" }),
];

/** swivels a little with the typist's glances, which run on the same clock in gesture.ts */
const chair: Rig = {
  at: [0, 0, 0],
  parts: ({ top }) => [
    part(cyl(0.2, 0.2, 0.06), [0, 0.21, 0], { tone: top, surf: "fabric" }),
    part(box(0.32, 0.22, 0.05, 0.025), [0, 0.37, -0.2], { tone: top, surf: "fabric" }),
  ],
  pose: ({ t, busy, m }, _, out) => void out.makeRotationY(busy ? Math.sin(t * 0.7 - lag(0.7)) * 0.3 * m : 0),
};

const SLATS = 7;
const BELT = 1.05;
const treadmill = ({ top }: Identity): Part[] => [
  part(box(0.56, 0.1, 1.15, 0.04), [0, 0.05, 0.1], { tone: mid, surf: "metal" }),
  part(box(0.48, 0.015, 1.08, 0.005), [0, 0.1, 0.08], { tone: slate, surf: "metal" }),
  part(box(0.05, 0.8, 0.05, 0.02), [-0.25, 0.5, 0.62], { tone: mid, surf: "metal" }),
  part(box(0.05, 0.8, 0.05, 0.02), [0.25, 0.5, 0.62], { tone: mid, surf: "metal" }),
  part(box(0.6, 0.12, 0.2, 0.04), [0, 0.92, 0.62], { rot: [-0.4, 0, 0], tone: top, surf: "metal" }),
  part(cyl(0.025, 0.025, 0.55), [0, 0.78, 0.5], { rot: [0, 0, H], tone: slate, surf: "metal" }),
];

/** Slats run back under the runner's feet and wrap round to the front. */
const belt: Rig = {
  at: [0, 0.115, 0.08],
  count: SLATS,
  parts: () => [part(box(0.46, 0.02, BELT / SLATS - 0.03, 0.008), [0, 0, 0], { tone: "#5b6474" })],
  pose: ({ t, busy, m }, k, out) =>
    void out.makeTranslation(0, 0, BELT / 2 - frac(k / SLATS + (busy ? t * 1.3 * m : 0)) * BELT),
};

/** Lying: feet at the origin, so the bar racks over the chest about 0.45 back. */
const bench = ({ top }: Identity): Part[] => [
  part(box(0.36, 0.08, 1.0, 0.04), [0, 0.3, -0.5], { tone: top, surf: "fabric" }),
  part(box(0.3, 0.26, 0.06, 0.02), [0, 0.13, -0.15], { tone: mid, surf: "metal" }),
  part(box(0.3, 0.26, 0.06, 0.02), [0, 0.13, -0.9], { tone: mid, surf: "metal" }),
  part(box(0.05, 0.9, 0.05, 0.02), [-0.4, 0.45, -0.45], { tone: mid, surf: "metal" }),
  part(box(0.05, 0.9, 0.05, 0.02), [0.4, 0.45, -0.45], { tone: mid, surf: "metal" }),
];

/** Rides the press gesture's own sine, so the bar is up exactly when the arms are. */
const barbell: Rig = {
  at: [0, 0.86, -0.45],
  parts: () => [
    part(cyl(0.022, 0.022, 1.1), [0, 0, 0], { rot: [0, 0, H], tone: slate, surf: "metal" }),
    part(cyl(0.16, 0.16, 0.06), [-0.5, 0, 0], { rot: [0, 0, H], tone: slate, surf: "metal" }),
    part(cyl(0.16, 0.16, 0.06), [0.5, 0, 0], { rot: [0, 0, H], tone: slate, surf: "metal" }),
  ],
  pose: ({ t, busy, m }, _, out) =>
    void out.makeTranslation(0, busy ? -0.3 + (0.5 + Math.sin(t * 2.6 - lag(2.6)) * 0.5) * m * 0.25 : 0, 0),
};

/** Seated on the saddle 0.42 up, pedalling the flywheel ahead. */
const bike = ({ top }: Identity): Part[] => [
  part(box(0.5, 0.06, 0.14, 0.03), [0, 0.03, -0.3], { tone: mid, surf: "metal" }),
  part(box(0.5, 0.06, 0.14, 0.03), [0, 0.03, 0.55], { tone: mid, surf: "metal" }),
  part(box(0.1, 0.06, 0.9, 0.03), [0, 0.06, 0.12], { tone: slate, surf: "metal" }),
  part(cyl(0.03, 0.03, 0.36), [0, 0.22, -0.05], { rot: [-0.2, 0, 0], tone: mid, surf: "metal" }),
  part(box(0.24, 0.06, 0.3, 0.03), [0, 0.41, -0.06], { tone: top, surf: "fabric" }),
  part(box(0.09, 0.8, 0.09, 0.03), [0, 0.42, 0.5], { rot: [-0.25, 0, 0], tone: top, surf: "fabric" }),
  part(cyl(0.025, 0.025, 0.44), [0, 0.8, 0.42], { rot: [0, 0, H], tone: slate, surf: "metal" }),
  part(cyl(0.2, 0.2, 0.07), [0, 0.26, 0.42], { rot: [0, 0, H], tone: slate, surf: "metal" }),
  part(box(0.16, 0.1, 0.06, 0.02), [0, 0.86, 0.5], { rot: [-0.6, 0, 0], tone: white }),
];

const PEDAL = 6;
/** Cranks turn with the pedal gesture: the left pedal is on top when the left foot lifts. */
const cranks: Rig = {
  at: [0, 0.22, 0.12],
  parts: () => [
    part(cyl(0.05, 0.05, 0.16), [0, 0, 0], { rot: [0, 0, H], tone: slate }),
    part(box(0.03, 0.15, 0.03, 0.01), [-0.1, 0.065, 0], { tone: mid }),
    part(box(0.03, 0.15, 0.03, 0.01), [0.1, -0.065, 0], { tone: mid }),
    part(box(0.1, 0.025, 0.07, 0.01), [-0.15, 0.13, 0], { tone: slate }),
    part(box(0.1, 0.025, 0.07, 0.01), [0.15, -0.13, 0], { tone: slate }),
  ],
  pose: ({ t, busy, m }, _, out) => void out.makeRotationX(busy ? (t * PEDAL - lag(PEDAL) - H) * m : 0),
};

/** Standing in front of a bag on a stand: the bag hangs 0.5 ahead. */
const bagStand = ({ top }: Identity): Part[] => [
  part(cyl(0.26, 0.3, 0.08), [0, 0.04, 0.95], { tone: mid, surf: "metal" }),
  part(cyl(0.035, 0.035, 1.35), [0, 0.7, 0.95], { tone: slate, surf: "metal" }),
  part(box(0.06, 0.06, 0.55, 0.02), [0, 1.36, 0.72], { tone: slate, surf: "metal" }),
  part(cyl(0.012, 0.012, 0.1), [0, 1.29, 0.5], { tone: mid, surf: "metal" }),
  part(box(0.7, 0.02, 0.7, 0.01), [0, 0.025, 0.15], { tone: top, surf: "fabric" }),
];

const PUNCH = 7;
/** Knocked back by each jab of the punch gesture, a beat after the fist lands. */
const bag: Rig = {
  at: [0, 1.25, 0.5],
  parts: ({ top }) => [
    part(cyl(0.17, 0.17, 0.06), [0, -0.03, 0], { tone: slate, surf: "metal" }),
    part(pill(0.17, 0.42), [0, -0.42, 0], { tone: terracotta, surf: "fabric" }),
    part(cyl(0.175, 0.175, 0.08), [0, -0.3, 0], { tone: top, surf: "fabric" }),
  ],
  pose: ({ t, busy, m }, _, out) => {
    const hit = busy ? Math.abs(Math.sin(t * PUNCH - lag(PUNCH) - 0.3)) * m : 0;
    out.makeRotationZ(busy ? Math.sin(t * PUNCH - lag(PUNCH) - 0.3) * 0.08 * m : 0).premultiply(tmp.makeRotationX(-0.04 - hit * 0.16));
  },
};

const dumbbell = (x: number, y: number, z: number, tone: string): Part[] => [
  part(cyl(0.025, 0.025, 0.24), [x, y, z], { rot: [0, 0, H], tone: slate }),
  part(ball(0.07), [x - 0.12, y, z], { tone }),
  part(ball(0.07), [x + 0.12, y, z], { tone }),
];

const mat = ({ top }: Identity): Part[] => [
  part(box(0.75, 0.03, 0.95, 0.015), [0, 0.015, 0], { tone: leaf[0], surf: "fabric" }),
  part(box(0.24, 0.42, 0.75, 0.04), [-0.65, 0.21, 0], { tone: white, surf: "wood" }),
  ...[-0.22, 0.05, 0.3].flatMap((z, i) => dumbbell(-0.65, 0.48, z, ["#f29a83", top, "#8cc6e6"][i])),
];

/** Lying: feet at the origin, head on the pillow 1.0 back against the headboard. */
const bed = ({ top }: Identity): Part[] => [
  part(box(0.62, 0.22, 1.25, 0.05), [0, 0.11, -0.55], { tone: wood, surf: "wood" }),
  part(box(0.66, 0.5, 0.07, 0.03), [0, 0.25, -1.18], { tone: woodDark, surf: "wood" }),
  part(box(0.56, 0.1, 1.15, 0.05), [0, 0.27, -0.55], { tone: white, surf: "fabric" }),
  part(box(0.42, 0.08, 0.22, 0.04), [0, 0.35, -1.0], { tone: light, surf: "fabric" }),
  part(box(0.58, 0.05, 0.55, 0.03), [0, 0.33, -0.2], { tone: top, surf: "fabric" }),
];

/**
 * Every agent lives in the projects HQ: desks in the office at the back, the gym down the right,
 * beds for finished ones in the nap corner at the front left. A spot's index is its identity;
 * desks and gym together seat MAX_AGENTS so nobody waits at the door.
 */
export const PLACES = {
  desk: {
    station: "projects",
    spots: [-1.95, -0.6].flatMap((z) =>
      [-2.3, -1.25, -0.2].map((x): Spot => ({ at: [x, 0, z], yaw: Math.PI, up: 0.24, move: "type", kit: desk, rigs: [chair] })),
    ),
  },
  gym: {
    station: "projects",
    spots: [
      { at: [2.35, 0, -1.6], yaw: Math.PI, up: 0.12, move: "run", pace: 1.6, kit: treadmill, rigs: [belt] },
      { at: [1.55, 0, -1.85], yaw: Math.PI, up: 0.42, move: "pedal", kit: bike, rigs: [cranks] },
      { at: [2.25, 0, 0.35], yaw: 0, up: 0.53, move: "press", kit: bench, rigs: [barbell] },
      { at: [1.45, 0, 1.0], yaw: H, up: 0.02, move: "punch", kit: bagStand, rigs: [bag] },
      { at: [1.2, 0, 2.0], yaw: 0, up: 0.03, move: "lift", kit: mat },
    ],
  },
  bed: {
    station: "projects",
    spots: [0.8, 1.6, 2.4].map((z): Spot => ({ at: [-1.4, 0, z], yaw: H, up: 0.51, move: "sleep", kit: bed })),
  },
} satisfies Record<string, { station: StationId; spots: Spot[] }>;
export type Place = keyof typeof PLACES;

const kits = (place: Place, c: Identity): Part[] => PLACES[place].spots.flatMap((s: Spot) => turned(s.kit(c), s.at, s.yaw));

const RACK: Vec3 = [0.85, 0, -2.55];
const COOLER: Vec3 = [0.85, 0, -1.45];
const COFFEE: Vec3 = [0.85, 0, -0.45];
const FAN: Vec3 = [-0.45, 0, 1.6];
const PLANTS: Vec3[] = [[0.15, 0, 0.55], [0.1, 0, 2.6], [-2.65, 0, -0.05]];

/** Blinks faster the more agents are live; under reduced motion a steady share of lights shows how many. */
const leds: Rig = {
  at: [RACK[0], 0, RACK[2] + 0.26],
  count: 12,
  parts: () => [part(box(0.09, 0.05, 0.02, 0.01), [0, 0, 0], { tone: white })],
  pose: (_, k, out) => void out.makeTranslation(((k % 3) - 1) * 0.14, 0.3 + Math.floor(k / 3) * 0.24, 0),
  tint: ({ t, m, live }, k, out) => {
    const on = m ? hash(k * 131 + Math.floor(t * (1.5 + live * 0.8) + k * 0.37)) < 0.35 + live * 0.05 : k < live;
    out.set(on ? "#8fcf9a" : "#4a5262");
  },
};

const PUFFS = 3;
/** Rise, swell and shrink away above the cup. */
const steam: Rig = {
  at: [COFFEE[0] + 0.1, 0.86, COFFEE[2] + 0.12],
  count: PUFFS,
  parts: () => [part(ball(0.06, 8, 6), [0, 0, 0], { tone: white })],
  pose: ({ t }, k, out) => {
    const p = frac(t * 0.45 + k / PUFFS);
    const s = Math.sin(p * Math.PI) * (0.6 + p * 0.6);
    out.makeScale(s, s, s).setPosition(Math.sin(p * 6 + k) * 0.04, p * 0.45, 0);
  },
};

const BUBBLES = 3;
const bubbles: Rig = {
  at: [COOLER[0], 0.66, COOLER[2] + 0.11],
  count: BUBBLES,
  parts: () => [part(ball(0.035, 8, 6), [0, 0, 0], { tone: "#eaf6fb" })],
  pose: ({ t }, k, out) => {
    const p = frac(t * 0.3 + k / BUBBLES);
    const s = Math.min(1, p * 6, (1 - p) * 6);
    out.makeScale(s, s, s).setPosition((hash(k) - 0.5) * 0.12, p * 0.3, 0);
  },
};

/** The head sweeps side to side and the blades spin on it, so the blades share the head's sweep. */
const sweep = (t: number) => -H + Math.sin(t * 0.6) * 0.7;
const fanHead: Rig = {
  at: [FAN[0], 0.92, FAN[2]],
  parts: () => [
    part(ball(0.08), [0, 0, -0.02], { tone: white }),
    part(ring(0.2, 0.018, 6, 24), [0, 0, 0.08], { tone: mid }),
  ],
  pose: ({ t }, _, out) => void out.makeRotationY(sweep(t)),
};
const blades: Rig = {
  at: [FAN[0], 0.92, FAN[2]],
  parts: ({ top }) =>
    [0, 1, 2].map((i) => {
      const a = (i * 2 * Math.PI) / 3;
      return part(box(0.08, 0.17, 0.015, 0.007), [-Math.sin(a) * 0.09, Math.cos(a) * 0.09, 0.08], { rot: [0, 0, a], tone: top });
    }),
  pose: ({ t }, _, out) => void out.makeRotationZ(t * 9).premultiply(tmp.makeRotationY(sweep(t))),
};

/** Leaves sway on their pots, each out of step with the others. */
const fronds = (at: Vec3, k: number): Rig => ({
  at: [at[0], 0.26, at[2]],
  parts: () => [
    part(ball(0.22), [0, 0.18, 0], { tone: leaf[1] }),
    part(ball(0.16), [0.12, 0.38, 0.06], { tone: leaf[0] }),
    part(ball(0.13), [-0.1, 0.34, -0.08], { tone: leaf[2] }),
  ],
  pose: ({ t }, _, out) => void out.makeRotationZ(Math.sin(t * 1.1 + k * 2) * 0.06).premultiply(tmp.makeRotationX(Math.sin(t * 0.8 + k) * 0.05)),
});

/** The HQ's always-on bits, in plinth space; `t` is the scene clock. */
export const AMBIENCE = {
  station: "projects",
  rigs: [leds, steam, bubbles, fanHead, blades, ...PLANTS.map(fronds)],
} satisfies { station: StationId; rigs: Rig[] };

/** Each distinct rig once, in a fixed order: the baked `rigs` model names its meshes by index here. */
export const RIGS: Rig[] = [
  ...new Set([...Object.values(PLACES).flatMap(({ spots }) => spots.flatMap((s: Spot) => s.rigs ?? [])), ...AMBIENCE.rigs]),
];

/** Cheap integer hash to [0, 1). */
export function hash(n: number) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const WALL_T = 0.14;
const BRICK = "#c98a6b";

/** A back wall along x at `z`: a brick footing under rendered plaster. */
const wallX = (x0: number, x1: number, z: number, h: number, tone: string): Part[] => [
  part(box(x1 - x0, 0.3, WALL_T + 0.02, 0.03), [(x0 + x1) / 2, 0.15, z], { tone: BRICK, surf: "brick" }),
  part(box(x1 - x0, h - 0.3, WALL_T, 0.03), [(x0 + x1) / 2, 0.3 + (h - 0.3) / 2, z], { tone, surf: "plaster" }),
];
/** The same along z at `x`. */
const wallZ = (z0: number, z1: number, x: number, h: number, tone: string): Part[] => [
  part(box(WALL_T + 0.02, 0.3, z1 - z0, 0.03), [x, 0.15, (z0 + z1) / 2], { tone: BRICK, surf: "brick" }),
  part(box(WALL_T, h - 0.3, z1 - z0, 0.03), [x, 0.3 + (h - 0.3) / 2, (z0 + z1) / 2], { tone, surf: "plaster" }),
];
const PITCH = 0.2;
/** Tiled eaves along the top of a back wall, sloping down and away from the open room. */
const eaveX = (x0: number, x1: number, z: number, y: number, tone: string): Part[] => [
  part(box(x1 - x0, 0.07, 0.8, 0.03), [(x0 + x1) / 2, y, z - 0.14], { rot: [-PITCH, 0, 0], tone, surf: "tile" }),
];
const eaveZ = (z0: number, z1: number, x: number, y: number, tone: string): Part[] => [
  part(box(0.8, 0.07, z1 - z0, 0.03), [x - 0.14, y, (z0 + z1) / 2], { rot: [0, 0, PITCH], tone, surf: "tile" }),
];

/** Theo's house: a cutaway cottage room with a tiled roof, chimney, shelves, a desk and a reading nook. */
function about({ wall, top }: Identity): Part[] {
  return [
    part(box(2.7, 0.08, 2.7, 0.03), [-0.1, 0.04, -0.1], { tone: "#e2c49a", surf: "wood" }),
    ...wallX(-1.47, 1.25, -1.4, 1.6, wall),
    ...wallZ(-1.47, 1.25, -1.4, 1.6, wall),
    ...eaveX(-1.6, 1.35, -1.4, 1.7, top),
    ...eaveZ(-1.6, 1.35, -1.4, 1.7, top),
    part(box(0.38, 1.0, 0.38, 0.03), [-1.2, 1.95, -1.2], { tone: BRICK, surf: "brick" }),
    part(box(0.46, 0.08, 0.46, 0.03), [-1.2, 2.48, -1.2], { tone: slate, surf: "stone" }),
    ...casement([0.7, 1.05, -1.4], 0.5, 0.5, 0, { shutters: top, box: true }),
    ...casement([-1.4, 1.1, -0.3], 0.55, 0.42, H, { shutters: top }),
    ...door([-1.4, 0.08, 0.85], 0.42, 0.95, H),
    // a framed picture over the shelf
    part(box(0.4, 0.3, 0.04, 0.01), [-0.25, 1.2, -1.31], { tone: wood, surf: "wood" }),
    part(box(0.32, 0.22, 0.02, 0.01), [-0.25, 1.2, -1.29], { tone: "#8cc6e6" }),
    part(ball(0.06, 8, 6), [-0.3, 1.18, -1.28], { scale: [1, 0.6, 0.3], tone: leaf[1] }),
    // bookshelf in the back corner
    part(box(0.62, 1.15, 0.3, 0.02), [-0.95, 0.66, -1.17], { tone: woodDark, surf: "wood" }),
    ...[0.32, 0.66, 1.0].flatMap((y, i) => [
      part(box(0.54, 0.03, 0.26, 0.01), [-0.95, y - 0.02, -1.15], { tone: wood, surf: "wood" }),
      ...books([-1.21, y, -1.13], 6 + (i % 2), i * 7),
    ]),
    // desk, monitor, lamp
    part(box(1.0, 0.07, 0.55, 0.02), [0.6, 0.55, -1.0], { tone: wood, surf: "wood" }),
    part(box(0.07, 0.5, 0.5, 0.02), [0.15, 0.28, -1.0], { tone: woodDark, surf: "wood" }),
    part(box(0.36, 0.36, 0.5, 0.02), [0.88, 0.28, -1.0], { tone: woodDark, surf: "wood" }),
    part(box(0.2, 0.02, 0.01, 0.005), [0.88, 0.38, -0.74], { tone: "#f2c14e", surf: "metal" }),
    part(box(0.52, 0.34, 0.04, 0.02), [0.45, 0.85, -1.12], { tone: slate, surf: "metal" }),
    part(box(0.46, 0.28, 0.01, 0.005), [0.45, 0.85, -1.095], { tone: "#9fd3ff", surf: "glow" }),
    part(cyl(0.03, 0.06, 0.16), [0.45, 0.66, -1.12], { tone: mid, surf: "metal" }),
    part(box(0.34, 0.015, 0.12, 0.005), [0.45, 0.59, -0.88], { tone: light }),
    part(cyl(0.08, 0.1, 0.03), [0.95, 0.6, -1.12], { tone: top, surf: "metal" }),
    part(cyl(0.012, 0.012, 0.36), [0.95, 0.78, -1.12], { tone: slate, surf: "metal" }),
    part(cone(0.12, 0.14), [0.95, 0.99, -1.12], { rot: [Math.PI, 0, 0], tone: top }),
    part(ball(0.045, 8, 6), [0.95, 0.92, -1.12], { tone: PAL.bulb, surf: "glow" }),
    part(cyl(0.035, 0.03, 0.08), [0.2, 0.63, -0.85], { tone: white }),
    // desk chair
    part(cyl(0.2, 0.2, 0.07), [0.5, 0.34, -0.45], { tone: top, surf: "fabric" }),
    part(cyl(0.03, 0.03, 0.3), [0.5, 0.17, -0.45], { tone: slate, surf: "metal" }),
    part(cyl(0.16, 0.16, 0.03), [0.5, 0.02, -0.45], { tone: slate, surf: "metal" }),
    part(box(0.38, 0.34, 0.06, 0.03), [0.5, 0.58, -0.25], { tone: top, surf: "fabric" }),
    ...potted([1.0, 0.08, 0.2], 1.1, 1),
    // the reading nook: rug, sofa, cushions, a side table and a floor lamp
    part(cyl(0.75, 0.75, 0.02), [-0.25, 0.09, -0.1], { scale: [1, 1, 0.8], tone: top, surf: "fabric" }),
    part(ring(0.66, 0.025, 4, 32), [-0.25, 0.1, -0.1], { rot: [H, 0, 0], scale: [1, 0.8, 1], tone: white, surf: "fabric" }),
    part(box(0.55, 0.22, 1.3, 0.06), [-1.0, 0.21, -0.15], { tone: wall, surf: "fabric" }),
    part(box(0.18, 0.55, 1.3, 0.06), [-1.22, 0.42, -0.15], { tone: wall, surf: "fabric" }),
    part(box(0.55, 0.34, 0.16, 0.06), [-1.0, 0.27, -0.88], { tone: wall, surf: "fabric" }),
    part(box(0.55, 0.34, 0.16, 0.06), [-1.0, 0.27, 0.58], { tone: wall, surf: "fabric" }),
    part(box(0.45, 0.08, 0.58, 0.04), [-0.98, 0.35, -0.47], { tone: white, surf: "fabric" }),
    part(box(0.45, 0.08, 0.58, 0.04), [-0.98, 0.35, 0.17], { tone: white, surf: "fabric" }),
    part(box(0.12, 0.26, 0.26, 0.05), [-1.08, 0.5, 0.35], { rot: [0, 0, 0.3], tone: PAL.autumn[0], surf: "fabric" }),
    part(box(0.12, 0.24, 0.24, 0.05), [-1.08, 0.5, -0.65], { rot: [0, 0, 0.25], tone: "#8cc6e6", surf: "fabric" }),
    part(cyl(0.22, 0.22, 0.05), [-0.2, 0.33, -0.1], { tone: wood, surf: "wood" }),
    part(cyl(0.04, 0.04, 0.2), [-0.2, 0.2, -0.1], { tone: woodDark, surf: "wood" }),
    part(cyl(0.05, 0.04, 0.08), [-0.15, 0.4, -0.05], { tone: white }),
    part(box(0.16, 0.03, 0.11, 0.01), [-0.28, 0.37, -0.15], { rot: [0, 0.4, 0], tone: "#e9776a" }),
    part(cyl(0.012, 0.012, 1.0), [-1.2, 0.58, 0.85], { tone: slate, surf: "metal" }),
    part(cyl(0.1, 0.12, 0.03), [-1.2, 0.1, 0.85], { tone: slate, surf: "metal" }),
    part(cone(0.16, 0.2), [-1.2, 1.12, 0.85], { tone: white, surf: "fabric" }),
    part(ball(0.05, 8, 6), [-1.2, 1.04, 0.85], { tone: PAL.bulb, surf: "glow" }),
  ];
}

const pot = (at: Vec3): Part[] => [
  part(cyl(0.16, 0.12, 0.26), [at[0], 0.13, at[2]], { tone: terracotta }),
  part(cyl(0.05, 0.05, 0.12), [at[0], 0.3, at[2]], { tone: PAL.trunk, surf: "bark" }),
];

/** The agents' HQ: a walled studio with an office at the back, gym rubber down the right and a rug in the nap corner. */
function projects(c: Identity): Part[] {
  const { wall, top } = c;
  return [
    part(box(3.3, 0.02, 3.1, 0.01), [-1.25, 0.01, -1.4], { tone: "#e2c49a", surf: "wood" }),
    part(box(1.75, 0.02, 4.45, 0.01), [2.05, 0.01, -0.7], { tone: "#8a96a3", surf: "fabric" }),
    part(box(1.9, 0.02, 2.5, 0.01), [-1.95, 0.01, 1.6], { tone: "#f3d9b8", surf: "fabric" }),
    ...wallX(-2.95, 2.95, -2.88, 1.3, wall),
    ...wallZ(-2.81, 2.95, -2.88, 1.3, wall),
    ...eaveX(-3.05, 3.05, -2.88, 1.4, top),
    ...eaveZ(-3.05, 3.05, -2.88, 1.4, top),
    ...[-1.75, -0.1, 1.9].flatMap((x) => casement([x, 0.85, -2.88], 0.62, 0.42, 0, { shutters: top })),
    ...[-1.2, 0.6].flatMap((z) => casement([-2.88, 0.85, z], 0.62, 0.42, H)),
    // a sign over the office: the studio's name in the HQ colours
    part(box(1.1, 0.28, 0.05, 0.02), [-1.25, 1.55, -2.84], { tone: top, surf: "wood" }),
    part(box(0.9, 0.1, 0.02, 0.01), [-1.25, 1.55, -2.81], { tone: white, surf: "glow" }),
    ...kits("desk", c),
    ...kits("gym", c),
    ...kits("bed", c),
    // the kitchen strip between office and gym: server rack, water cooler, coffee
    part(box(0.6, 1.3, 0.5, 0.05), [RACK[0], 0.65, RACK[2]], { tone: slate, surf: "metal" }),
    part(box(0.5, 0.06, 0.4, 0.02), [RACK[0], 1.33, RACK[2]], { tone: top, surf: "metal" }),
    part(box(0.34, 0.6, 0.32, 0.04), [COOLER[0], 0.3, COOLER[2]], { tone: white, surf: "metal" }),
    part(cyl(0.14, 0.14, 0.34), [COOLER[0], 0.78, COOLER[2]], { tone: "#a9d8ec", surf: "glass" }),
    part(cyl(0.06, 0.08, 0.05), [COOLER[0], 0.97, COOLER[2]], { tone: "#a9d8ec", surf: "glass" }),
    part(box(0.06, 0.04, 0.05, 0.01), [COOLER[0], 0.48, COOLER[2] + 0.17], { tone: slate, surf: "metal" }),
    part(box(0.55, 0.56, 0.45, 0.04), [COFFEE[0], 0.28, COFFEE[2]], { tone: PAL.wood, surf: "wood" }),
    part(box(0.6, 0.04, 0.5, 0.02), [COFFEE[0], 0.58, COFFEE[2]], { tone: white, surf: "stone" }),
    part(box(0.26, 0.32, 0.24, 0.04), [COFFEE[0] - 0.08, 0.76, COFFEE[2] - 0.04], { tone: slate, surf: "metal" }),
    part(box(0.2, 0.04, 0.08, 0.02), [COFFEE[0] - 0.08, 0.86, COFFEE[2] + 0.1], { tone: mid, surf: "metal" }),
    part(cyl(0.05, 0.04, 0.09), [COFFEE[0] + 0.1, 0.65, COFFEE[2] + 0.12], { tone: top }),
    // the fan's stand; its head and blades are rigs
    part(cyl(0.16, 0.18, 0.04), [FAN[0], 0.02, FAN[2]], { tone: mid, surf: "metal" }),
    part(cyl(0.025, 0.025, 0.85), [FAN[0], 0.45, FAN[2]], { tone: mid, surf: "metal" }),
    ...PLANTS.flatMap(pot),
  ];
}

/** Stone steps climbing away from the camera, one per job, with a rail, lanterns and a pergola at the top. */
function experience({ wall, top }: Identity): Part[] {
  const n = EXPERIENCE.length;
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    const h = 0.32 * (i + 1);
    const x = 0.55 - i * 0.85;
    parts.push(
      part(box(0.85, h, 1.25, 0.05), [x, h / 2, -0.35], { tone: i % 2 ? white : wall, surf: "stone" }),
      part(box(0.87, 0.05, 1.27, 0.02), [x, h - 0.02, -0.35], { tone: mid, surf: "stone" }),
      ...lantern([x + 0.3, h, 0.18], 0.45, top),
      part(rod(0.025, 0.55), [x, h + 0.27, -0.92], { tone: woodDark, surf: "wood" }),
    );
  }
  const peak = 0.32 * n;
  const x = 0.55 - (n - 1) * 0.85;
  // the handrail rides up the back edge from step to step
  const rise = Math.atan2(0.32, 0.85);
  parts.push(part(box(0.85 * n, 0.05, 0.05, 0.02), [0.55 - ((n - 1) * 0.85) / 2, 0.32 * (n + 1) / 2 + 0.55, -0.92], { rot: [0, 0, -rise], tone: wood, surf: "wood" }));
  for (const [dx, dz] of [[-0.32, -0.85], [0.32, -0.85], [-0.32, 0.15], [0.32, 0.15]] as const)
    parts.push(part(box(0.07, 0.95, 0.07, 0.02), [x + dx, peak + 0.47, -0.35 + dz], { tone: white, surf: "wood" }));
  for (let i = 0; i < 6; i++)
    parts.push(part(box(0.06, 0.05, 1.15, 0.02), [x - 0.35 + i * 0.14, peak + 0.97, -0.7 + 0.35], { tone: wood, surf: "wood" }));
  parts.push(
    part(box(0.78, 0.06, 0.06, 0.02), [x, peak + 0.92, -1.2], { tone: white, surf: "wood" }),
    part(box(0.78, 0.06, 0.06, 0.02), [x, peak + 0.92, -0.2], { tone: white, surf: "wood" }),
    part(cyl(0.025, 0.025, 0.7), [x + 0.25, peak + 1.3, -1.2], { tone: slate, surf: "metal" }),
    part(box(0.4, 0.24, 0.03, 0.02), [x + 0.45, peak + 1.53, -1.2], { tone: top, surf: "fabric" }),
    ...shrub([x - 0.25, peak, -0.5], 0.13, 2),
    ...flowers([1.05, 0, 0.45], [-0.4, 0, 0.45], 9, 3),
    // a signpost at the foot of the stairs
    part(box(0.06, 0.8, 0.06, 0.02), [1.25, 0.4, -0.95], { tone: woodDark, surf: "wood" }),
    part(box(0.42, 0.12, 0.03, 0.02), [1.32, 0.68, -0.95], { rot: [0, 0, 0.08], tone: wall, surf: "wood" }),
    part(box(0.36, 0.12, 0.03, 0.02), [1.18, 0.5, -0.95], { rot: [0, 0, -0.1], tone: top, surf: "wood" }),
  );
  return parts;
}

const block = (at: Vec3, size: number, tone: string, yaw = 0): Part =>
  part(box(size, size, size, 0.05), at, { rot: [0, yaw, 0], tone });

/** A workshop: brick-footed walls, a tool wall and workbench, and the stack itself as blocks piled up beside it. */
function skills({ wall, top }: Identity): Part[] {
  return [
    part(box(2.7, 0.02, 2.7, 0.01), [-0.1, 0.01, -0.1], { tone: light, surf: "stone" }),
    ...wallX(-1.47, 1.25, -1.45, 1.75, wall),
    ...wallZ(-1.47, 1.25, -1.45, 1.75, wall),
    ...eaveX(-1.6, 1.35, -1.45, 1.85, top),
    ...eaveZ(-1.6, 1.35, -1.45, 1.85, top),
    ...casement([-1.45, 1.05, 0.25], 0.6, 0.45, H, { box: true }),
    // the bench
    part(box(1.7, 0.08, 0.7, 0.03), [-0.25, 0.62, -0.9], { tone: wood, surf: "wood" }),
    ...[-1.0, 0.5].flatMap((x) => [-1.15, -0.65].map((z) => part(box(0.08, 0.58, 0.08, 0.02), [x, 0.29, z], { tone: woodDark, surf: "wood" }))),
    part(box(1.6, 0.05, 0.6, 0.02), [-0.25, 0.2, -0.9], { tone: woodDark, surf: "wood" }),
    ...crate([-0.75, 0.22, -0.95], 0.26, 0.1),
    ...crate([0.15, 0.22, -0.95], 0.22, -0.2, PAL.woodDark),
    // the tool wall
    part(box(1.7, 0.85, 0.05, 0.02), [-0.25, 1.15, -1.34], { tone: "#d9b98b", surf: "wood" }),
    part(box(0.07, 0.4, 0.04, 0.02), [-0.8, 1.15, -1.29], { tone: slate, surf: "metal" }),
    part(ring(0.06, 0.02), [-0.8, 1.38, -1.29], { tone: slate, surf: "metal" }),
    part(cyl(0.025, 0.025, 0.32), [-0.5, 1.1, -1.29], { tone: wood, surf: "wood" }),
    part(box(0.18, 0.08, 0.06, 0.02), [-0.5, 1.28, -1.29], { tone: slate, surf: "metal" }),
    part(box(0.3, 0.06, 0.04, 0.02), [0.1, 1.25, -1.29], { rot: [0, 0, 0.5], tone: top, surf: "metal" }),
    part(ring(0.12, 0.025), [0.35, 1.0, -1.29], { tone: "#e9776a" }),
    ...[-0.2, -0.05, 0.1].map((x, i) => part(cyl(0.05, 0.05, 0.1), [x, 1.42, -1.28], { tone: ["#8cc6e6", "#f7d26e", "#8fcf9a"][i], surf: "glass" })),
    part(box(0.6, 0.03, 0.12, 0.01), [-0.05, 1.36, -1.28], { tone: woodDark, surf: "wood" }),
    // toolbox and a hanging lamp
    part(box(0.48, 0.22, 0.26, 0.04), [-0.75, 0.77, -0.85], { tone: top, surf: "metal" }),
    part(box(0.5, 0.03, 0.28, 0.01), [-0.75, 0.89, -0.85], { tone: wall, surf: "metal" }),
    part(ring(0.07, 0.015), [-0.75, 0.94, -0.85], { tone: slate, surf: "metal" }),
    part(cyl(0.008, 0.008, 0.35), [-0.25, 1.67, -0.8], { tone: slate }),
    part(cone(0.16, 0.12), [-0.25, 1.45, -0.8], { tone: slate, surf: "metal" }),
    part(ball(0.05, 8, 6), [-0.25, 1.38, -0.8], { tone: PAL.bulb, surf: "glow" }),
    block([0.0, 0.76, -0.85], 0.2, "#8cc6e6", 0.3),
    block([0.25, 0.76, -0.8], 0.2, "#f7d26e", -0.2),
    // the stack, piled up: React, Next, Unity, Docker in clay
    block([0.55, 0.22, 0.05], 0.44, "#8cc6e6"),
    block([0.4, 0.22, -0.42], 0.44, "#f29a83", 0.4),
    block([0.5, 0.62, -0.15], 0.36, top, 0.25),
    block([0.52, 0.94, -0.13], 0.28, "#f7d26e", -0.2),
    block([-0.75, 0.16, 0.25], 0.32, "#8fcf9a", 0.6),
    part(cyl(0.1, 0.1, 0.18), [-1.15, 0.09, 0.85], { tone: slate, surf: "metal" }),
    part(cyl(0.11, 0.11, 0.02), [-1.15, 0.19, 0.85], { tone: mid, surf: "metal" }),
  ];
}

/** A hall of fame: a red carpet up to a stone podium, gold trophies, columns and a banner behind. */
function awards({ wall, top }: Identity): Part[] {
  const wins = Math.min(3, AWARDS.length);
  const steps: [number, number, number][] = [
    [0, 0.95, 1],
    [-0.9, 0.65, 2],
    [0.9, 0.45, 3],
  ];
  const gold = "#f2c14e";
  const parts: Part[] = [
    part(box(0.75, 0.02, 1.4, 0.01), [0, 0.01, 0.45], { tone: "#c9424a", surf: "fabric" }),
    part(box(0.82, 0.025, 0.04, 0.01), [0, 0.012, 1.15], { tone: gold, surf: "metal" }),
  ];
  steps.slice(0, wins).forEach(([x, h, place]) => {
    parts.push(
      part(box(0.8, h, 0.8, 0.05), [x, h / 2, -0.4], { tone: place === 1 ? white : light, surf: "stone" }),
      part(box(0.82, 0.05, 0.82, 0.02), [x, h - 0.02, -0.4], { tone: mid, surf: "stone" }),
      part(box(0.26, 0.2, 0.02, 0.01), [x, h * 0.55, 0.01], { tone: [gold, "#c9ced6", "#d39a6a"][place - 1], surf: "metal" }),
      part(cyl(0.12, 0.14, 0.05), [x, h + 0.025, -0.4], { tone: slate, surf: "stone" }),
      part(cyl(0.035, 0.05, 0.12), [x, h + 0.1, -0.4], { tone: gold, surf: "metal" }),
      part(cyl(0.12, 0.05, 0.2), [x, h + 0.26, -0.4], { tone: gold, surf: "metal" }),
      part(ring(0.07, 0.016), [x - 0.13, h + 0.28, -0.4], { rot: [0, 0, H], tone: gold, surf: "metal" }),
      part(ring(0.07, 0.016), [x + 0.13, h + 0.28, -0.4], { rot: [0, 0, H], tone: gold, surf: "metal" }),
      part(ball(0.03, 6, 5), [x, h + 0.4, -0.4], { tone: gold, surf: "metal" }),
    );
  });
  for (const x of [-1.25, 1.25])
    parts.push(
      part(box(0.32, 0.1, 0.32, 0.02), [x, 0.05, -1.25], { tone: mid, surf: "stone" }),
      part(cyl(0.11, 0.12, 1.7), [x, 0.95, -1.25], { tone: white, surf: "stone" }),
      part(box(0.3, 0.1, 0.3, 0.02), [x, 1.85, -1.25], { tone: mid, surf: "stone" }),
      ...potted([x, 0, -0.55], 1.1, x > 0 ? 3 : 0),
      ...lantern([x, 0, 0.3], 0.55, gold),
    );
  parts.push(
    part(box(2.9, 0.16, 0.3, 0.03), [0, 1.98, -1.25], { tone: white, surf: "stone" }),
    part(box(1.9, 0.75, 0.03, 0.01), [0, 1.42, -1.3], { tone: wall, surf: "fabric" }),
    part(box(1.9, 0.08, 0.04, 0.01), [0, 1.04, -1.29], { tone: top, surf: "fabric" }),
    part(box(0.5, 0.18, 0.02, 0.01), [0, 1.55, -1.28], { tone: gold, surf: "metal" }),
    ...[-0.6, 0.6].map((x) => part(ball(0.09, 10, 8), [x, 1.5, -1.27], { scale: [1, 1, 0.3], tone: leaf[0], surf: "leaf" })),
  );
  return parts;
}

/** A community garden: the contribution grid grows in a raised plank bed, with a vine trellis, tools and a wheelbarrow. */
function github({ top }: Identity): Part[] {
  const bed: Part[] = [
    part(box(2.6, 0.12, 1.3, 0.02), [0, 0.06, -0.4], { tone: "#7a5a44", surf: "sand" }),
    part(box(2.84, 0.17, 0.12, 0.03), [0, 0.085, -1.11], { tone: PAL.wood, surf: "wood" }),
    part(box(2.84, 0.17, 0.12, 0.03), [0, 0.085, 0.31], { tone: PAL.wood, surf: "wood" }),
    part(box(0.12, 0.17, 1.3, 0.03), [-1.36, 0.085, -0.4], { tone: PAL.wood, surf: "wood" }),
    part(box(0.12, 0.17, 1.3, 0.03), [1.36, 0.085, -0.4], { tone: PAL.wood, surf: "wood" }),
  ];
  const trellis: Part[] = [];
  for (let i = 0; i <= 6; i++) trellis.push(part(slab(0.04, 0.85, 0.04), [-1.35 + i * 0.45, 0.42, -1.4], { tone: white, surf: "wood" }));
  for (const y of [0.35, 0.8]) trellis.push(part(slab(2.8, 0.04, 0.03), [0, y, -1.4], { tone: white, surf: "wood" }));
  for (let i = 0; i < 9; i++)
    trellis.push(part(ball(0.11, 8, 6), [-1.25 + i * 0.31, 0.5 + Math.sin(i * 1.7) * 0.22, -1.38], { scale: [1.2, 1, 0.5], tone: leaf[i % 5], surf: "leaf" }));
  return [
    ...bed,
    ...trellis,
    ...lantern([-1.45, 0, -1.45], 0.75),
    ...lantern([1.45, 0, -1.45], 0.75),
    // watering can, seed sacks and a wheelbarrow at the front left
    part(cyl(0.1, 0.11, 0.18), [-0.9, 0.09, 0.75], { tone: "#8fcf9a", surf: "metal" }),
    part(cyl(0.015, 0.025, 0.24), [-0.76, 0.15, 0.75], { rot: [0, 0, -0.9], tone: "#8fcf9a", surf: "metal" }),
    part(ring(0.07, 0.014, 4, 12), [-0.92, 0.22, 0.75], { tone: "#8fcf9a", surf: "metal" }),
    part(pill(0.1, 0.12, 3, 8), [-1.25, 0.14, 0.55], { tone: "#e8d6b0", surf: "fabric" }),
    part(pill(0.09, 0.1, 3, 8), [-1.3, 0.12, 0.85], { rot: [0.3, 0, 0.2], tone: "#d8c49a", surf: "fabric" }),
    part(box(0.42, 0.14, 0.3, 0.05), [-0.4, 0.22, 0.95], { rot: [0, 0.3, 0.1], tone: top, surf: "metal" }),
    part(cyl(0.08, 0.08, 0.04), [-0.6, 0.08, 0.86], { rot: [H, 0.3, 0], tone: slate }),
    part(cyl(0.012, 0.012, 0.5), [-0.18, 0.18, 1.1], { rot: [0, 0.3, H + 0.2], tone: woodDark, surf: "wood" }),
    ...flowers([0.2, 0, 0.55], [0.4, 0, 1.45], 6, 11),
  ];
}

/** A little post office: a tiled booth with a counter, a pillar box, parcels and letters on the way out. */
function contact({ wall, top }: Identity): Part[] {
  const bx = -0.5;
  const bz = -0.95;
  return [
    part(box(1.6, 0.03, 1.1, 0.01), [bx, 0.015, bz], { tone: light, surf: "stone" }),
    part(box(1.5, 1.3, WALL_T, 0.03), [bx, 0.65, bz - 0.48], { tone: wall, surf: "plaster" }),
    part(box(WALL_T, 1.3, 1.0, 0.03), [bx - 0.7, 0.65, bz], { tone: wall, surf: "plaster" }),
    part(box(WALL_T, 1.3, 1.0, 0.03), [bx + 0.7, 0.65, bz], { tone: wall, surf: "plaster" }),
    part(gable(1.75, 0.55, 1.3), [bx, 1.3, bz], { tone: top, surf: "tile" }),
    part(gable(1.4, 0.42, 0.06), [bx, 1.32, bz + 0.5], { tone: white, surf: "plaster" }),
    part(ball(0.12, 10, 8), [bx, 1.5, bz + 0.54], { scale: [1, 1, 0.3], tone: PAL.bulb, surf: "glow" }),
    part(box(1.3, 0.62, 0.3, 0.03), [bx, 0.31, bz + 0.3], { tone: PAL.wood, surf: "wood" }),
    part(box(1.4, 0.05, 0.38, 0.02), [bx, 0.64, bz + 0.3], { tone: white, surf: "stone" }),
    ...[-0.4, -0.15, 0.1, 0.35].flatMap((dx, i) => [
      part(box(0.2, 0.2, 0.22, 0.01), [bx + dx, 1.05, bz - 0.33], { tone: woodDark, surf: "wood" }),
      part(box(0.13, 0.08, 0.01, 0.005), [bx + dx, 1.03, bz - 0.21], { rot: [0, 0, (i - 1.5) * 0.1], tone: white }),
    ]),
    part(box(0.36, 0.05, 0.26, 0.02), [bx + 0.3, 0.7, bz + 0.3], { rot: [0, 0.4, 0], tone: white }),
    part(cone(0.04, 0.04), [bx + 0.3, 0.73, bz + 0.3], { rot: [H, 0.4, 0], scale: [1, 1, 0.4], tone: top }),
    // the pillar box out front
    part(cyl(0.2, 0.22, 0.9), [0.55, 0.45, -0.95], { tone: "#e9776a", surf: "metal" }),
    part(ball(0.21, 14, 8), [0.55, 0.9, -0.95], { scale: [1, 0.55, 1], tone: "#e9776a", surf: "metal" }),
    part(cyl(0.24, 0.24, 0.06), [0.55, 0.03, -0.95], { tone: slate, surf: "metal" }),
    part(box(0.22, 0.03, 0.04, 0.01), [0.55, 0.7, -0.75], { tone: slate }),
    part(box(0.18, 0.1, 0.02, 0.01), [0.55, 0.52, -0.74], { tone: white }),
    ...crate([-1.2, 0, 0.35], 0.3, 0.3),
    ...crate([-1.15, 0.3, 0.38], 0.2, -0.2, PAL.autumn[0]),
    part(box(0.5, 0.05, 0.36, 0.025), [0.25, 0.04, -0.2], { rot: [0, 0.35, 0], tone: white }),
    part(ball(0.06), [0.25, 0.08, -0.2], { tone: top }),
    part(box(0.5, 0.05, 0.36, 0.025), [0.1, 0.3, 0.1], { rot: [0.5, 0.9, 0.2], tone: white }),
    ...parkBench([-0.3, 0, 0.75], Math.PI),
    ...lantern([1.25, 0, -1.4], 0.9),
    ...flowers([0.95, 0, -1.45], [1.45, 0, -0.3], 8, 5),
  ];
}

/** The village notice board under a tiled hood, lanterns either side and a bench to read from. */
function updates({ top }: Identity): Part[] {
  const notes: [number, number, number, number, string, string][] = [
    [-0.78, 1.42, -0.12, 0.2, "#fbfaf7", "#f29a83"],
    [-0.15, 1.52, 0.08, 0.34, "#fff1a8", "#8cc6e6"],
    [0.55, 1.4, -0.06, 0.25, "#cfe8f6", "#f29a83"],
    [-0.55, 1.04, 0.1, 0.3, "#fbd5d0", "#8cc6e6"],
    [0.15, 1.0, -0.1, 0.45, "#fbfaf7", "#f2c14e"],
    [0.82, 0.98, 0.08, 0.2, "#d9ecc4", "#f29a83"],
  ];
  return [
    part(box(2.8, 0.03, 0.9, 0.01), [0, 0.015, -0.6], { tone: PAL.cobble, surf: "stone" }),
    part(box(0.16, 2.1, 0.16, 0.04), [-1.15, 1.05, -0.7], { tone: woodDark, surf: "wood" }),
    part(box(0.16, 2.1, 0.16, 0.04), [1.15, 1.05, -0.7], { tone: woodDark, surf: "wood" }),
    part(box(2.2, 1.3, 0.1, 0.04), [0, 1.25, -0.7], { tone: wood, surf: "wood" }),
    part(box(2.04, 1.14, 0.04, 0.02), [0, 1.25, -0.63], { tone: "#d9b98b", surf: "fabric" }),
    part(gable(0.62, 0.3, 2.7), [0, 2.02, -0.7], { rot: [0, H, 0], tone: top, surf: "tile" }),
    part(box(2.3, 0.08, 0.12, 0.03), [0, 0.57, -0.62], { tone: woodDark, surf: "wood" }),
    ...notes.flatMap(([x, y, tilt, w, paper, pin]) => [
      part(box(w + 0.18, 0.26, 0.015, 0.008), [x, y, -0.6], { rot: [0, 0, tilt], tone: paper }),
      part(box(w, 0.02, 0.005, 0.002), [x, y + 0.02, -0.59], { rot: [0, 0, tilt], tone: mid }),
      part(box(w * 0.7, 0.02, 0.005, 0.002), [x, y - 0.04, -0.59], { rot: [0, 0, tilt], tone: mid }),
      part(ball(0.035, 8, 6), [x, y + 0.1, -0.58], { tone: pin }),
    ]),
    part(box(0.5, 0.2, 0.04, 0.02), [0.82, 1.74, -0.58], { rot: [0, 0, -0.08], tone: top, surf: "wood" }),
    part(box(0.34, 0.08, 0.02, 0.01), [0.82, 1.74, -0.55], { rot: [0, 0, -0.08], tone: white }),
    ...lantern([-1.4, 0, -0.3], 0.8, top),
    ...lantern([1.4, 0, -1.1], 0.8, top),
    ...parkBench([-0.2, 0, 0.45], Math.PI),
    ...crate([-1.15, 0, 0.6], 0.26, 0.4),
    part(box(0.24, 0.1, 0.18, 0.02), [-1.15, 0.31, 0.6], { rot: [0, 0.2, 0], tone: white, surf: "fabric" }),
    ...flowers([-1.45, 0, -1.3], [1.45, 0, -1.3], 12, 8),
  ];
}

/** The guestbook: a big cork board crowded with visitors' notes, a writing desk with paper and pen, and a stool. */
function guestbook({ wall, top }: Identity): Part[] {
  const papers = ["#fbfaf7", "#fff1a8", "#cfe8f6", "#fbd5d0", "#d9ecc4"];
  const pins = ["#f29a83", "#8cc6e6", "#f2c14e", top];
  const notes: Part[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 6; c++) {
      const k = r * 6 + c;
      const x = -1.0 + c * 0.4 + Math.sin(k * 2.3) * 0.05;
      const y = 1.55 - r * 0.36 + Math.cos(k * 1.7) * 0.03;
      const tilt = Math.sin(k * 3.1) * 0.14;
      notes.push(
        part(box(0.28, 0.24, 0.015, 0.008), [x, y, -0.88], { rot: [0, 0, tilt], tone: papers[k % papers.length] }),
        part(box(0.18, 0.018, 0.005, 0.002), [x, y + 0.02, -0.87], { rot: [0, 0, tilt], tone: mid }),
        part(ball(0.03, 8, 6), [x, y + 0.09, -0.86], { tone: pins[k % pins.length] }),
      );
    }
  return [
    part(box(2.9, 0.03, 0.8, 0.01), [0, 0.015, -0.85], { tone: light, surf: "stone" }),
    ...[-1.38, 1.38].map((x) => part(box(0.14, 2.05, 0.14, 0.04), [x, 1.02, -0.95], { tone: top, surf: "wood" })),
    part(box(2.62, 1.2, 0.1, 0.04), [0, 1.2, -0.95], { tone: wall, surf: "wood" }),
    part(box(2.46, 1.06, 0.04, 0.02), [0, 1.2, -0.89], { tone: "#c99a6b", surf: "fabric" }),
    ...notes,
    // a heart on the crest
    ...[-0.07, 0.07].map((x) => part(ball(0.1, 10, 8), [x, 2.02, -0.95], { scale: [1, 1, 0.4], tone: top })),
    part(box(0.16, 0.16, 0.06, 0.02), [0, 1.96, -0.95], { rot: [0, 0, Math.PI / 4], tone: top }),
    // the writing desk, its paper, an inkpot and a quill
    part(box(0.8, 0.05, 0.5, 0.02), [-0.75, 0.55, 0.3], { tone: wood, surf: "wood" }),
    ...[[-1.1, 0.1], [-0.4, 0.1], [-1.1, 0.5], [-0.4, 0.5]].map(([x, z]) => part(box(0.05, 0.53, 0.05, 0.01), [x, 0.265, z], { tone: woodDark, surf: "wood" })),
    part(box(0.26, 0.01, 0.2, 0.005), [-0.8, 0.585, 0.32], { rot: [0, 0.2, 0], tone: white }),
    part(box(0.22, 0.01, 0.18, 0.005), [-0.62, 0.59, 0.25], { rot: [0, -0.3, 0], tone: "#fff1a8" }),
    part(cyl(0.04, 0.05, 0.07), [-0.5, 0.61, 0.42], { tone: slate, surf: "metal" }),
    part(cyl(0.006, 0.006, 0.22), [-0.48, 0.7, 0.42], { rot: [0, 0, -0.4], tone: top }),
    part(cyl(0.12, 0.12, 0.04), [-0.75, 0.32, 0.85], { tone: top, surf: "wood" }),
    part(cyl(0.03, 0.03, 0.3), [-0.75, 0.15, 0.85], { tone: woodDark, surf: "wood" }),
    ...lantern([1.35, 0, -0.2], 0.85, top),
    ...lantern([-1.4, 0, -1.35], 0.85, top),
    ...parkBench([0.65, 0, 0.55], Math.PI),
    ...flowers([0.2, 0, -0.35], [1.45, 0, -0.3], 10, 13),
  ];
}

const BUILDERS: Record<StationId, (c: Identity) => Part[]> = {
  about,
  projects,
  experience,
  skills,
  awards,
  github,
  contact,
  updates,
  guestbook,
};

export function buildStation(id: StationId): BufferGeometry {
  const h = PLINTH_HEIGHT + SKIRT;
  const plinth = part(box(PLINTH_SIZE[id], h, PLINTH_SIZE[id], 0.14), [0, -PLINTH_HEIGHT - SKIRT + h / 2, 0], {
    tone: IDENTITY[id].wall,
    surf: "stone",
  });
  const half = PLINTH_SIZE[id] / 2;
  // each tread runs back to the plinth, so the flight reads as one stacked block
  const steps = Array.from({ length: STEPS }, (_, j) => {
    const top = treadAt(j);
    const d = (j + 1) * STEP_D + 0.05;
    return part(box(STAIR_W, top + SKIRT * 0.5, d, 0.04), [STAIRS[id], top - PLINTH_HEIGHT - (top + SKIRT * 0.5) / 2, half - 0.05 + d / 2], {
      tone: IDENTITY[id].wall,
      surf: "stone",
    });
  });
  return merge([plinth, ...steps, ...BUILDERS[id](IDENTITY[id])], [0, PLINTH_HEIGHT, 0]);
}
