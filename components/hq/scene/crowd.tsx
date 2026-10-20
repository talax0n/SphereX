import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  Euler,
  type Group,
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
  BLOB,
  HOP,
  KING,
  PLAYER,
  RADIUS,
  RIG,
  SCALE,
  WEAR,
  type Folk,
  type Wear,
  type Villager,
  animate,
  dressUp,
  limbs,
  lookOf,
  makeCrowd,
  move,
  skull,
  sleeve,
  stepKeeper,
  stepVillager,
  stepVisitor,
  worn,
} from "./folk";
import { IDLES, type Gesture, type Pose, blankPose, chasePose, mirrorPose, mixPose, onceOf, poseOf } from "./gesture";
import { useModel } from "./models";
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
const keepers = Object.fromEntries(folk.flatMap((f) => (f.kind === "keeper" ? [[f.station, f]] : []))) as Record<
  StationId,
  Extract<Folk, { kind: "keeper" }>
>;

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
const aim = blankPose();
const poseFor = (f: Folk): Pose => (f.kind === "player" ? shown : f.pose);

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
const headM = new Matrix4();
const rig = Array.from({ length: RIG }, () => new Matrix4());
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

/** Girth and height come in as a scale on the ground frame, so feet, arms, hats and the shadow follow. */
const size = (f: Folk) => base.scale(v.set(f.build, f.height, f.build));

