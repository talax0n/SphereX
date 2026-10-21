// Every static path of the typewriter, computed once on the server.
import * as G from "@/components/iso/lathe.mjs";
import {
  corners,
  cylinder,
  depthOf,
  extrude,
  haloOf,
  insetPlan,
  lineOnTop,
  onTop,
  pathOf,
  planOutline,
  ring,
  roundedPlan,
  sideMatrix,
  sideSeam,
  slabOf,
  topTicks,
  type Plan,
  type Plane,
  type Point3,
  type SolidPaths,
} from "@/components/iso/iso-kit";
import { REST_PHI, RIBBON_HIGH, RIBBON_LOW, VIBRATOR, barBetween, leverOf, pivotOf, ribbonAcross, thetaOf, typebarOf } from "./frame";
import {
  AXIS,
  BARS,
  BAR_L,
  BAR_R,
  BASE,
  BASE_TOP,
  BETA,
  C,
  CARRIAGE_HALF,
  CHEEKS,
  CHEEK_TOP,
  DECK,
  DECK_TOP,
  FOOT_H,
  KEYS,
  KNOB_OUT,
  LAST_COL,
  NOSE,
  NOSE_TOP,
  P,
  PAPER_HALF,
  PAPER_TOP,
  PITCH,
  PLATEN_HALF,
  PLATEN_R,
  REAR,
  REAR_TOP,
  REST_DROP,
  S,
  SPACE_HALF,
  SPACE_TOP,
  SPACE_Y,
  WELL,
  WELL_TOP,
  X0,
  at,
  onPaper,
} from "./view";

export type Faded = { d: string; alpha: number };

const slab = (plan: Plan, z: number, h: number, steps = 4, bevel = 0) => slabOf(plan, z, h, P, steps, bevel);
const cyl = (cx: number, cy: number, r: number, z: number, h: number, steps = 28, bevel = 0) => cylinder(cx, cy, r, z, h, P, steps, bevel);
const join = (paths: string[]) => paths.join("");
const byDepth = <T extends { at: Point3 }>(list: T[]) => [...list].sort((a, b) => depthOf(a.at, P) - depthOf(b.at, P));
const along = (point: Point3) => G.frameAlong(point, [1, 0, 0]);
// lathe.mjs is untyped JS: its option defaults (`fade = null`) infer too narrowly.
const ribsOf = G.ribsOf as unknown as (F: unknown, s0: number, s1: number, r: number, count: number, P: unknown, options: object) => Faded[];
const DEG = Math.PI / 180;

// ── base ───────────────────────────────────────────────────────────────
const FEET = byDepth(corners(BASE, 22).map(([x, y]) => ({ at: [x, y, 0] as Point3 })));
const FRONT_SCREWS: Plane[] = [
  [BASE.x + 7, BASE.y + BASE.d - 6],
  [BASE.x + BASE.w - 7, BASE.y + BASE.d - 6],
];

export const BASE_ART = {
  halo: haloOf(BASE, -FOOT_H, BASE_TOP + FOOT_H, P),
  feet: FEET.map(({ at: [x, y] }) => [cyl(x, y, 8, -FOOT_H, 1.6, 28), cyl(x, y, 6.2, -FOOT_H + 1.6, FOOT_H - 1.6, 28)]),
  slab: slab(BASE, 0, BASE_TOP, 8, 1.4),
  seam: sideSeam(BASE, 3.4, P, 8),
  screws: FRONT_SCREWS.map(([x, y]) => at([x, y, BASE_TOP])),
  screwRings: join(FRONT_SCREWS.map(([x, y]) => ring(x, y, 2, BASE_TOP, P, 16))),
};

// ── body shell: rear block under the carriage, two cheeks, the well, the nose ──
const BEARINGS: Plan[] = [-1, 1].map((side) => ({ x: side < 0 ? -74 : 52, y: -71, w: 22, d: 14, r: 2 }));
const RACK: Plan = { x: -112, y: -52, w: 224, d: 3, r: 0.8 };

