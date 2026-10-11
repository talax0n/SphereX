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
const { CHORE, UNIFORM, WEAR, dressUp, KING, RADIUS, keeperLook, lookOf, makeCrowd, stepKeeper, worn } = await import("../components/hq/scene/folk.ts");
const { blankPose, poseOf } = await import("../components/hq/scene/gesture.ts");
const { OBSTACLES, plinthAt } = await import("../components/hq/scene/planet.ts");
const { IDENTITY } = await import("../components/hq/scene/dioramas.ts");
const { STATIONS } = await import("../data/stations.ts");

const KINDS = {
  face: ["smile", "grin", "oh", "joy"],
  bottom: ["trousers", "skirt"],
  top: ["overalls", "hoodie", "jacket", "stripes"],
  hat: ["beanie", "cap", "ears", "crown", "bucket", "tophat", "hardhat", "headphones", "newsboy", "paper"],
  hair: ["bob", "fringe", "spiky", "bun", "curly", "long", "pigtails"],
  neck: ["scarf", "tie", "bowtie", "medal"],
  back: ["backpack", "satchel"],
  eyes: ["glasses", "shades"],
  prop: ["blueprint", "laptop", "briefcase", "wrench", "trophy", "mug", "envelope", "newspaper"],
} as const;
const all: string[] = Object.values(KINDS).flat();
assert.deepEqual(Object.keys(WEAR).sort(), [...all].sort(), "the registry and the slot lists disagree");
assert.equal(all.length, 43);
for (const k of KINDS.prop) assert.equal(WEAR[k].bone, "hand", `${k} is held`);
for (const k of [...KINDS.face, ...KINDS.hat, ...KINDS.hair, ...KINDS.eyes]) assert.equal(WEAR[k].bone, "head", `${k} on the head`);
for (const k of [...KINDS.bottom, ...KINDS.top, ...KINDS.neck, ...KINDS.back]) assert.equal(WEAR[k].bone, "torso", `${k} on the body`);

const TALL = ["spiky", "bun", "curly"];
type Look = ReturnType<typeof lookOf>;
const tallUnderHat = (l: Look) => !!(l.hat && l.hair && TALL.includes(l.hair.kind));
const sig = (l: Look) => [l.skin, l.shirt, l.foot].map((c) => c.getHexString()).concat(worn(l).map(([k, c]) => `${k}:${c.getHexString()}`), [`${l.build}`, `${l.height}`, `${l.head}`]);

// the same seed dresses everyone alike
assert.deepEqual(sig(lookOf(123456789)), sig(lookOf(123456789)));
assert.notDeepEqual(sig(lookOf(1)), sig(lookOf(2)));

// pinned so a palette or odds change is a conscious one
const p = lookOf(29);
assert.deepEqual(
  [p.skin.getHexString(), p.shirt.getHexString(), p.face.kind, p.bottom.kind, p.top?.kind, p.hat?.kind, p.hair?.kind, p.neck?.kind, p.back?.kind, p.eyes?.kind, p.head],
  ["e2ad86", "8fcf9a", "smile", "trousers", "overalls", "headphones", "bob", undefined, undefined, undefined, 1],
);

const seen = new Set<string>();
let kids = 0;
let haired = 0;
let bare = 0;
const note = (l: Look) => {
  for (const [k] of worn(l)) seen.add(k);
  assert.ok(!tallUnderHat(l), `tall ${l.hair?.kind} under a ${l.hat?.kind}`);
  assert.ok(!(l.top?.kind === "overalls" && l.bottom.kind !== "trousers"), "overalls over a skirt");
  assert.ok(l.build >= 0.84 && l.build <= 1.2, `build ${l.build}`);
  assert.ok(l.height >= 0.72 && l.height <= 1.14, `height ${l.height}`);
  if (l.head > 1) {
    kids++;
    assert.equal(l.head, 1.22);
    assert.ok(l.height <= 0.8, "a kid is short");
    assert.ok(!["tophat", "hardhat", "newsboy"].includes(l.hat?.kind ?? ""), `kid in a ${l.hat?.kind}`);
    assert.ok(!["tie", "bowtie", "medal"].includes(l.neck?.kind ?? ""), `kid in a ${l.neck?.kind}`);
  } else assert.equal(l.head, 1);
  if (!l.hat) {
    bare++;
    if (l.hair) haired++;
  }
};
for (let i = 0; i < 5000; i++) {
  const l = lookOf(Math.imul(i + 1, 0x9e3779b1) >>> 0);
  assert.equal(l.prop, null, "villagers keep their hands free");
  note(l);
}
assert.ok(kids > 400 && kids < 800, `${kids} kids in 5000`);
assert.ok(haired / bare > 0.8, "most bare heads have hair");

const crowd = makeCrowd({ n: new Vector3(0, 1, 0), heading: new Vector3(0, 0, 1) });
for (const f of crowd) if (f.kind !== "player" && f.kind !== "visitor") note(f);
const me = crowd[0];
assert.deepEqual(worn(me).map(([k]) => k), ["smile", "trousers", "beanie"]);
assert.equal(me.shirt.getHexString(), "fbfaf7");
assert.equal(me.hat?.color.getHexString(), "2b3cff");

// a king's tall hair gives way to the crown
const tall = dressUp({ ...me, hair: { kind: "curly", color: me.skin } }, KING);
assert.equal(tall.hat?.kind, "crown");
assert.equal(tall.hair, null);
assert.equal(tall.skin, me.skin);

for (const k of all) if (k !== "crown") assert.ok(seen.has(k), `${k} never appears`);

