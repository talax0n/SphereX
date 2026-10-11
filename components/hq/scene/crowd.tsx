import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  type BufferGeometry,
  Euler,
  type Material,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from "three";
import { STATION_BY_ID, type StationId } from "@/data/stations";
import { DROP_IN, HOVER, ctl, setGesture } from "../game";
import { ACCENT, CLAY } from "./clay";
import {
  HATS,
  HEAD_Y,
  HOP,
  KING,
  PARTS,
  RADIUS,
  PLAIN,
  SCALE,
  type Folk,
  type Hat,
  type Villager,
  VISITORS,
  animate,
  lookOf,
  makeCrowd,
  move,
  stepVillager,
  stepVisitor,
} from "./folk";
import { IDLES, type Gesture, type Pose, blankPose, chasePose, mirrorPose, mixPose, onceOf, poseOf } from "./gesture";
import { LANDMARKS, R, SEA_LEVEL, arc, depthAt, flatten, frameAt, pathDown, plinthAt, standLift, steer, swimming, toward } from "./planet";
import { blobTexture } from "./props";
import { TIME_SCALE } from "./work";

const SPEED = 3.2;
/** swimming is slower than walking */
const STROKE = 0.55;
/** take-off speed: with GRAVITY that clears about 0.6 units, a little over the plinths' edges */
const JUMP = 4.4;
const TURN = 10;

const folk = makeCrowd(ctl.player);
const N = folk.length;
ctl.villagers = folk.filter((f) => f.kind === "villager");
ctl.visitors = folk.filter((f) => f.kind === "visitor");
const hatSlots = Object.fromEntries(HATS.map((h) => [h, folk.filter((f) => f.hat === h)])) as Record<Hat, Folk[]>;
/** a visitor's hat can be any kind, so each hat mesh keeps one spare instance per visitor slot after the fixed ones */
const hatBase = Object.fromEntries(HATS.map((h) => [h, hatSlots[h].length])) as Record<Hat, number>;
/** the crown keeps one more instance after the visitors' for the player, who wears it once the room crowns them */
const MY_CROWN = hatBase.crown + VISITORS;
const plain = { shirt: folk[0].shirt.clone(), foot: folk[0].foot.clone() };

const blobMat = new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
const haloMat = new MeshBasicMaterial({ color: ACCENT });
const haloGeo = new TorusGeometry(0.42, 0.03, 6, 36).rotateX(Math.PI / 2);
const puffMat = new MeshBasicMaterial({ color: "#fbf6ec", transparent: true, depthWrite: false });
const puffGeo = new TorusGeometry(0.5, 0.11, 6, 28).rotateX(Math.PI / 2).scale(1, 0.55, 1);

const GRAVITY = 16;
/** the little jump off the hover spot before gravity takes over */
const LEAP = 3.2;
/** the crouch before that jump */
const WIND = 0.2;
const PUFF = 0.55;
const STARTLE = 3.5;
const reduced = typeof window === "undefined" ? null : window.matchMedia("(prefers-reduced-motion: reduce)");
/** the player's intro clocks: vertical speed, a free-running hover clock, crouch, flail blend */
const drop = { vy: 0, t: 0, wind: 0, flail: 0, last: ctl.intro };
/** one dust ring for whoever touched down last, the player or an agent dropping in */
const puffAt = { n: new Vector3(), heading: new Vector3(), t: Infinity, lift: 0 };
/** the player's own jump and the water they're in */
const self = {
  vy: 0,
  ground: 0,
  wet: false,
  /** waypoints down off a plinth toward `pathFor`, the click target they were found for */
  path: [] as Vector3[],
  pathFor: null as typeof ctl.target,
  /** the plinth underfoot, and how long the view keeps turning to face into it */
  on: undefined as StationId | undefined,
  facing: 0,
};
const into = new Vector3();
function land(f: Folk, lift = 0) {
  puffAt.lift = lift;
  puffAt.n.copy(f.n);
  puffAt.heading.copy(f.heading);
  puffAt.t = 0;
}
/** seconds of gesture blend, and the idle schedule once the player stands still */
const BLEND = 0.25;
const IDLE_AFTER = 3;
const IDLE_EACH = 3.6;
const idle = { t: 0 };
const isIdle = (g: Gesture) => (IDLES as readonly Gesture[]).includes(g);
/** the pose on screen, the one it blends from, and the gesture's own pose this frame */
const shown = blankPose();
const from = blankPose();
const live = blankPose();
/** keepers never gesture; villagers carry their own pose */
const STILL = blankPose();
const aim = blankPose();
const poseFor = (f: Folk): Pose =>
  f.kind === "player" ? shown : f.kind === "villager" || f.kind === "visitor" ? f.pose : STILL;