function rackTeeth() {
  const lines: string[] = [];
  for (let x = RACK.x + 2; x <= RACK.x + RACK.w - 2; x += 2.4) lines.push(lineOnTop([x, RACK.y], [x, RACK.y + RACK.d], REAR_TOP + 1.4, P));
  return join(lines);
}

const REAR_SCREWS: Plane[] = [
  [REAR.x + 7, REAR.y + 7],
  [REAR.x + REAR.w - 7, REAR.y + 7],
  [REAR.x + 7, REAR.y + REAR.d - 10],
  [REAR.x + REAR.w - 7, REAR.y + REAR.d - 10],
];

export const BODY_ART = {
  rear: slab(REAR, BASE_TOP, REAR_TOP - BASE_TOP, 8, 1.2),
  rearSeam: sideSeam(REAR, 20, P, 8),
  rearScrews: REAR_SCREWS.map(([x, y]) => at([x, y, REAR_TOP])),
  rearScrewRings: join(REAR_SCREWS.map(([x, y]) => ring(x, y, 1.8, REAR_TOP, P, 14))),
  bearings: BEARINGS.map((plan) => slab(plan, REAR_TOP, 3, 3, 0.4)),
  bearingBalls: BEARINGS.flatMap((plan) => [at([plan.x + 4, plan.y + plan.d - 1.6, REAR_TOP + 3]), at([plan.x + plan.w - 4, plan.y + plan.d - 1.6, REAR_TOP + 3])]),
  rack: slab(RACK, REAR_TOP, 1.4, 2),
  rackTeeth: rackTeeth(),
  cheeks: CHEEKS.map((plan) => slab(plan, BASE_TOP, CHEEK_TOP - BASE_TOP, 8, 1.2)),
  cheekSeams: CHEEKS.map((plan) => sideSeam(plan, 20, P, 8)),
  cheekScrews: CHEEKS.flatMap((plan) => [at([plan.x + 6, plan.y + plan.d - 6, CHEEK_TOP]), at([plan.x + plan.w - 6, plan.y + plan.d - 6, CHEEK_TOP])]),
  well: slab(WELL, BASE_TOP, WELL_TOP - BASE_TOP, 2),
};

// Label plate on the left cheek, ribbon selector on the right.
const LABEL: Plan = { x: -116, y: 32, w: 27, d: 14, r: 1.4 };
const SELECTOR: Plan = { x: 99, y: 26, w: 3.2, d: 18, r: 1.6 };
export const CHEEK_ART = {
  plate: slab(LABEL, CHEEK_TOP, 0.8, 3),
  plateLine: planOutline(insetPlan(LABEL, 1.4), CHEEK_TOP + 0.8, P, 3),
  plateRule: join([0, 1, 2].map((row) => lineOnTop([LABEL.x + 4, LABEL.y + 4 + row * 3], [LABEL.x + (row === 1 ? 15 : 21), LABEL.y + 4 + row * 3], CHEEK_TOP + 0.8, P))),
  plateScrews: [at([LABEL.x + LABEL.w - 3, LABEL.y + 3, CHEEK_TOP + 0.8]), at([LABEL.x + LABEL.w - 3, LABEL.y + LABEL.d - 3, CHEEK_TOP + 0.8])],
  slot: planOutline(SELECTOR, CHEEK_TOP, P, 3),
  slotInner: planOutline(insetPlan(SELECTOR, 0.8), CHEEK_TOP, P, 3),
  knobStem: cyl(SELECTOR.x + 1.6, SELECTOR.y + 5, 0.9, CHEEK_TOP, 3, 12),
  knob: cyl(SELECTOR.x + 1.6, SELECTOR.y + 5, 2.6, CHEEK_TOP + 3, 2.4, 20, 0.3),
  marks: [at([SELECTOR.x + 5, SELECTOR.y + 4, CHEEK_TOP]), at([SELECTOR.x + 5, SELECTOR.y + 14, CHEEK_TOP])],
};