// every keeper has a uniform with a prop, wears it, and keeps their station's wall colour
const JOB = {
  about: ["hardhat", "glasses", "blueprint"],
  projects: ["headphones", "backpack", "laptop"],
  experience: ["tie", "glasses", "bob", "jacket", "briefcase"],
  skills: ["beanie", "scarf", "overalls", "wrench"],
  awards: ["tophat", "medal", "trophy"],
  github: ["cap", "satchel", "mug"],
  contact: ["newsboy", "satchel", "envelope"],
  updates: ["paper", "bowtie", "newspaper"],
} as const;
const PROP = { about: "blueprint", projects: "laptop", experience: "briefcase", skills: "wrench", awards: "trophy", github: "mug", contact: "envelope", updates: "newspaper" };
assert.deepEqual(Object.keys(JOB).sort(), STATIONS.map((s) => s.id).sort());
const own: string[] = [...KINDS.hair, ...KINDS.face, ...KINDS.bottom];
for (const s of STATIONS) {
  assert.equal(UNIFORM[s.id].prop.kind, PROP[s.id], `${s.id}: prop`);
  const k = crowd.find((f) => f.kind === "keeper" && f.station === s.id);
  assert.ok(k, `${s.id}: no keeper`);
  assert.equal(k.shirt.getHexString(), IDENTITY[s.id].wall.replace("#", ""), `${s.id}: shirt`);
  assert.equal(k.head, 1, `${s.id}: keepers are grown-ups`);
  assert.deepEqual(sig(k), sig(keeperLook(s.id, STATIONS.indexOf(s))));
  const kinds = worn(k).map(([w]) => w as string);
  const job = JOB[s.id] as readonly string[];
  // a keeper's own seeded hair, face and bottoms add to the job, so look only at what the job names
  assert.deepEqual(kinds.filter((w) => job.includes(w)).sort(), [...job].sort(), `${s.id}: wrong kit`);
  assert.deepEqual(kinds.filter((w) => !job.includes(w) && !own.includes(w)), [], `${s.id}: extra kit`);
}
// every station's keeper has a looping chore that moves, and holds still under reduced motion
const poseKey = (g: Parameters<typeof poseOf>[0], t: number, m: number) => JSON.stringify(poseOf(g, t, m, blankPose()));
for (const s of STATIONS) {
  const g = CHORE[s.id];
  assert.ok(g, `${s.id}: no chore`);
  assert.ok([0.7, 1.9, 2.6, 3.4, 4.1].some((t) => poseKey(g, t, 1) !== poseKey(g, 0, 1)), `${s.id}: ${g} never moves`);
  for (const t of [0.7, 1.9, 2.6, 3.4, 4.1]) assert.equal(poseKey(g, t, 0), poseKey(g, 0, 0), `${s.id}: ${g} moves under reduced motion`);
}
assert.equal(new Set(Object.values(CHORE)).size, STATIONS.length, "chores should differ");

// keepers stroll on their own, stay on clear ground, come home, and wave once when the player walks up
const far = new Vector3(0, -1, 0);
const DT = 1 / 30;
const keepers = crowd.filter((f) => f.kind === "keeper");
for (const k of keepers) {
  let out = 0;
  let strolled = false;
  let dutyEnded = false;
  for (let t = 0; t < 120; t += DT) {
    stepKeeper(k, DT, far, 1);
    out = Math.max(out, k.n.angleTo(k.post) * 9);
    strolled ||= k.duty === "stroll" && k.goal !== k.post;
    dutyEnded ||= k.duty === "idle";
    // a prop planted on the post itself is the one thing a keeper may stand in
    assert.ok(!OBSTACLES.some((o) => o.n !== k.skip && o.n.angleTo(k.n) * 9 < o.r + RADIUS * 0.5), `${k.station}: walked into an obstacle`);
    assert.ok(!plinthAt(k.n), `${k.station}: walked onto a plinth`);
  }
  assert.ok(strolled && out > 0.3 && out < 1.4, `${k.station}: strolled ${out.toFixed(2)}`);
  assert.ok(dutyEnded, `${k.station}: never fidgeted`);
}
assert.ok(new Set(keepers.map((k) => k.timer.toFixed(2))).size > 4, "keepers are in lockstep");
{
  const k = keepers[0];
  const near = k.n.clone();
  let waved = 0;
  let last = k.gest;
  for (let t = 0; t < 12; t += DT) {
    stepKeeper(k, DT, near, 1);
    if (k.gest === "wave" && last !== "wave") waved++;
    last = k.gest;
  }
  assert.equal(waved, 1, "wave once per visit");
  assert.ok(k.met && k.duty === "chore" && k.gest === CHORE[k.station], "back to work after the wave");
  for (let t = 0; t < 4; t += DT) stepKeeper(k, DT, far, 1);
  for (let t = 0; t < 30; t += DT) stepKeeper(k, DT, far, 1);
  assert.ok(!k.met, "forgets the player once they leave");
}
const calm = makeCrowd({ n: new Vector3(0, 1, 0), heading: new Vector3(0, 0, 1) });
for (const k of calm.filter((f) => f.kind === "keeper")) {
  const start = k.n.clone();
  for (let t = 0; t < 60; t += DT) stepKeeper(k, DT, far, 0);
  assert.ok(k.n.distanceTo(start) < 1e-6 && k.duty === "chore" && k.gest === CHORE[k.station], `${k.station}: moved under reduced motion`);
}

console.log(`folk.check ok, ${Object.keys(WEAR).length} wearables, ${seen.size} seen, ${kids} kids in 5000`);