const ONE = new Vector3(1, 1, 1);
const base = new Matrix4();
const torso = new Matrix4();
const local = new Matrix4();
const hang = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s = new Vector3();
const dir = new Vector3();
const input = new Vector3();
const right = new Vector3();
const before = new Vector3();
const eul = new Euler();
const rotXZ = (x: number, z: number) => q.setFromEuler(eul.set(x, 0, z));
// arms pitch before they raise, so a positive pitch always swings the hand forward, hanging or overhead
const armEul = new Euler(0, 0, 0, "ZYX");
const headM = new Matrix4();
const slot: Record<Hat, number> = { beanie: 0, cap: 0, ears: 0, crown: 0 };
const NONE = new Matrix4().makeScale(0, 0, 0);

/** Writes the walk direction to `input` and returns its strength: keys are all or nothing, the stick is analog. */
function readInput(): number {
  const k = ctl.keys;
  const ix = +(k.has("KeyD") || k.has("ArrowRight")) - +(k.has("KeyA") || k.has("ArrowLeft")) + ctl.stick.x;
  const iy = +(k.has("KeyW") || k.has("ArrowUp")) - +(k.has("KeyS") || k.has("ArrowDown")) + ctl.stick.y;
  const m = Math.min(1, Math.hypot(ix, iy));
  if (!m) return 0;
  const { n } = ctl.player;
  right.crossVectors(ctl.north, n);
  input.copy(ctl.north).multiplyScalar(iy).addScaledVector(right, ix);
  flatten(input, n);
  return m;
}

/** Player intent: keys beat a click target; returns the turn rate for leaning. */
function stepPlayer(f: Folk, dt: number, stuck: { t: number }): number {
  const p = ctl.player;
  let want = 0;
  const push = ctl.frozen ? 0 : readInput();
  if (push) {
    ctl.target = null;
    dir.copy(input);
    want = SPEED * push;
  } else if (!ctl.frozen && ctl.target) {
    const left = arc(p.n, ctl.target.n);
    if (left < 0.08) {
      if (!ctl.target.station) ctl.target = null;
    } else {
      if (self.pathFor !== ctl.target) {
        self.pathFor = ctl.target;
        const on = plinthAt(p.n);
        self.path = on && plinthAt(ctl.target.n) !== on ? pathDown(p.n, RADIUS) : [];
      }
      while (self.path.length && arc(p.n, self.path[0]) < 0.12) self.path.shift();
      toward(p.n, self.path[0] ?? ctl.target.n, dir);
      want = Math.min(SPEED, left * 4 + 0.5);
    }
  }
  if (self.wet) want *= STROKE;
  // walking by hand, plinth edges stop the player; a walk to a target off the plinth still detours round them
  const detour = !!ctl.target && !self.path.length && !plinthAt(p.n);
  if (want > 0) steer(p.n, dir, RADIUS, ctl.target?.n ?? null, null, true, detour);
  faceInto(dt);
  f.speed += (want - f.speed) * Math.min(1, dt * (want ? 9 : 12));

  const turn = want > 0 ? Math.atan2(v.crossVectors(p.heading, dir).dot(p.n), p.heading.dot(dir)) : 0;
  const lean = Math.max(-1.5, Math.min(1.5, turn * 3));
  if (want > 0) {
    p.heading.lerp(dir, Math.min(1, dt * TURN));
    flatten(p.heading, p.n);
  }
  before.copy(p.n);
  move(f, dt, want > 0 ? dir : p.heading, ctl.north);
  const moved = arc(before, p.n);
  if (want > 0) ctl.walked += moved;
  if (ctl.target && want > 0.6 && moved < want * dt * 0.25) {
    stuck.t += dt;
    if (stuck.t > 0.6) ctl.target = null;
  } else {
    stuck.t = 0;
  }
  return lean;
}

