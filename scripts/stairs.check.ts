import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";

// the scene imports through the `@/` alias and without extensions, which bare node can't resolve
const root = pathToFileURL(`${process.cwd()}/`);
type Next = (spec: string, ctx: { parentURL?: string }) => unknown;
// @types/node here predates module.registerHooks, which node 23.5+ ships
const { registerHooks } = nodeModule as unknown as {
  registerHooks(hooks: { resolve(spec: string, ctx: { parentURL?: string }, next: Next): unknown }): void;
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) spec = new URL(spec.slice(2), root).href;
    if (/^(\.|file:)/.test(spec) && !/\.[cm]?[jt]sx?$/.test(spec)) {
      const url = new URL(spec, ctx.parentURL).href;
      if (existsSync(new URL(`${url}.ts`))) return next(`${url}.ts`, ctx);
    }
    return next(spec, ctx);
  },
});
const { Vector3 } = await import("three");
const { LANDMARKS, LANDMARK_SCALE, R, arc, pathDown, plinthAt, plinthLift, resolve, steer, toward, walk } = await import(
  "../components/hq/scene/planet.ts"
);
const { PLINTH_HEIGHT } = await import("../components/hq/scene/dioramas.ts");
// trees and lamps join the obstacles as props lays them out
await import("../components/hq/scene/props.ts");

type V = InstanceType<typeof Vector3>;
const RADIUS = 0.26;
const STEP = 0.04;
const dir = new Vector3();
const TOP = PLINTH_HEIGHT * LANDMARK_SCALE;

/** Walks the player toward `goal` like crowd.tsx: by hand straight at it, or as a click target down a found path. */
function go(p: V, goal: V, n: number, routed: boolean) {
  const seen = new Set<string>();
  const heading = new Vector3();
  const on = plinthAt(p);
  const path = routed && on && plinthAt(goal) !== on ? pathDown(p, RADIUS) : [];
  for (let i = 0; i < n && arc(p, goal) > 0.1; i++) {
    while (path.length && arc(p, path[0]) < 0.12) path.shift();
    toward(p, path[0] ?? goal, dir).normalize();
    steer(p, dir, RADIUS, routed ? goal : null, null, true, routed && !path.length && !plinthAt(p));
    heading.copy(dir);
    walk(p, dir.normalize(), STEP, heading);
    resolve(p, RADIUS, null, true, heading);
    const at = plinthAt(p);
    if (at) seen.add(at);
  }
  return seen;
}

/** A point in plinth space on station l, on the sphere. */
const spot = (l: (typeof LANDMARKS)[keyof typeof LANDMARKS], x: number, z: number) =>
  new Vector3(x, 0, z).applyMatrix4(l.frame).normalize();

for (const [id, l] of Object.entries(LANDMARKS)) {
  // up the steps by hand: straight in from the foot ends on the plinth top
  const p = l.foot.clone();
  assert.ok(go(p, l.n, 200, false).has(id), `${id}: the steps don't lead up`);
  assert.equal(plinthAt(p), id, `${id}: walked off the plinth again`);
  assert.ok(plinthLift(p) > TOP * 0.9, `${id}: the plinth top lifts only ${plinthLift(p)}`);

  // the far side has no steps: walking at the plinth from behind stays on the ground
  const back = l.n.clone();
  walk(back, toward(l.n, l.foot, dir).normalize().negate(), l.half * 0.75 + 1.2);
  assert.equal(go(back, l.n, 200, false).size, 0, `${id}: climbed a plinth edge`);

  // a click target off the plinth finds its way down the steps from anywhere you can stand on it
  const away = l.foot.clone();
  walk(away, toward(l.n, l.foot, dir).normalize(), 2.5);
  let starts = 0;
  for (let x = -l.half + 0.4; x < l.half - 0.3; x += 0.3)
    for (let z = -l.half + 0.4; z < l.half - 0.3; z += 0.3) {
      const start = spot(l, x, z);
      // only spots a walker can stand on: resolving doesn't move them
      const settled = start.clone();
      resolve(settled, RADIUS, null, true);
      // a pocket the walker can't squeeze into has no way out either
      if (arc(start, settled) > 1e-4 || !pathDown(start, RADIUS).length) continue;
      starts++;
      go(start, away, 2000, true);
      // a prop may stand on the spot itself, so clear of the steps is enough
      assert.ok(arc(start, l.n) > arc(l.foot, l.n) + 1, `${id}: stuck on the way down from ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  assert.ok(starts > 5, `${id}: only ${starts} free spots`);
}

// the Experience steps climb one at a time to the top; the podium's top step is too tall to reach from the floor
{
  const l = LANDMARKS.experience;
  const p = spot(l, 1.4, 0.9);
  for (const x of [0.55, -0.3, -1.15]) go(p, spot(l, x, -0.35), 200, false);
  assert.ok(plinthLift(p) > TOP + 0.96 * LANDMARK_SCALE * 0.95, `experience: reached only ${plinthLift(p).toFixed(2)}`);
  const a = LANDMARKS.awards;
  const q = spot(a, 0, 1.0);
  go(q, spot(a, 0, -0.4), 200, false);
  assert.ok(plinthLift(q) < TOP + 0.01, "awards: stepped straight onto the top of the podium");
}
console.log(`stairs.check ok, ${Object.keys(LANDMARKS).length} stations, R ${R}`);