// ── typebar basket ─────────────────────────────────────────────────────
function sector(r0: number, r1: number, spread: number, steps = 48): Plane[] {
  const out: Plane[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = -spread + (2 * spread * i) / steps;
    out.push([C[0] + r1 * Math.sin(t), C[1] + r1 * Math.cos(t)]);
  }
  for (let i = steps; i >= 0; i--) {
    const t = -spread + (2 * spread * i) / steps;
    out.push([C[0] + r0 * Math.sin(t), C[1] + r0 * Math.cos(t)]);
  }
  return out;
}

const arcOnTop = (r: number, spread: number, z: number, steps = 48) => {
  const points: Plane[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = -spread + (2 * spread * i) / steps;
    points.push([C[0] + r * Math.sin(t), C[1] + r * Math.cos(t)]);
  }
  return onTop(points, z, P);
};

const SEG_TOP = C[2] - 1.2;
const SEG_SPREAD = 84 * DEG;
const SEG = sector(23, 33, SEG_SPREAD);
const REST_R = [63, 71];
const REST_SPREAD = 80 * DEG;
// The felt sits just under the bars where they cross it.
const FELT_TOP = C[2] - (REST_R[0] - BAR_R) * Math.tan(REST_DROP) - 1.05 / Math.cos(REST_DROP) - (REST_R[1] - REST_R[0]) * Math.tan(REST_DROP);

export const BASKET_ART = {
  segment: extrude(SEG, WELL_TOP, SEG_TOP - WELL_TOP, P, { convex: false }),
  pivotWire: arcOnTop(BAR_R, SEG_SPREAD, SEG_TOP),
  segmentScrews: [-1, 1].map((side) => at([C[0] + 28 * Math.sin(side * 82 * DEG), C[1] + 28 * Math.cos(side * 82 * DEG), SEG_TOP])),
  restFrame: extrude(sector(REST_R[0], REST_R[1], REST_SPREAD), WELL_TOP, FELT_TOP - 1.6 - WELL_TOP, P, { convex: false }),
  felt: extrude(sector(REST_R[0] + 0.6, REST_R[1] - 0.6, REST_SPREAD - 1 * DEG), FELT_TOP - 1.6, 1.6, P, { convex: false }),
  bars: Array.from({ length: BARS }, (_, bar) => {
    const t = thetaOf(bar);
    const mid: Point3 = [C[0] + (BAR_R + BAR_L / 2) * Math.sin(t), C[1] + (BAR_R + BAR_L / 2) * Math.cos(t), C[2] - 6];
    return { id: bar, at: mid, paths: typebarOf(bar, REST_PHI) };
  }).sort((a, b) => depthOf(a.at, P) - depthOf(b.at, P)),
  pivots: Array.from({ length: BARS }, (_, bar) => at(pivotOf(bar))),
};

// ── type guide, ribbon carrier and vibrator at the print point ─────────
const GUIDE: Plan = { x: -4.5, y: S[1] + 2.2, w: 9, d: 3, r: 1 };
const CARRIER: Plan = { x: -16, y: S[1] + 2.2, w: 32, d: 3, r: 1 };
const CARRIER_Z = 52.5;
const CARRIER_TOP = 55.5;
const RIBBON_GUIDES: Point3[] = [-14, 14].map((x) => [x, S[1] + 3.7, CARRIER_TOP] as Point3);
const vibFrame = G.frameOf(onPaper(0, 0, VIBRATOR.out), [0, Math.cos(BETA), Math.sin(BETA)], [1, 0, 0], [0, -Math.sin(BETA), Math.cos(BETA)]);
const planeRect = (u0: number, u1: number, v0: number, v1: number, r: number): [number, number][] => roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, 3).map(([u, v]) => [u, v]);
const onPlane = (points: [number, number][], out: number, closed = true) => pathOf(points.map(([u, v]) => at(onPaper(u, v, out))), closed);