/** Stepping onto a plinth turns the view to look in through its open corner, where no wall or roof is in the way; dragging still turns it after. */
function faceInto(dt: number) {
  const p = ctl.player;
  const on = plinthAt(p.n);
  if (on !== self.on) {
    self.on = on;
    self.facing = on ? 0.8 : 0;
  }
  if (!on || self.facing <= 0) return;
  self.facing -= dt;
  const l = LANDMARKS[on];
  // the plinth's open +X+Z corner faces the hub, so looking along -X-Z sees past the back walls
  flatten(into.set(-1, 0, -1).transformDirection(l.frame), p.n);
  // rotate rather than lerp: a lerp from the opposite way passes through zero
  const off = Math.atan2(v.crossVectors(ctl.north, into).dot(p.n), ctl.north.dot(into));
  ctl.north.applyAxisAngle(p.n, off * Math.min(1, dt * 5));
  flatten(ctl.north, p.n);
}

function stepKeeper(f: Extract<Folk, { kind: "keeper" }>, dt: number) {
  const close = arc(f.n, ctl.player.n) < 3.2;
  toward(f.n, close ? ctl.player.n : v.copy(f.n).add(f.rest), dir);
  const turn = Math.atan2(v.crossVectors(f.heading, dir).dot(f.n), f.heading.dot(dir));
  f.heading.lerp(dir, Math.min(1, dt * 5));
  flatten(f.heading, f.n);
  return turn * 0.3;
}

/** Hover, fall and touchdown for the player; the reducer only learns about it through `ctl.intro`. */
function stepDrop(f: Folk, dt: number) {
  const still = !!reduced?.matches;
  const p = ctl.player;
  drop.t += dt;
  if (ctl.intro !== drop.last) {
    if (ctl.intro === "crouch") {
      drop.wind = 0;
      setGesture("crouch");
    }
    if (ctl.intro === "fall") drop.vy = ctl.alt > DROP_IN + 0.5 ? LEAP : 0;
    drop.last = ctl.intro;
  }
  if (ctl.intro === "crouch") {
    drop.wind += dt;
    if (still || drop.wind >= WIND) ctl.intro = "fall";
  }
  if (ctl.intro === "hover") {
    ctl.alt += (HOVER - ctl.alt) * Math.min(1, dt * 3);
    // face the close-up camera behind the carried north; rotate, since a lerp from the opposite heading passes through zero
    dir.copy(ctl.north).negate();
    const off = Math.atan2(v.crossVectors(p.heading, dir).dot(p.n), p.heading.dot(dir));
    p.heading.applyAxisAngle(p.n, off * Math.min(1, dt * 6));
    flatten(p.heading, p.n);
  }
  if (ctl.intro === "fall") {
    drop.vy -= GRAVITY * dt;
    ctl.alt += drop.vy * dt;
    if (drop.vy < 0) drop.flail = Math.min(1, drop.flail + dt * 6);
    // stretch along the fall, squash on impact
    f.sq = Math.max(-0.2, Math.min(0, drop.vy * 0.015));
    f.sqv = 0;
    if (still || ctl.alt <= 0) {
      const impact = -drop.vy;
      ctl.alt = 0;
      drop.vy = 0;
      ctl.intro = drop.last = "ground";
      if (still) return;
      f.sqv = Math.min(7, impact * 0.6);
      land(f);
      // nearby villagers jump in surprise, the closest first
      for (const o of folk) {
        const d = arc(o.n, p.n);
        if (o.kind === "villager" && o.shown && d < STARTLE) o.hop = -d * 0.05;
      }
    }
  } else {
    drop.flail += (0 - drop.flail) * Math.min(1, dt * 8);
  }
}