/** Writes the surface frame to `base` and the torso bone (bob, waddle, lean, squash, hop) to `torso`. */
function pose(f: Folk, g: Pose, i: number, lift: number): number {
  frameAt(f.n, f.heading, base, lift, SCALE);
  size(f);
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

interface CrowdProps {
  near: StationId | null;
  onOpen: (id: StationId) => void;
}

type Layer = "head" | "body" | "nub" | "blob" | Wear;
const KINDS = Object.keys(WEAR) as Wear[];

/** feet, sleeves and hands, in `limbs` order */
const NUBS = 6;
/** One instance per folk in every mesh (six for the nubs), the instance index being the folk index. */
const LAYERS: [Layer, Material, number][] = [
  ["head", CLAY, N],
  ["body", CLAY, N],
  ["nub", CLAY, N * NUBS],
  ["blob", blobMat, N],
  ...KINDS.map((k): [Layer, Material, number] => [k, CLAY, N]),
];
const meshes = Object.fromEntries(LAYERS.map(([k]) => [k, null])) as Record<Layer, InstancedMesh | null>;
/** Stable ref callbacks, so React doesn't detach and reattach each mesh on every render. */
const bind = Object.fromEntries(
  LAYERS.map(([k]) => [
    k,
    (mesh: InstancedMesh | null) => {
      meshes[k] = mesh;
    },
  ]),
) as Record<Layer, (mesh: InstancedMesh | null) => void>;

/** What each folk has on, by index; the frame loop only poses these. */
const kit: Wear[][] = folk.map(() => []);
/** who each instance slot is dressed as; -1 forces a re-dress */
const slotFolk = folk.map(() => -1);
/** a little over head height, with room for hats, raised arms and hops */
const TALL_AS = 2.5;
const toCam = new Vector3();
/** wearers of each kind on screen this frame; a kind nobody wears isn't drawn */
const used = new Set<Wear>();

/** Dresses a character's instances; run when their look changes, since colours are otherwise set once. */
function dress(i: number, f: Folk) {
  const { head, body, nub } = meshes;
  head?.setColorAt(i, f.skin);
  body?.setColorAt(i, f.shirt);
  const arm = sleeve(f);
  [f.foot, f.foot, arm, arm, f.skin, f.skin].forEach((c, k) => nub?.setColorAt(i * NUBS + k, c));
  const on = worn(f);
  // what they took off stays hidden until they put it on again
  for (const k of kit[i]) meshes[k]?.setMatrixAt(i, NONE);
  kit[i] = on.map(([k]) => k);
  for (const [k, color] of on) meshes[k]?.setColorAt(i, color);
  for (const mesh of Object.values(meshes)) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function Crowd({ near, onOpen }: CrowdProps) {
  const baked = useModel("folk");
  const halo = useRef<Mesh>(null);
  const puff = useRef<Mesh>(null);
  const bubble = useRef<Group>(null);
  const stuck = useMemo(() => ({ t: 0 }), []);
  const crowned = useRef(false);

  useEffect(() => {
    for (const k of KINDS) for (let i = 0; i < N; i++) meshes[k]?.setMatrixAt(i, NONE);
    folk.forEach((f, i) => {
      dress(i, f);
      slotFolk[i] = i;
    });
  }, []);

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.1) * TIME_SCALE;
    const { head, body, nub, blob } = meshes;
    if (!head || !body || !nub || !blob) return;
    for (const k of KINDS) if (!meshes[k]) return;
    if (crowned.current !== ctl.king) {
      crowned.current = ctl.king;
      Object.assign(folk[0], dressUp(PLAYER, ctl.king ? KING : {}));
      slotFolk[0] = -1;
    }

    // Everyone past the horizon is hidden by the planet, so only the people who could be seen get an instance
    // slot, packed from 0 so the draw stops at `count`. The player is folk 0 and always slot 0.
    const dist = camera.position.length();
    const horizon = Math.cos(Math.acos(Math.min(1, R / dist)) + Math.acos(R / (R + TALL_AS)));
    toCam.copy(camera.position).divideScalar(dist);
    let slots = 0;
    used.clear();
    for (let i = 0; i < N; i++) {
      const f = folk[i];
      let fresh = false;
      if (f.kind === "visitor" && f.fresh && f.shown) {
        Object.assign(f, dressUp(lookOf(f.look), f.king ? KING : {}));
        fresh = true;
        // a slot they held before going past the horizon still wears the old look
        const was = slotFolk.indexOf(i);
        if (was >= 0) slotFolk[was] = -1;
      }
      if ((f.kind === "villager" || f.kind === "visitor") && !f.shown) continue;
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
      } else if (f.kind === "keeper") turn = stepKeeper(f, dt, ctl.player.n, reduced?.matches ? 0 : 1);
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
      // falling villagers are up in the sky, clear of the horizon
      const falling = f.kind === "villager" && f.alt > 0;
      if (i > 0 && !falling && f.n.dot(toCam) < horizon) continue;
      const slot = slots++;
      if (fresh || slotFolk[slot] !== i) {
        dress(slot, f);
        slotFolk[slot] = i;
      }
      const g = poseFor(f);
      const step = pose(f, g, i, lift);

      const flail = f.kind === "player" ? drop.flail : f.kind === "villager" && f.alt > 0 ? 1 : 0;
      limbs(base, torso, g, step, f.amp, flail, drop.t * 26 + i, rig);
      for (let k = 0; k < NUBS; k++) nub.setMatrixAt(slot * NUBS + k, rig[k]);
      const nod = skull(torso, f.head, g.headYaw, headM);
      head.setMatrixAt(slot, nod);
      body.setMatrixAt(slot, torso);
      for (const k of kit[slot]) {
        const bone = WEAR[k].bone;
        meshes[k]?.setMatrixAt(slot, bone === "head" ? nod : bone === "hand" ? rig[6] : torso);
        used.add(k);
      }

      // shadows stay on the floor and tighten as the player comes down to meet them; a body lying down hides its own
      if (lift !== floor || g.lie) {
        frameAt(f.n, f.heading, base, floor, SCALE);
        size(f);
      }
      // under water there's no shadow to cast, only the swimmer's own ripple
      const dry = f.kind === "player" ? +!self.wet : f.kind === "visitor" ? +!swimming(f.n) : 1;
      const shade = 1.15 * (1 - Math.min(0.45, (lift - floor) * 0.13)) * (1 - g.lie) * dry;
      local.compose(v.set(0, 0.02, 0), q.identity(), s.set(shade, 1, shade));
      blob.setMatrixAt(slot, local.premultiply(base));
      if (f.kind === "player" && halo.current) {
        halo.current.visible = ctl.intro === "ground";
        frameAt(f.n, f.heading, halo.current.matrix, (depthAt(f.n) > 0 ? Math.max(self.ground, SEA_LEVEL) : self.ground) + 0.04);
      }
    }

    // the bubble rides over its keeper's head while they stroll
    if (bubble.current && near) {
      const k = keepers[near];
      bubble.current.position.copy(k.n).multiplyScalar(R + 1.15);
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

    for (const k of KINDS) if (meshes[k]) meshes[k].visible = used.has(k);
    for (const [k, mesh] of Object.entries(meshes)) {
      if (!mesh) continue;
      mesh.count = k === "nub" ? slots * NUBS : slots;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const keeperHead = near && LANDMARKS[near].keeper.clone().multiplyScalar(R + 1.15);

  return (
    <>
      {LAYERS.map(([k, mat, count]) => (
        <instancedMesh
          key={k}
          ref={bind[k]}
          args={[k === "blob" ? BLOB : baked[k], mat, count]}
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
        <group key={near} ref={bubble} position={keeperHead}>
          <Html center zIndexRange={[14, 0]}>
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
        </group>
      )}
    </>
  );
}