const GUIDE_FOOT = (x: number): Point3 => [x, S[1] + 3.7, CARRIER_TOP];
export const GUIDE_ART = {
  post: slab(GUIDE, WELL_TOP, CARRIER_Z - WELL_TOP, 3, 0.4),
  carrier: slab(CARRIER, CARRIER_Z, CARRIER_TOP - CARRIER_Z, 3, 0.4),
  carrierScrews: [at([-10, S[1] + 3.7, CARRIER_TOP]), at([10, S[1] + 3.7, CARRIER_TOP])],
  guides: [-1, 1].map((side) => G.prismOf(G.frameOf(GUIDE_FOOT(side * 14.2), [0, 0, 1], [1, 0, 0], [0, 1, 0]), planeRect(-1, 1, -1.2, 1.2, 0.5), 0, 6.4, P) as SolidPaths),
  stem: slab({ x: -1.4, y: S[1] + 2.9, w: 2.8, d: 1.6, r: 0.6 }, CARRIER_TOP, onPaper(0, VIBRATOR.v0, VIBRATOR.out)[2] - CARRIER_TOP + 0.4, 2),
  pointer: G.prismOf(G.frameOf([0, -30.2, 50.9], [0, 0, 1], [1, 0, 0], [0, 1, 0]), [[0, -1.6], [1.4, 0.4], [1.4, 3.4], [-1.4, 3.4], [-1.4, 0.4]], 0, 0.8, P) as SolidPaths,
  pointerArm: slab({ x: -1.4, y: -26.8, w: 2.8, d: 1.2, r: 0.4 }, 50.9, 1.6, 2),
};

export const VIBRATOR_ART = {
  plate: G.prismOf(vibFrame, planeRect(-VIBRATOR.u, VIBRATOR.u, VIBRATOR.v0, VIBRATOR.v1, 1.2), -0.8, 0, P) as SolidPaths,
  window: onPlane(planeRect(-3.2, 3.2, -7.4, -4.4, 1), VIBRATOR.out),
  rivets: [-6.8, 6.8].map((u) => at(onPaper(u, -9.2, VIBRATOR.out))),
  ribbon: ribbonAcross(0),
};

// ── ribbon spools on the cheeks ───────────────────────────────────────
const SPOOLS = [
  { x: -103, y: -14, roll: 12.4 },
  { x: 103, y: -14, roll: 8.8 },
];
const SPOOL_Z = CHEEK_TOP;
export const SPOOL_WELLS = SPOOLS.map(({ x, y }) => ring(x, y, 16.2, SPOOL_Z, P, 56));
const ROLL_Z = SPOOL_Z + 1.6;
const ROLL_TOP = ROLL_Z + 6.4;

function tangentTo(cx: number, cy: number, r: number, gx: number, gy: number): Plane {
  const dx = gx - cx;
  const dy = gy - cy;
  const d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const off = Math.acos(r / d);
  const options = [base + off, base - off].map((a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Plane);
  return options[0]![1] < options[1]![1] ? options[0]! : options[1]!;
}

export const SPOOL_ART = byDepth(SPOOLS.map((spool) => ({ ...spool, at: [spool.x, spool.y, SPOOL_Z] as Point3 }))).map(({ x, y, roll }) => {
  const holes = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    return ring(x + 8.6 * Math.cos(a), y + 8.6 * Math.sin(a), 2.3, ROLL_TOP + 0.8, P, 16);
  });
  return {
    cup: cyl(x, y, 15, SPOOL_Z, 1.6, 56, 0.4),
    roll: cyl(x, y, roll, ROLL_Z, ROLL_TOP - ROLL_Z, 48),
    flange: cyl(x, y, 14.2, ROLL_TOP, 0.8, 56, 0.3),
    holes: join(holes),
    hub: cyl(x, y, 3.2, ROLL_TOP + 0.8, 3.4, 20, 0.3),
    pin: at([x + 1.2, y, ROLL_TOP + 4.2]),
  };
});