/** Space or the touch button: a hop with gravity on land, and the step into and out of water. */
function stepBody(f: Folk, dt: number) {
  const p = ctl.player;
  const ask = ctl.jump;
  ctl.jump = false;
  if (ctl.intro !== "ground") return;
  self.ground += (standLift(p.n) - self.ground) * Math.min(1, dt * 8);
  const wet = swimming(p.n);
  if (wet !== self.wet) {
    self.wet = wet;
    setGesture(wet ? "swim" : "rest");
    if (wet) land(f, SEA_LEVEL);
  }
  if (ask && !wet && ctl.alt === 0) {
    self.vy = JUMP;
    setGesture("jump");
  }
  if (self.vy === 0 && ctl.alt === 0) return;
  self.vy -= GRAVITY * dt;
  ctl.alt += self.vy * dt;
  f.sq = Math.max(-0.2, Math.min(0, self.vy * 0.015));
  f.sqv = 0;
  if (ctl.alt > 0) return;
  f.sqv = Math.min(5, -self.vy * 0.5);
  ctl.alt = self.vy = 0;
  if (!reduced?.matches) land(f, self.ground);
}

/** An agent's villager falling in: gravity, a stretch on the way down, a squash and a puff on touchdown. */
function stepFall(f: Villager, dt: number) {
  f.vy -= GRAVITY * dt;
  f.alt += f.vy * dt;
  f.sq = Math.max(-0.2, Math.min(0, f.vy * 0.015));
  f.sqv = 0;
  if (f.alt > 0 && !reduced?.matches) return;
  f.sqv = f.alt > 0 ? 0 : Math.min(7, -f.vy * 0.6);
  f.alt = f.vy = 0;
  if (!reduced?.matches) land(f);
}

/**
 * Advances the player's gesture clock, runs the idle schedule, and writes the blended pose to `shown`.
 * Gestures change by snapshotting whatever is on screen and easing from there, so nothing snaps.
 */
function stepGesture(f: Folk, dt: number) {
  const g = ctl.gesture;
  const motion = reduced?.matches ? 0 : 1;
  if (ctl.intro === "ground") {
    if (f.speed > 0.05 || ctl.target) {
      idle.t = 0;
      if (isIdle(g.current)) setGesture("rest");
    } else if (motion && !self.wet && (g.current === "rest" || isIdle(g.current))) {
      idle.t += dt;
      if (idle.t > IDLE_AFTER && (g.current === "rest" || g.t > IDLE_EACH)) {
        let next: Gesture;
        do next = IDLES[Math.floor(Math.random() * IDLES.length)];
        while (next === g.current);
        setGesture(next);
      }
    }
  }
  const once = onceOf(g.current);
  if (once !== undefined && g.t >= once) setGesture("rest");
  if (g.blend === 0) mixPose(shown, shown, 0, from);
  g.t += dt;
  g.blend = Math.min(1, g.blend + dt / BLEND);
  poseOf(g.current, g.t, motion, live);
  if (g.side < 0) mirrorPose(live);
  mixPose(from, live, g.blend, shown);
}

/** Writes the surface frame to `base` and the torso bone (bob, waddle, lean, squash, hop) to `torso`. */
function pose(f: Folk, g: Pose, i: number, lift: number): number {
  frameAt(f.n, f.heading, base, lift, SCALE);
  // lying down tips the whole body back about the feet, so the face ends up to the sky
  if (g.lie) base.multiply(hang.makeRotationX((-g.lie * Math.PI) / 2));
  const step = Math.sin(f.phase);
  const bob = Math.abs(Math.cos(f.phase)) * 0.05 * f.amp;
  let hop = f.hop > 0 && f.hop < HOP ? Math.sin((Math.PI * f.hop) / HOP) * 0.45 : 0;
  const cel = ctl.celebrate;
  if (cel.active) {
    const t = cel.t - (i % 12) * 0.05;
    if (t > 0 && t < 1.2) hop = Math.max(hop, Math.abs(Math.sin((Math.PI * t) / 0.6)) * 0.55);
  }
  const roll = step * 0.13 * f.amp - f.lean * 0.12 + g.lean;
  const squash = f.sq + g.squash;
  const pitch = 0.1 * f.amp;
  const sq = Math.max(-0.25, Math.min(0.25, squash));
  local.compose(v.set(0, bob + hop, 0), rotXZ(pitch, roll), s.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5));
  torso.multiplyMatrices(base, local);
  return step;
}

