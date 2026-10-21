// Parts that change shape as they move: the struck typebar swinging up, and the return lever.
// Shared by the server art (rest pose) and the live component (every frame).
import * as G from "@/components/iso/lathe.mjs";
import { pathOf, type Point3, type SolidPaths } from "@/components/iso/iso-kit";
import { BARS, BAR_L, BAR_R, C, CARRIAGE_HALF, P, REST_DROP, SPREAD, at, onPaper } from "./view";

type V3 = [number, number, number];

const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rect = (hw: number, h0: number, h1: number): [number, number][] => [
  [-hw, h0],
  [hw, h0],
  [hw, h1],
  [-hw, h1],
];

export const thetaOf = (bar: number) => -SPREAD + (2 * SPREAD * bar) / (BARS - 1);

export function pivotOf(bar: number): Point3 {
  const t = thetaOf(bar);
  return [C[0] + BAR_R * Math.sin(t), C[1] + BAR_R * Math.cos(t), C[2]];
}

/** A typebar at swing angle phi: 0 is level pointing out of the basket, the rest pose is -REST_DROP, the strike is HIT. */
export function typebarOf(bar: number, phi: number): { bar: SolidPaths; slug: SolidPaths } {
  const t = thetaOf(bar);
  const dir: V3 = [Math.cos(phi) * Math.sin(t), Math.cos(phi) * Math.cos(t), Math.sin(phi)];
  const side: V3 = [Math.cos(t), -Math.sin(t), 0];
  const F = G.frameOf(pivotOf(bar), dir, side, cross(dir, side));
  return {
    bar: G.prismOf(F, rect(0.55, -1, 1), -2.4, BAR_L - 3.4, P) as SolidPaths,
    slug: G.prismOf(F, rect(1.4, -1.3, 1.5), BAR_L - 3.4, BAR_L - 0.2, P) as SolidPaths,
  };
}

export const REST_PHI = -REST_DROP;

export function barBetween(a: V3, b: V3, hw: number, hh: number) {
  const dir = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const side = unit(cross([0, 0, 1], dir));
  const F = G.frameOf(a, dir, side, cross(dir, side));
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return G.prismOf(F, rect(hw, -hh, hh), 0, length, P) as SolidPaths;
}

export const LEVER_PIVOT: Point3 = [-CARRIAGE_HALF + 3, -38, 78.2];

/** The carriage return lever, turned by `swing` radians about its upright pivot (positive pushes the paddle toward the carriage). */
export function leverOf(swing: number) {
  const [px, py, pz] = LEVER_PIVOT;
  const c = Math.cos(swing);
  const s = Math.sin(swing);
  const turn = ([x, y, z]: V3): V3 => [px + x * c - y * s, py + x * s + y * c, pz + z];
  const elbow = turn([0, 15, 1.6]);
  const tip = turn([-13, 33, 4.6]);
  const along = unit([tip[0] - elbow[0], tip[1] - elbow[1], 0]);
  const paddleFrame = G.frameOf(tip, [0, 0, 1], along, [-along[1], along[0], 0]);
  return {
    arm: barBetween([px, py, pz + 0.4], elbow, 1.1, 1),
    elbow: G.sphereOf(elbow, 1.7, P) as SolidPaths,
    reach: barBetween(elbow, tip, 1.1, 1),
    paddle: G.prismOf(paddleFrame, G.stadium(3.4, 3.4, 7, 28), -0.6, 1.4, P) as SolidPaths,
  };
}

// The ribbon vibrator lifts the ribbon over the print line for each strike, then drops it so the line shows.
export const RIBBON_LOW = -8.6;
export const RIBBON_HIGH = -5;
export const VIBRATOR = { u: 9.5, v0: -10.5, v1: -3.8, out: 2.2 };
export const LIFT = 5.6;

/** The ribbon's front strip across the vibrator, from guide to guide, lifted by `lift`. */
export function ribbonAcross(lift: number) {
  const out = VIBRATOR.out + 1.05;
  const g = 13.2;
  const v = VIBRATOR.u;
  const p = (u: number, w: number, o: number) => at(onPaper(u, w, o));
  return pathOf(
    [
      p(-g, RIBBON_LOW, out - 0.6),
      p(-v, RIBBON_LOW + lift, out),
      p(v, RIBBON_LOW + lift, out),
      p(g, RIBBON_LOW, out - 0.6),
      p(g, RIBBON_HIGH, out - 0.6),
      p(v, RIBBON_HIGH + lift, out),
      p(-v, RIBBON_HIGH + lift, out),
      p(-g, RIBBON_HIGH, out - 0.6),
    ],
    true,
  );
}