export const RIBBON_ART = SPOOLS.map(({ x, y, roll }) => {
  const side = Math.sign(x);
  const guide = RIBBON_GUIDES[side < 0 ? 0 : 1]!;
  const [tx, ty] = tangentTo(x, y, roll, guide[0], guide[1]);
  const g0 = onPaper(guide[0], RIBBON_LOW, VIBRATOR.out + 0.45);
  const g1 = onPaper(guide[0], RIBBON_HIGH, VIBRATOR.out + 0.45);
  return pathOf([at([tx, ty, ROLL_Z + 1.2]), at(g0), at(g1), at([tx, ty, ROLL_Z + 4.9])], true);
});

// ── carriage, built at shift 0 ─────────────────────────────────────────
const RAIL: Plan = { x: -CARRIAGE_HALF + 2, y: -71, w: CARRIAGE_HALF * 2 - 4, d: 12, r: 2 };
const RAIL_Z = REAR_TOP + 3;
const RAIL_TOP = RAIL_Z + 3.4;
const WALL: Plan = { x: -CARRIAGE_HALF + 4, y: -74, w: CARRIAGE_HALF * 2 - 8, d: 4.5, r: 1.2 };
const PLATE_TOP = 77;
const ENDS: Plan[] = [-1, 1].map((side) => ({ x: side < 0 ? -CARRIAGE_HALF : CARRIAGE_HALF - 5, y: -74, w: 5, d: 42, r: 2 }));
const TIE: Plan = { x: -CARRIAGE_HALF + 5, y: -35, w: (CARRIAGE_HALF - 5) * 2, d: 4.5, r: 1 };
const TIE_Z = 47;
const TIE_TOP = 50.5;

function scale() {
  const t = topTicks(-X0 - 0.001, -X0 + LAST_COL * PITCH, PITCH, 5, TIE.y, TIE_TOP, [1.4, 2.8], P, "x");
  return t;
}
const SCALE = scale();

const F_PLATEN = along(AXIS);
const knurl = (s0: number, s1: number, r: number, count: number): Faded[] => ribsOf(along(AXIS), s0, s1, r, count, P, { fade: [0.08, 0.5], seams: true });

const PAPER_TABLE = planeRect(-CARRIAGE_HALF + 2, CARRIAGE_HALF - 2, 13, PAPER_TOP - 6, 6);
const tableFrame = G.frameOf(onPaper(0, 0, -1.6), [0, Math.cos(BETA), Math.sin(BETA)], [1, 0, 0], [0, -Math.sin(BETA), Math.cos(BETA)]);

// The sheet wraps the front of the platen from below and leaves it, tangent, at S.
function sheet() {
  const lip = 0.3;
  const R = PLATEN_R + lip;
  const arc = (u: number, from: number, to: number) => {
    const out: Point3[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = from + ((to - from) * i) / 14;
      out.push([u, AXIS[1] + R * Math.cos(a), AXIS[2] + R * Math.sin(a)]);
    }
    return out;
  };
  const low = -38 * DEG;
  const left = [...arc(-PAPER_HALF, low, BETA), onPaper(-PAPER_HALF, PAPER_TOP, lip)];
  const right = [onPaper(PAPER_HALF, PAPER_TOP, lip), ...arc(PAPER_HALF, BETA, low)];
  const band = [...arc(-PAPER_HALF, low, BETA), ...arc(PAPER_HALF, BETA, low)];
  return {
    fill: pathOf([...left, ...right].map(at), true),
    band: pathOf(band.map(at), true),
    fold: pathOf([at(onPaper(-PAPER_HALF, 0, lip)), at(onPaper(PAPER_HALF, 0, lip))]),
  };
}

const BAIL_V = 36;
const BAIL_OUT = 2.6;
const BAIL_HALF = 90;
const bailFrame = along(onPaper(0, BAIL_V, BAIL_OUT));
const ROLLERS = [-40, 40];