const SHOULDER = 0.18;

interface Meshes {
  head: InstancedMesh | null;
  face: InstancedMesh | null;
  body: InstancedMesh | null;
  nub: InstancedMesh | null;
  blob: InstancedMesh | null;
  beanie: InstancedMesh | null;
  cap: InstancedMesh | null;
  ears: InstancedMesh | null;
  crown: InstancedMesh | null;
}

interface CrowdProps {
  near: StationId | null;
  onOpen: (id: StationId) => void;
}

/** Every character, the player included, in eight instanced draw calls and one frame loop. */
const meshes: Meshes = {
  head: null,
  face: null,
  body: null,
  nub: null,
  blob: null,
  beanie: null,
  cap: null,
  ears: null,
  crown: null,
};
/** Stable ref callbacks, so React doesn't detach and reattach each mesh on every render. */
const bind = Object.fromEntries(
  (Object.keys(meshes) as (keyof Meshes)[]).map((k) => [
    k,
    (mesh: InstancedMesh | null) => {
      meshes[k] = mesh;
    },
  ]),
) as Record<keyof Meshes, (mesh: InstancedMesh | null) => void>;

const LAYERS: [keyof Meshes, BufferGeometry, Material, number][] = [
  ["head", PARTS.head, CLAY, N],
  ["face", PARTS.face, CLAY, N],
  ["body", PARTS.body, CLAY, N],
  ["nub", PARTS.nub, CLAY, N * 4],
  ["blob", PARTS.blob, blobMat, N],
  ...HATS.map((h): [Hat, BufferGeometry, Material, number] => [h, PARTS[h], CLAY, hatBase[h] + VISITORS + (h === "crown" ? 1 : 0)]),
];

/** Dresses a visitor's or the player's instances; run when their look changes, since colours are otherwise set once. */
function dress(i: number, f: Folk, hatAt: number) {
  const { head, body, nub } = meshes;
  head?.setColorAt(i, f.skin);
  body?.setColorAt(i, f.shirt);
  nub?.setColorAt(i * 4, f.foot);
  nub?.setColorAt(i * 4 + 1, f.foot);
  nub?.setColorAt(i * 4 + 2, f.skin);
  nub?.setColorAt(i * 4 + 3, f.skin);
  const hat = f.hat && meshes[f.hat];
  if (hat) hat.setColorAt(hatAt, f.hatColor);
  for (const mesh of [head, body, nub, hat]) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function Crowd({ near, onOpen }: CrowdProps) {
  const halo = useRef<Mesh>(null);
  const puff = useRef<Mesh>(null);
  const stuck = useMemo(() => ({ t: 0 }), []);
  const crowned = useRef(false);

  useEffect(() => {
    const { head, face, body, nub } = meshes;
    folk.forEach((f, i) => {
      head?.setColorAt(i, f.skin);
      face?.setColorAt(i, PLAIN);
      body?.setColorAt(i, f.shirt);
      nub?.setColorAt(i * 4, f.foot);
      nub?.setColorAt(i * 4 + 1, f.foot);
      nub?.setColorAt(i * 4 + 2, f.skin);
      nub?.setColorAt(i * 4 + 3, f.skin);
    });
    for (const h of HATS) hatSlots[h].forEach((f, j) => meshes[h]?.setColorAt(j, f.hatColor));
    for (const mesh of Object.values(meshes)) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1) * TIME_SCALE;
    const { head, face, body, nub, blob, beanie, cap, ears, crown } = meshes;
    if (!head || !face || !body || !nub || !blob || !beanie || !cap || !ears || !crown) return;
    slot.beanie = slot.cap = slot.ears = slot.crown = 0;
    if (crowned.current !== ctl.king) {
      crowned.current = ctl.king;
      const me = folk[0];
      Object.assign(me, ctl.king ? { shirt: KING.shirt, foot: KING.foot } : plain);
      dress(0, { ...me, hat: "crown", hatColor: KING.hatColor }, MY_CROWN);
    }

    for (let i = 0; i < N; i++) {
      const f = folk[i];
      if (f.kind === "visitor" && f.fresh && f.shown) {
        Object.assign(f, lookOf(f.look), f.king ? KING : {});
        if (f.hat) dress(i, f, hatBase[f.hat] + f.slot);
      }
      if ((f.kind === "villager" || f.kind === "visitor") && !f.shown) {
        for (const m of [head, face, body, blob]) m.setMatrixAt(i, NONE);
        for (let k = 0; k < 4; k++) nub.setMatrixAt(i * 4 + k, NONE);
        if (f.kind === "visitor") for (const h of HATS) meshes[h]?.setMatrixAt(hatBase[h] + f.slot, NONE);
        else if (f.hat) meshes[f.hat]?.setMatrixAt(slot[f.hat]++, NONE);
        continue;
      }
      let turn = 0;
      let lift = 0;
      /** what the shadow sits on: the ground, or a plinth top for a villager standing on one */
      let floor = 0;
      if (f.kind === "player") {
        turn = stepPlayer(f, dt, stuck);
        stepDrop(f, dt);
        stepBody(f, dt);
        stepGesture(f, dt);
        floor = ctl.intro === "ground" ? self.ground : 0;
        // gesture bounces lift the whole body, feet and all, unlike the torso-only greeting hop
        lift = floor + ctl.alt + shown.bounce + (ctl.intro === "hover" && !reduced?.matches ? Math.sin(drop.t * 2.2) * 0.07 : 0);
      } else if (f.kind === "keeper") turn = stepKeeper(f, dt);
      else if (f.kind === "visitor") {
        turn = stepVisitor(f, dt, reduced?.matches ? 0 : 1, aim);
        floor = f.lift;
        lift = f.lift + f.pose.bounce;
      } else if (f.alt > 0) {
        stepFall(f, dt);
        lift = f.alt;
      } else {
        stepVillager(f, folk, dt, Math.random);
        f.clock += dt;
        chasePose(f.pose, poseOf(f.pin?.move ?? "rest", f.clock, reduced?.matches ? 0 : 1, aim), Math.min(1, dt * 4));
        floor = f.lift;
        lift = f.lift + f.pose.bounce;
        turn = f.turn;
      }
      animate(f, dt, turn);
      const g = poseFor(f);
      const step = pose(f, g, i, lift);

      let skull = torso;
      if (g.headYaw) {
        // turn the head about the neck, not the feet
        local.makeTranslation(0, HEAD_Y, 0).multiply(hang.makeRotationY(g.headYaw));
        skull = headM.multiplyMatrices(torso, local).multiply(hang.makeTranslation(0, -HEAD_Y, 0));
      }
      head.setMatrixAt(i, skull);
      face.setMatrixAt(i, skull);
      body.setMatrixAt(i, torso);
      if (f.kind === "visitor") for (const h of HATS) meshes[h]?.setMatrixAt(hatBase[h] + f.slot, h === f.hat ? skull : NONE);
      else if (f.kind === "player") {
        // the beanie keeps its slot, so the hats after it keep their colours
        if (f.hat) meshes[f.hat]?.setMatrixAt(slot[f.hat]++, ctl.king ? NONE : skull);
        crown.setMatrixAt(MY_CROWN, ctl.king ? skull : NONE);
      } else if (f.hat) meshes[f.hat]?.setMatrixAt(slot[f.hat]++, skull);

      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        const swing = step * side * f.amp;
        // feet hang off the ground frame, not the torso, so the waddle never lifts them through the floor
        const tap = k ? g.tap * 0.1 : 0;
        local.compose(
          v.set(side * 0.1, 0.06 + Math.max(0, swing) * 0.06 + tap, 0.03 + swing * 0.1 + tap * 0.4),
          q.identity(),
          s.set(0.09, 0.065, 0.125),
        );
        nub.setMatrixAt(i * 4 + k, local.premultiply(base));
        // gestures lead with the right arm (k 0), the side away from the intro bubble
        let raise = k ? g.armL : g.armR;
        const fwd = swing * 0.6 * g.swing + (k ? g.fwdL : g.fwdR);
        let grow = g.grow;
        const flail = f.kind === "player" ? drop.flail : f.kind === "villager" && f.alt > 0 ? 1 : 0;
        if (flail) {
          raise += (2.3 + Math.sin(drop.t * 26 + k * 2 + i) * 0.35 - raise) * flail;
          grow = Math.max(grow, flail);
        }
        // a raised arm steps out from the shoulder and grows, so the hand clears the head and reads at close range
        local.compose(
          v.set(side * (SHOULDER + 0.06 * grow), 0.42, 0),
          q.setFromEuler(armEul.set(-fwd, 0, side * raise)),
          ONE,
        );
        hang.compose(
          v.set(0, -0.09 - 0.07 * grow, 0),
          q.identity(),
          s.set(0.065 + 0.02 * grow, 0.12 + 0.07 * grow, 0.07 + 0.02 * grow),
        );
        nub.setMatrixAt(i * 4 + 2 + k, local.multiply(hang).premultiply(torso));
      }
      // shadows stay on the floor and tighten as the player comes down to meet them; a body lying down hides its own
      if (lift !== floor || g.lie) frameAt(f.n, f.heading, base, floor, SCALE);
      // under water there's no shadow to cast, only the swimmer's own ripple
      const dry = f.kind === "player" ? +!self.wet : f.kind === "visitor" ? +!swimming(f.n) : 1;
      const shade = 1.15 * (1 - Math.min(0.45, (lift - floor) * 0.13)) * (1 - g.lie) * dry;
      local.compose(v.set(0, 0.02, 0), q.identity(), s.set(shade, 1, shade));
      blob.setMatrixAt(i, local.premultiply(base));
      if (f.kind === "player" && halo.current) {
        halo.current.visible = ctl.intro === "ground";
        frameAt(f.n, f.heading, halo.current.matrix, (depthAt(f.n) > 0 ? Math.max(self.ground, SEA_LEVEL) : self.ground) + 0.04);
      }
    }

    if (puff.current) {
      const m = puff.current;
      puffAt.t += dt;
      const t = puffAt.t / PUFF;
      m.visible = t < 1;
      if (m.visible) {
        const e = 1 - (1 - t) ** 3;
        frameAt(puffAt.n, puffAt.heading, m.matrix, puffAt.lift + 0.03, 0.5 + 1.6 * e);
        puffMat.opacity = 0.9 * (1 - t);
      }
    }

    head.instanceMatrix.needsUpdate = true;
    face.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    nub.instanceMatrix.needsUpdate = true;
    blob.instanceMatrix.needsUpdate = true;
    beanie.instanceMatrix.needsUpdate = true;
    cap.instanceMatrix.needsUpdate = true;
    ears.instanceMatrix.needsUpdate = true;
    crown.instanceMatrix.needsUpdate = true;
  });

  const keeperHead = near && LANDMARKS[near].keeper.clone().multiplyScalar(R + 1.15);

  return (
    <>
      {LAYERS.map(([k, geo, mat, count]) => (
        <instancedMesh
          key={k}
          ref={bind[k]}
          args={[geo, mat, count]}
          frustumCulled={false}
          renderOrder={k === "blob" ? 1 : 0}
        />
      ))}
      <mesh ref={halo} geometry={haloGeo} material={haloMat} matrixAutoUpdate={false} renderOrder={2} />
      <mesh
        ref={puff}
        geometry={puffGeo}
        material={puffMat}
        matrixAutoUpdate={false}
        visible={false}
        frustumCulled={false}
        renderOrder={2}
      />
      {keeperHead && (
        <Html key={near} position={keeperHead} center zIndexRange={[14, 0]}>
          <button
            type="button"
            onClick={() => onOpen(near)}
            className="hq-bubble relative w-max max-w-[220px] rounded-2xl border border-hq-line bg-white px-3 py-2 text-left text-[12px] leading-snug text-hq-ink shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] max-sm:max-w-[180px] max-sm:text-[11px]"
          >
            {STATION_BY_ID[near].line}{" "}
            <span className="font-semibold text-hq-accent pointer-coarse:hidden">Press E</span>
            <span className="hidden font-semibold text-hq-accent pointer-coarse:inline">Tap to open</span>
          </button>
        </Html>
      )}
    </>
  );
}