export const CARRIAGE_ART = {
  rail: slab(RAIL, RAIL_Z, RAIL_TOP - RAIL_Z, 3, 0.4),
  railGroove: lineOnTop([RAIL.x + 1, RAIL.y + RAIL.d - 2.4], [RAIL.x + RAIL.w - 1, RAIL.y + RAIL.d - 2.4], RAIL_TOP, P),
  wall: slab(WALL, RAIL_TOP, 15, 3, 0.4),
  wallScrews: [-60, 0, 60].map((x) => at([x, WALL.y + WALL.d / 2, RAIL_TOP + 15])),
  ends: ENDS.map((plan) => slab(plan, RAIL_Z, PLATE_TOP - RAIL_Z, 4, 0.5)),
  endScrews: ENDS.map((plan) => [at([plan.x + 2.5, plan.y + 5, PLATE_TOP]), at([plan.x + 2.5, plan.y + 20, PLATE_TOP])]),
  table: G.prismOf(tableFrame, PAPER_TABLE, -1, 0, P) as SolidPaths,
  tableRib: onPlane(planeRect(-CARRIAGE_HALF + 7, CARRIAGE_HALF - 7, 18, PAPER_TOP - 11, 3), -1.6),
  platen: G.disc(-PLATEN_HALF, PLATEN_HALF, PLATEN_R, F_PLATEN, P) as SolidPaths,
  platenSeams: [-PLATEN_HALF + 3, PLATEN_HALF - 3].map((s) => G.arcOf(F_PLATEN, s, PLATEN_R, P)).join(""),
  hubs: [-1, 1].map((side) => G.disc(side < 0 ? -PLATEN_HALF - 2.2 : PLATEN_HALF, side < 0 ? -PLATEN_HALF : PLATEN_HALF + 2.2, 8, F_PLATEN, P) as SolidPaths),
  shafts: [-1, 1].map((side) => G.disc(side < 0 ? -CARRIAGE_HALF : PLATEN_HALF + 2.2, side < 0 ? -PLATEN_HALF - 2.2 : CARRIAGE_HALF, 2.6, F_PLATEN, P) as SolidPaths),
  ratchet: G.disc(-CARRIAGE_HALF + 5, -CARRIAGE_HALF + 7.4, 9.6, F_PLATEN, P) as SolidPaths,
  ratchetTeeth: ribsOf(F_PLATEN, -CARRIAGE_HALF + 5, -CARRIAGE_HALF + 7.4, 9.6, 36, P, { fade: [0.05, 0.45], seams: true }),
  knobs: [-1, 1].map((side) => {
    const s0 = side < 0 ? -KNOB_OUT + 1.6 : CARRIAGE_HALF + 0.6;
    const s1 = side < 0 ? -CARRIAGE_HALF - 0.6 : KNOB_OUT - 1.6;
    const cap0 = side < 0 ? -KNOB_OUT : KNOB_OUT - 1.6;
    return {
      neck: G.disc(side < 0 ? -CARRIAGE_HALF - 0.6 : CARRIAGE_HALF, side < 0 ? -CARRIAGE_HALF : CARRIAGE_HALF + 0.6, 5, F_PLATEN, P) as SolidPaths,
      body: G.disc(s0, s1, 9, F_PLATEN, P) as SolidPaths,
      knurl: knurl(s0, s1, 9, 44),
      cap: G.disc(cap0, cap0 + 1.6, 6.4, F_PLATEN, P) as SolidPaths,
      capRing: G.circleOf(F_PLATEN, side < 0 ? -KNOB_OUT : KNOB_OUT, 3.6, P),
    };
  }),
  sheet: sheet(),
  bailArms: [-1, 1].map((side) => barBetween([side * (CARRIAGE_HALF - 2.5), -36, PLATE_TOP - 4], onPaper(side * (BAIL_HALF + 1.2), BAIL_V, BAIL_OUT), 1.4, 0.8)),
  bailPins: [-1, 1].map((side) => at([side * (CARRIAGE_HALF - 2.5), -36, PLATE_TOP - 4])),
  bail: G.disc(-BAIL_HALF - 1.2, BAIL_HALF + 1.2, 1.15, bailFrame, P) as SolidPaths,
  rollers: ROLLERS.map((u) => G.disc(u - 3.2, u + 3.2, 2.6, bailFrame, P) as SolidPaths),
  tie: slab(TIE, TIE_Z, TIE_TOP - TIE_Z, 2, 0.3),
  scaleMinor: SCALE.minor,
  scaleMajor: SCALE.major,
  release: {
    arm: barBetween([CARRIAGE_HALF - 2.5, -60, PLATE_TOP], [CARRIAGE_HALF - 2.5, -71, PLATE_TOP + 8.4], 1, 0.8),
    ball: G.sphereOf([CARRIAGE_HALF - 2.5, -72, PLATE_TOP + 9], 2.3, P) as SolidPaths,
  },
};

export const LEVER_REST = leverOf(0);
export const LEVER_BOSS = cyl(-CARRIAGE_HALF + 3, -38, 2.8, PLATE_TOP, 1.2, 20, 0.3);

// ── nose with the name badge, keyboard deck, keys ─────────────────────
const BADGE: Plan = { x: -24, y: BASE.y + BASE.d, w: 48, d: 0.8, r: 0.3 };
export const NOSE_ART = {
  nose: slab(NOSE, WELL_TOP, NOSE_TOP - WELL_TOP, 3, 0.8),
  noseScrews: [-70, 70].map((x) => at([x, NOSE.y + NOSE.d / 2, NOSE_TOP])),
  badge: slab(BADGE, 2, 6, 2),
  badgeText: sideMatrix([0, BADGE.y + BADGE.d], 3.4, P, "left"),
  badgeRivets: [at([BADGE.x + 2.6, BADGE.y + BADGE.d, 5]), at([BADGE.x + BADGE.w - 2.6, BADGE.y + BADGE.d, 5])],
};

export const DECK_ART = {
  deck: slab(DECK, BASE_TOP, DECK_TOP - BASE_TOP, 6, 0.8),
  groove: planOutline(insetPlan(DECK, 3.4), DECK_TOP, P, 6),
  slots: join(KEYS.map((key) => planOutline({ x: key.x - 1.3, y: key.y - 4.2, w: 2.6, d: 6.8, r: 1.3 }, DECK_TOP, P, 3))),
  spaceSlots: join([-1, 1].map((side) => planOutline({ x: side * 40 - 1.3, y: SPACE_Y - 6, w: 2.6, d: 8, r: 1.3 }, DECK_TOP, P, 3))),
};

export const KEY_ART = KEYS.map((key, index) => ({ key, index, at: [key.x, key.y, key.top] as Point3 }))
  .sort((a, b) => depthOf(a.at, P) - depthOf(b.at, P))
  .map(({ key, index }) => ({
    index,
    stem: cyl(key.x, key.y, 1.2, DECK_TOP, key.top - 3.4 - DECK_TOP, 12),
    rim: cyl(key.x, key.y, key.r, key.top - 3.4, 1.3, 32),
    cap: cyl(key.x, key.y, key.r - 0.8, key.top - 2.1, 2.1, 32, 0.4),
    dish: ring(key.x, key.y, key.r - 2.6, key.top, P, 28),
  }));

const SPACE_BAR: Plan = { x: -SPACE_HALF, y: SPACE_Y - 4, w: SPACE_HALF * 2, d: 8, r: 3.8 };
export const SPACE_ART = {
  stems: [-1, 1].map((side) => cyl(side * 40, SPACE_Y - 1.5, 1.2, DECK_TOP, SPACE_TOP - 3 - DECK_TOP, 12)),
  bar: slab(SPACE_BAR, SPACE_TOP - 3, 3, 6, 0.5),
  groove: planOutline(insetPlan(SPACE_BAR, 1.6), SPACE_TOP, P, 6),
};
