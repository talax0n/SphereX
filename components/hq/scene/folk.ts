import {
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { MAX_AGENTS } from "@/data/pulse";
import { type Emote, ROOM_CAP } from "@/data/room";
import { STATIONS, type StationId } from "@/data/stations";
import { ACCENT, TONE, ball, cone, cyl, gable, merge, paint, part, pill, ring, rod, slab, type Part, type Vec3 } from "./clay";
import { IDENTITY } from "./dioramas";
import { IDLES, type Gesture, type Pose, blankPose, chasePose, onceOf, poseOf } from "./gesture";
import { rng, scatter } from "./props";
import { LANDMARKS, NORTH_POLE, OBSTACLES, R, arc, blocked, flatten, plinthAt, plinthLift, resolve, standLift, steer, swimming, toward, walk } from "./planet";

/** one villager slot per agent the pulse can carry; a slot only shows while an agent holds it */
export const VILLAGERS = MAX_AGENTS;
/** one slot per other visitor a room can hold; you are the 24th */
export const VISITORS = ROOM_CAP - 1;

/**
 * Character space: feet on y=0, facing +Z, about one unit tall before `SCALE`.
 * Every part is baked at its rest pose, so a part's instance matrix is just the pose of the
 * bone it hangs from (torso, head or right hand) and no per-part offsets live in the frame loop.
 */
export const SCALE = 0.78;
export const HEAD_Y = 0.7;
const HEAD_R = 0.33;
const HEAD_SQUASH = 0.9;
/** the body ellipsoid's centre height and radii */
const BODY_Y = 0.3;
const BODY: Vec3 = [0.2, 0.22, 0.18];

const ell = (seg: [number, number]) => new SphereGeometry(1, ...seg);

/** Point on the head surface at (x, y) on its front, plus the outward normal there. */
function onHead(x: number, y: number): [Vector3, Vector3] {
  const dy = (y - HEAD_Y) / HEAD_SQUASH;
  const z = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - dy * dy));
  const p = new Vector3(x, y, z);
  const nrm = new Vector3(x, dy / HEAD_SQUASH, z).normalize();
  return [p, nrm];
}

/** Lays a geometry modelled with its thin axis along z onto the head front at (x, y), `off` clear of the surface. */
function fit(geo: BufferGeometry, x: number, y: number, off: number, tone?: string): Part {
  const [p, nrm] = onHead(x, y);
  p.addScaledVector(nrm, off);
  const m = new Matrix4().lookAt(nrm, new Vector3(), new Vector3(0, 1, 0));
  return part(geo.clone().applyMatrix4(m).translate(p.x, p.y, p.z), [0, 0, 0], { tone });
}

/** z of the body's front at (x, y), plus `off`. */
function onBody(x: number, y: number, off = 0) {
  const k = 1 - (x / BODY[0]) ** 2 - ((y - BODY_Y) / BODY[1]) ** 2;
  return BODY[2] * Math.sqrt(Math.max(0, k)) + off;
}

/** A flattened dot lying on the head. */
const dot = (x: number, y: number, r: [number, number, number], tone: string, off = 0) => fit(ell([6, 4]).scale(...r), x, y, off, tone);
/** A curved stroke on the head: an arc of `span` turns centred on angle `mid` (0 is +x, π/2 up). */
const stroke = (x: number, y: number, r: number, span: number, mid: number, tone: string, w = 0.011) =>
  fit(new TorusGeometry(r, w, 3, 8, Math.PI * span).rotateZ(mid - (Math.PI * span) / 2).scale(1, 1, 0.5), x, y, 0.004, tone);

const GOLD = "#f2c14e";
const INK = "#1c1c1e";
const BROW = "#3a2c26";
const BLUSH = "#f3b9b1";

export const PARTS = {
  // the nose is part of the head so it takes the skin tint
  head: () => merge([
    part(ell([14, 10]), [0, HEAD_Y, 0], { scale: [HEAD_R, HEAD_R * HEAD_SQUASH, HEAD_R] }),
    part(ell([6, 5]), onHead(0, 0.655)[0].toArray(), { scale: [0.04, 0.032, 0.03] }),
  ]),
  // buttons, so a shirt in a skin-like colour still reads as a shirt
  body: () => merge([
    part(ell([12, 8]), [0, BODY_Y, 0], { scale: BODY }),
    ...[0.38, 0.33, 0.28].map((y) => part(ball(0.012, 6, 4), [0, y, onBody(0, y, 0.002)], { tone: "#c4c4c4" })),
  ]),
  /** feet, sleeves and hands: a unit nub scaled per instance */
  nub: () => paint(ell([5, 4]), "#ffffff"),
} satisfies Record<string, () => BufferGeometry>;

/** the soft shadow under each character */
export const BLOB = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** A cap of the head sphere from the crown down to `cut` of a half turn, `r` out from its centre. */
const dome = (r: number, cut: number, up = 0.02) =>
  part(new SphereGeometry(r, 14, 5, 0, Math.PI * 2, 0, Math.PI * cut), [0, HEAD_Y + up, 0], { scale: [1, HEAD_SQUASH, 1] });

/** Hair hugs the skull a hair closer than any hat, so a hat always sits over it. */
const HAIR_R = HEAD_R + 0.008;
/** A patch of hair from `phi` round `span` half turns (0 is -x, 0.5 the face, 1.5 the back), crown down to `theta`. */
const lock = (phi: number, span: number, theta: number, r = HAIR_R) =>
  part(new SphereGeometry(r, 14, 8, Math.PI * phi, Math.PI * span, 0, Math.PI * theta), [0, HEAD_Y, 0], { scale: [1, HEAD_SQUASH, 1] });
/** Short hair all round: a crown cap, and the back and sides down to the nape. */
const crop = () => [lock(0, 2, 0.36), lock(0.95, 1.1, 0.62)];
/** A puff of hair sitting on the head at polar angle `theta` (half turns from the crown), azimuth `phi`. */
const puff = (theta: number, phi: number, r: number): Part => {
  const t = Math.PI * theta;
  const p = Math.PI * phi;
  const d = HEAD_R - r * 0.35;
  return part(ball(r, 7, 5), [-Math.cos(p) * Math.sin(t) * d, HEAD_Y + Math.cos(t) * d * HEAD_SQUASH, Math.sin(p) * Math.sin(t) * d]);
};

/** A body shell from polar `t0` for `dt` half turns, `phi`/`span` round like `lock`, `grow` clear of the shirt. */
const shell = (grow: number, t0: number, dt: number, phi = 0, span = 2) =>
  part(new SphereGeometry(1, 14, 8, Math.PI * phi, Math.PI * span, Math.PI * t0, Math.PI * dt), [0, BODY_Y, 0], {
    scale: [BODY[0] + grow, BODY[1] + grow, BODY[2] + grow],
  });

/** A band round the body at height y, flush with the shirt plus `out`. */
const band = (y: number, out: number, h: number, tone?: string) => {
  const k = Math.sqrt(1 - ((y - BODY_Y) / BODY[1]) ** 2);
  return part(new TorusGeometry(1, 0.06, 3, 18).rotateX(Math.PI / 2), [0, y, 0], {
    scale: [BODY[0] * k + out, h / 0.12, BODY[2] * k + out],
    tone,
  });
};

/**
 * A strap over the shoulder at x, from the chest at `front` round to the back at `back`
 * (angles about the x axis: 0 the front, π/2 the top).
 */
const strap = (x: number, front: number, back: number, w: number, tone?: string) => {
  const k = Math.sqrt(1 - (x / BODY[0]) ** 2);
  const geo = new TorusGeometry(1, 0.08, 3, 14, back - front).rotateZ(front).rotateY(-Math.PI / 2);
  return part(geo, [x, BODY_Y, 0], { scale: [w / 0.16, BODY[1] * k + 0.016, BODY[2] * k + 0.016], tone });
};

type Bone = "head" | "torso" | "hand";
type Piece = { bone: Bone; build: () => BufferGeometry };

export const FACES = ["smile", "grin", "oh", "joy"] as const;
export const BOTTOMS = ["trousers", "skirt"] as const;
export const TOPS = ["overalls", "hoodie", "jacket", "stripes"] as const;
export const HATS = ["beanie", "cap", "ears", "crown", "bucket", "tophat", "hardhat", "headphones", "newsboy", "paper"] as const;
export const HAIRS = ["bob", "fringe", "spiky", "bun", "curly", "long", "pigtails"] as const;
export const NECKS = ["scarf", "tie", "bowtie", "medal"] as const;
export const BACKS = ["backpack", "satchel"] as const;
export const EYES = ["glasses", "shades"] as const;
export const PROPS = ["blueprint", "laptop", "briefcase", "wrench", "trophy", "mug", "envelope", "newspaper"] as const;
export type Face = (typeof FACES)[number];
export type Bottom = (typeof BOTTOMS)[number];
export type Top = (typeof TOPS)[number];
export type Hat = (typeof HATS)[number];
export type Hair = (typeof HAIRS)[number];
export type Neck = (typeof NECKS)[number];
export type Back = (typeof BACKS)[number];
export type Eyes = (typeof EYES)[number];
export type Prop = (typeof PROPS)[number];

const EYE_X = 0.115;
const EYE_Y = 0.71;
/** Open eyes with a catch-light, so they look alive rather than like buttons. */
const eyes = () =>
  [-1, 1].flatMap((s) => [
    dot(s * EYE_X, EYE_Y, [0.036, 0.048, 0.02], INK),
    dot(s * EYE_X + 0.012, EYE_Y + 0.016, [0.012, 0.014, 0.006], "#ffffff", 0.016),
  ]);
const brows = (lift = 0) => [-1, 1].map((s) => stroke(s * EYE_X, 0.738 + lift, 0.045, 0.28, Math.PI / 2, BROW, 0.009));
const blush = () => [-1, 1].map((s) => dot(s * 0.2, 0.635, [0.055, 0.03, 0.012], BLUSH));

/** Hanging items are drawn upright, then turned against the right arm's rest raise so they hang straight at rest. */
const HANG = blankPose().armR;
const held = (parts: Part[]) => merge(parts).scale(1.3, 1.3, 1.3).rotateZ(HANG);

/**
 * Everything a character can put on, baked at rest pose. White parts take the instance colour;
 * parts with tones of their own (faces, crown gold, lenses, props) are tinted with `PLAIN`.
 */
export const WEAR = {
  smile: { bone: "head", build: () => merge([...eyes(), ...brows(), ...blush(), stroke(0, 0.635, 0.05, 0.6, -Math.PI / 2, INK)]) },
  grin: {
    bone: "head",
    build: () => merge([
      ...eyes(),
      ...brows(0.01),
      ...blush(),
      fit(new CircleGeometry(0.06, 10, Math.PI, Math.PI).scale(1, 0.85, 1), 0, 0.615, 0.006, "#6b2f35"),
      fit(new CircleGeometry(0.03, 8, Math.PI, Math.PI).scale(1, 0.7, 1), 0, 0.582, 0.009, "#ef8a8f"),
    ]),
  },
  oh: {
    bone: "head",
    build: () => merge([...eyes(), ...brows(0.025), ...blush(), dot(0, 0.595, [0.026, 0.032, 0.012], "#6b2f35", 0.002)]),
  },
  /** eyes shut in a happy squint */
  joy: {
    bone: "head",
    build: () => merge([
      ...[-1, 1].map((s) => stroke(s * EYE_X, EYE_Y - 0.012, 0.034, 0.75, Math.PI / 2, INK, 0.012)),
      ...brows(0.01),
      ...blush(),
      fit(new CircleGeometry(0.05, 10, Math.PI, Math.PI).scale(1, 0.8, 1), 0, 0.62, 0.006, "#6b2f35"),
    ]),
  },

  trousers: {
    bone: "torso",
    // the seam down the middle splits them into two legs
    build: () => merge([shell(0.006, 0.55, 0.45), band(0.258, 0.01, 0.022, "#7c7c7c"), strap(0, 0.19 - Math.PI, -0.19, 0.012, "#a0a0a0")]),
  },
  skirt: {
    bone: "torso",
    build: () => merge([
      part(new CylinderGeometry(0.2, 0.25, 0.14, 14, 1, true), [0, 0.2, 0], { scale: [1, 1, 0.92] }),
      band(0.265, 0.008, 0.024),
    ]),
  },

  overalls: {
    bone: "torso",
    build: () => merge([
      shell(0.012, 0.55, 0.45),
      // the bib, up the chest from the waist
      shell(0.012, 0.33, 0.24, 0.33, 0.34),
      strap(-0.085, 0.95, 2.8, 0.035),
      strap(0.085, 0.95, 2.8, 0.035),
      ...[-1, 1].map((s) => part(ball(0.014, 6, 4), [s * 0.075, 0.395, onBody(0.075, 0.395, 0.014)], { tone: "#8a8a8a" })),
    ]),
  },
  hoodie: {
    bone: "torso",
    build: () => merge([
      shell(0.01, 0, 0.6),
      // the hood bunched behind the neck
      part(ell([10, 6]), [0, 0.42, -0.13], { scale: [0.19, 0.09, 0.11], rot: [-0.5, 0, 0] }),
      part(ell([8, 5]), [0, 0.255, onBody(0, 0.255, 0.004)], { scale: [0.11, 0.05, 0.02], tone: "#e4e4e4" }),
      ...[-1, 1].map((s) => part(rod(0.007, 0.08, 4), [s * 0.04, 0.39, onBody(0.04, 0.39, 0.014)], { tone: "#f4f4f4", rot: [0.4, 0, 0] })),
    ]),
  },
  /** open down the front, so the shirt shows */
  jacket: {
    bone: "torso",
    build: () => merge([shell(0.012, 0, 0.62, 0.64, 1.72)]),
  },
  stripes: { bone: "torso", build: () => merge([0.31, 0.36, 0.41, 0.46].map((y) => band(y, 0.003, 0.026))) },

  beanie: {
    bone: "head",
    build: () => merge([
      dome(HEAD_R + 0.02, 0.36),
      part(ring(0.29, 0.045, 5, 14), [0, HEAD_Y + 0.17, 0], { rot: [Math.PI / 2, 0, 0] }),
      part(ball(0.075, 7, 5), [0, HEAD_Y + 0.33, 0]),
    ]),
  },
  cap: {
    bone: "head",
    build: () => merge([
      dome(HEAD_R + 0.015, 0.32),
      part(cyl(0.17, 0.17, 0.025), [0, HEAD_Y + 0.17, 0.27], { rot: [0.25, 0, 0], scale: [1, 1, 0.75] }),
    ]),
  },
  ears: {
    bone: "head",
    build: () => merge([
      part(pill(0.065, 0.2, 3, 8), [-0.12, HEAD_Y + 0.38, 0], { rot: [0, 0, 0.22] }),
      part(pill(0.065, 0.2, 3, 8), [0.12, HEAD_Y + 0.38, 0], { rot: [0, 0, -0.22] }),
      part(pill(0.032, 0.14, 2, 6), [-0.125, HEAD_Y + 0.38, 0.045], { rot: [0, 0, 0.22], tone: "#f3c4c4" }),
      part(pill(0.032, 0.14, 2, 6), [0.125, HEAD_Y + 0.38, 0.045], { rot: [0, 0, -0.22], tone: "#f3c4c4" }),
    ]),
  },
  /** the site owner's */
  crown: {
    bone: "head",
    build: () => merge([
      part(cyl(0.235, 0.215, 0.11), [0, HEAD_Y + 0.24, 0], { tone: GOLD }),
      ...Array.from({ length: 5 }, (_, k) => {
        const a = (k / 5) * Math.PI * 2;
        const at: Vec3 = [Math.sin(a) * 0.2, HEAD_Y + 0.35, Math.cos(a) * 0.2];
        return [
          part(cone(0.06, 0.14), at, { tone: GOLD }),
          part(ball(0.032, 7, 5), [at[0], at[1] + 0.08, at[2]], { tone: GOLD }),
        ];
      }).flat(),
      part(ball(0.04, 8, 6), [0, HEAD_Y + 0.24, 0.235], { tone: "#e0475b", scale: [1, 1, 0.6] }),
      part(ball(0.03, 8, 6), [-0.15, HEAD_Y + 0.24, 0.18], { tone: "#4f8fe0", scale: [1, 1, 0.6] }),
      part(ball(0.03, 8, 6), [0.15, HEAD_Y + 0.24, 0.18], { tone: "#4f8fe0", scale: [1, 1, 0.6] }),
    ]),
  },
  // brims stay above the eyes: from the camera's height a low one would hide them
  bucket: {
    bone: "head",
    build: () => merge([part(cyl(0.25, 0.31, 0.17), [0, HEAD_Y + 0.22, 0]), part(cyl(0.31, 0.39, 0.03), [0, HEAD_Y + 0.15, 0])]),
  },
  tophat: {
    bone: "head",
    build: () => merge([
      part(cyl(0.2, 0.2, 0.32), [0, HEAD_Y + 0.36, 0]),
      part(cyl(0.205, 0.205, 0.06), [0, HEAD_Y + 0.25, 0], { tone: "#b5b5b5" }),
      part(cyl(0.33, 0.33, 0.03), [0, HEAD_Y + 0.2, 0]),
    ]),
  },
  hardhat: {
    bone: "head",
    build: () => merge([
      dome(HEAD_R + 0.025, 0.4),
      part(pill(0.035, 0.3, 3, 6), [0, HEAD_Y + 0.34, 0], { rot: [Math.PI / 2, 0, 0], tone: "#e8e8e8" }),
      part(cyl(0.2, 0.2, 0.025), [0, HEAD_Y + 0.16, 0.27], { rot: [0.25, 0, 0], scale: [1, 1, 0.8] }),
    ]),
  },
  headphones: {
    bone: "head",
    build: () => merge([
      part(new TorusGeometry(0.35, 0.022, 5, 14, Math.PI), [0, HEAD_Y, 0], { scale: [1, 0.93, 1] }),
      part(cyl(0.1, 0.1, 0.07), [-0.365, HEAD_Y, 0], { rot: [0, 0, Math.PI / 2] }),
      part(cyl(0.1, 0.1, 0.07), [0.365, HEAD_Y, 0], { rot: [0, 0, Math.PI / 2] }),
    ]),
  },
  newsboy: {
    bone: "head",
    build: () => merge([
      dome(HEAD_R + 0.02, 0.38),
      part(ball(0.3, 10, 6), [0, HEAD_Y + 0.2, -0.02], { scale: [1.05, 0.38, 1.05] }),
      part(cyl(0.15, 0.15, 0.025), [0, HEAD_Y + 0.16, 0.28], { rot: [0.3, 0, 0], scale: [1, 1, 0.7] }),
    ]),
  },
  /** a folded newspaper boat */
  paper: {
    bone: "head",
    build: () => merge([dome(HEAD_R + 0.02, 0.34), part(gable(0.5, 0.17, 0.1), [0, HEAD_Y + 0.22, 0])]),
  },

  // low hair (bob, fringe, long, pigtails) peeks out under any hat; tall hair is only worn bare-headed
  bob: { bone: "head", build: () => merge([lock(0.88, 1.24, 0.72), lock(0, 2, 0.36)]) },
  fringe: { bone: "head", build: () => merge([...crop(), lock(0.12, 0.76, 0.38, HAIR_R + 0.004)]) },
  spiky: {
    bone: "head",
    build: () => merge([
      ...crop(),
      ...[
        [0, 0, 0.22],
        [-0.09, 0.03, 0.18],
        [0.09, 0.03, 0.18],
        [-0.05, -0.08, 0.17],
        [0.05, -0.08, 0.17],
        [0, 0.1, 0.16],
      ].map(([x, z, h]) => part(cone(0.06, h), [x, HEAD_Y + 0.27 + h / 2 - 0.02, z], { rot: [z * 4, 0, -x * 5] })),
    ]),
  },
  bun: { bone: "head", build: () => merge([...crop(), part(ball(0.12, 10, 7), [0, HEAD_Y + 0.36, -0.06])]) },
  curly: {
    bone: "head",
    build: () => merge([
      ...crop(),
      puff(0, 0, 0.1),
      ...[0, 0.4, 0.8, 1.2, 1.6].map((p) => puff(0.2, p + 0.1, 0.09)),
      ...[0.9, 1.2, 1.5, 1.8, 2.1].map((p) => puff(0.4, p, 0.085)),
      ...[1.1, 1.5, 1.9].map((p) => puff(0.58, p, 0.08)),
    ]),
  },
  long: {
    bone: "head",
    build: () => merge([
      lock(0.88, 1.24, 0.72),
      lock(0, 2, 0.36),
      // down the back past the shoulders
      part(ell([10, 7]), [0, 0.47, -0.2], { scale: [0.25, 0.2, 0.12] }),
    ]),
  },
  pigtails: {
    bone: "head",
    build: () => merge([
      ...crop(),
      ...[-1, 1].flatMap((s) => [
        part(ball(0.035, 6, 4), [s * 0.3, HEAD_Y + 0.02, -0.08], { tone: "#e0475b" }),
        part(ell([8, 6]), [s * 0.38, HEAD_Y - 0.08, -0.09], { scale: [0.08, 0.13, 0.08], rot: [0, 0, s * 0.35] }),
      ]),
    ]),
  },

  scarf: {
    bone: "torso",
    build: () => merge([
      part(ring(0.165, 0.042, 5, 12), [0, 0.425, 0], { rot: [Math.PI / 2, 0, 0], scale: [1, 0.92, 1] }),
      part(pill(0.035, 0.12, 2, 6), [0.08, 0.31, onBody(0.08, 0.31, 0.022)], { rot: [-0.1, 0, 0] }),
    ]),
  },
  tie: {
    bone: "torso",
    build: () => merge([
      part(ball(0.03, 6, 5), [0, 0.39, onBody(0, 0.39, 0.012)], { scale: [1, 1, 0.6] }),
      part(cone(0.042, 0.16), [0, 0.3, onBody(0, 0.3, 0.016)], { rot: [0, 0, Math.PI], scale: [1, 1, 0.3] }),
    ]),
  },
  bowtie: {
    bone: "torso",
    build: () => merge([
      part(cone(0.05, 0.1), [-0.06, 0.42, onBody(0.06, 0.42, 0.016)], { rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.45] }),
      part(cone(0.05, 0.1), [0.06, 0.42, onBody(0.06, 0.42, 0.016)], { rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.45] }),
      part(ball(0.024, 6, 5), [0, 0.42, onBody(0, 0.42, 0.02)], { scale: [1, 1, 0.7] }),
    ]),
  },
  medal: {
    bone: "torso",
    build: () => merge([
      part(cyl(0.05, 0.05, 0.015), [0, 0.27, onBody(0, 0.27, 0.022)], { rot: [Math.PI / 2, 0, 0], tone: GOLD }),
      part(slab(0.04, 0.1, 0.01), [0, 0.35, onBody(0, 0.35, 0.016)], { rot: [-0.25, 0, 0], tone: "#e0475b" }),
    ]),
  },

  backpack: {
    bone: "torso",
    build: () => merge([
      part(ell([8, 6]), [0, 0.3, -0.22], { scale: [0.16, 0.17, 0.09] }),
      part(ell([8, 6]), [0, 0.22, -0.295], { scale: [0.1, 0.065, 0.045], tone: "#dedede" }),
      strap(-0.1, -0.3, 2.6, 0.035, "#d6d6d6"),
      strap(0.1, -0.3, 2.6, 0.035, "#d6d6d6"),
    ]),
  },
  satchel: {
    bone: "torso",
    build: () => merge([
      part(new TorusGeometry(0.215, 0.011, 4, 16).scale(1, 0.9, 1).rotateX(Math.PI / 2).rotateZ(-0.7), [0, 0.3, 0], { tone: "#d6d6d6" }),
      part(ell([8, 6]), [0.14, 0.16, 0.13], { scale: [0.085, 0.075, 0.035], rot: [0, 0.6, 0] }),
    ]),
  },

  glasses: {
    bone: "head",
    build: () => merge([
      ...[-1, 1].map((s) => fit(ring(0.068, 0.011, 4, 12), s * EYE_X, EYE_Y, 0.03)),
      fit(slab(0.05, 0.012, 0.012), 0, EYE_Y + 0.01, 0.034),
      ...temples(),
    ]),
  },
  shades: {
    bone: "head",
    build: () => merge([
      ...[-1, 1].map((s) => fit(ell([8, 5]).scale(0.08, 0.06, 0.012), s * EYE_X, EYE_Y, 0.03, "#2d3038")),
      fit(slab(0.05, 0.014, 0.012), 0, EYE_Y + 0.01, 0.034, "#2d3038"),
      ...temples("#2d3038"),
    ]),
  },

  blueprint: {
    bone: "hand",
    build: () => held([
      part(cyl(0.045, 0.045, 0.3), [0, 0, 0.03], { rot: [0, 0, 1.1], tone: "#6f9ee0" }),
      ...[-1, 1].map((s) => part(cyl(0.046, 0.046, 0.014), [-s * 0.134, s * 0.068, 0.03], { rot: [0, 0, 1.1], tone: "#fbfaf7" })),
    ]),
  },
  laptop: {
    bone: "hand",
    build: () => held([
      part(slab(0.22, 0.16, 0.025), [0, -0.05, 0.03], { rot: [0, -0.5, 0], tone: "#c9ccd2" }),
      part(ball(0.018, 6, 4), [0.01, -0.05, 0.05], { scale: [1, 1, 0.3], tone: "#fbfaf7" }),
    ]),
  },
  briefcase: {
    bone: "hand",
    build: () => held([
      part(slab(0.2, 0.14, 0.07), [0, -0.1, 0], { rot: [0, -0.5, 0], tone: "#8a5a3c" }),
      part(new TorusGeometry(0.03, 0.01, 3, 8, Math.PI), [0, -0.028, 0], { rot: [0, -0.5, 0], tone: "#5e3c28" }),
      part(slab(0.02, 0.02, 0.075), [0, -0.05, 0], { rot: [0, -0.5, 0], tone: GOLD }),
    ]),
  },
  wrench: {
    bone: "hand",
    build: () => held([
      part(slab(0.032, 0.22, 0.02), [0, -0.06, 0.02], { tone: "#9aa3ad" }),
      // open jaw up, so it reads as a wrench and not a hook
      part(new TorusGeometry(0.045, 0.018, 3, 10, Math.PI * 1.4), [0, 0.09, 0.02], { rot: [0, 0, -Math.PI * 0.2], tone: "#9aa3ad" }),
      part(new TorusGeometry(0.03, 0.014, 3, 10), [0, -0.19, 0.02], { tone: "#9aa3ad" }),
    ]),
  },
  trophy: {
    bone: "hand",
    build: () => held([
      part(cyl(0.012, 0.012, 0.09), [0, 0.02, 0.04], { tone: GOLD }),
      part(cyl(0.075, 0.03, 0.1), [0, 0.11, 0.04], { tone: GOLD }),
      ...[-1, 1].map((s) => part(new TorusGeometry(0.03, 0.009, 3, 8), [s * 0.075, 0.115, 0.04], { tone: GOLD })),
      part(slab(0.08, 0.035, 0.06), [0, -0.035, 0.04], { tone: "#7a5640" }),
    ]),
  },
  mug: {
    bone: "hand",
    build: () => held([
      part(cyl(0.06, 0.054, 0.12), [0, 0.01, 0.07], { tone: "#fbfaf7" }),
      part(cyl(0.052, 0.052, 0.005), [0, 0.068, 0.07], { tone: "#6b4a36" }),
      part(new TorusGeometry(0.032, 0.011, 3, 8), [0, 0.01, 0.012], { rot: [0, Math.PI / 2, 0], tone: "#fbfaf7" }),
    ]),
  },
  envelope: {
    bone: "hand",
    build: () => held([
      part(slab(0.18, 0.12, 0.012), [0, -0.04, 0.03], { tone: "#f6ecd6" }),
      ...[-1, 1].map((s) => part(slab(0.105, 0.008, 0.004), [s * 0.043, -0.012, 0.037], { rot: [0, 0, s * 0.6], tone: "#d9c9a6" })),
      part(ball(0.017, 6, 4), [0, -0.04, 0.038], { scale: [1, 1, 0.3], tone: "#e0475b" }),
    ]),
  },
  newspaper: {
    bone: "hand",
    build: () => held([
      part(slab(0.14, 0.2, 0.02), [0, -0.07, 0.03], { tone: "#ecebe6" }),
      part(slab(0.11, 0.03, 0.004), [0, 0.0, 0.041], { tone: "#3b4250" }),
      ...[0.04, 0.07, 0.1, 0.13].map((d) => part(slab(0.11, 0.008, 0.004), [0, -d, 0.041], { tone: "#a6a6a6" })),
    ]),
  },
} satisfies Record<Face | Bottom | Top | Hat | Hair | Neck | Back | Eyes | Prop, Piece>;

/** Glasses arms: along the head's sides from the outer rims back to the ears, clear of the skin. */
function temples(tone?: string): Part[] {
  return [-1, 1].map((s) => {
    const geo = new TorusGeometry(HEAD_R + 0.01, 0.008, 3, 8, 1.15).rotateZ(s > 0 ? -0.15 : Math.PI - 1);
    return part(geo.rotateX(Math.PI / 2), [0, EYE_Y + 0.01, 0], { tone });
  });
}

export type Wear = keyof typeof WEAR;

/** Instance tint that leaves a part's baked vertex colours untouched (faces, props). */
export const PLAIN = new Color("#ffffff");

const colors = (hex: readonly string[]) => hex.map((c) => new Color(c));
const SKIN = colors(["#f8dcc6", "#f0c6a4", "#e2ad86", "#c98e66", "#a46d4a", "#7c4e34"]);
const CLOTHES = colors(["#f08a7e", "#f6b26b", "#f5d06a", "#8fcf9a", "#7fb8e6", "#b49be0", "#f4a3c0", "#5fc2b8", "#fbfaf7", "#e9dcc4"]);
const TROUSERS = colors(["#5b6c94", "#6d7a94", "#4f5d7a", "#a89074", "#7d6b5d", "#5b6474", "#8a9a7a"]);
const SKIRT = colors(["#f08a7e", "#7fb8e6", "#b49be0", "#f4a3c0", "#5fc2b8", "#f5d06a"]);
const DENIM = colors(["#5b7bb0", "#6d8fc4", "#4f6a99"]);
const HAT = colors(["#f08a7e", "#f5d06a", "#7fb8e6", "#b49be0", "#8fcf9a", "#fbfaf7", "#5b6474"]);
/** Bunny ears keep light shades; their pink lining is multiplied by this tint. */
const EARS = colors(["#fbfaf7", "#fbe3ea", "#f6ecd6", "#e8e1f6"]);
const SHOES = colors(["#8a6f60", "#6d7a94", "#a8765c", "#fbfaf7", "#4a4f5c"]);
const HAIR = colors(["#2b2220", "#4a3224", "#7a5237", "#b98a54", "#d9b97a", "#8a3b2e", "#a8a8a8"]);
const HAIR_PASTEL = colors(["#f4a3c0", "#7fb8e6", "#b49be0", "#8fcf9a"]);
const DARK = colors(["#3b4250", "#5b6474", "#6d5a74"]);
const HARD = colors(["#f5d06a", "#fbfaf7", "#f6b26b"]);
const PAPER = colors(["#fbfaf7", "#ebe8e2"]);
const NECK = colors(["#f08a7e", "#7fb8e6", "#f5d06a", "#8fcf9a", "#fbfaf7", "#b49be0"]);
const TIE = colors(["#c9606b", "#6d7a94", "#5fc2b8", "#f6b26b"]);
const BAG = colors(["#a8765c", "#8a6f60", "#6d7a94", "#8fcf9a", "#f6b26b"]);
const FRAME = colors(["#3b4250", "#c9606b", "#f6b26b", "#6d7a94", "#fbfaf7"]);
const KNIT = colors(["#7fb8e6", "#b49be0", "#8fcf9a", "#f08a7e", "#9aa3ad", "#f5d06a"]);
const COAT = colors(["#5b6474", "#a8765c", "#6d7a94", "#8a9a7a", "#e9dcc4"]);

export interface Item<K> {
  kind: K;
  color: Color;
}

/** What a character wears and how they are built; one slot each, so two hats cannot be written down. */
export interface Look {
  skin: Color;
  shirt: Color;
  foot: Color;
  face: Item<Face>;
  bottom: Item<Bottom>;
  top: Item<Top> | null;
  hat: Item<Hat> | null;
  hair: Item<Hair> | null;
  neck: Item<Neck> | null;
  back: Item<Back> | null;
  eyes: Item<Eyes> | null;
  /** held in the right hand */
  prop: Item<Prop> | null;
  /** girth, about 0.82 to 1.2 */
  build: number;
  /** about 0.72 (a kid) to 1.14 */
  height: number;
  /** head size against the body: 1, or more for a kid */
  head: number;
}

/** Every piece in `look`, with its tint. */
export function worn(look: Look): [Wear, Color][] {
  return [look.face, look.bottom, look.top, look.hat, look.hair, look.neck, look.back, look.eyes, look.prop].flatMap((it) =>
    it ? [[it.kind, it.color] as [Wear, Color]] : [],
  );
}

/** Hoodies and jackets have sleeves of their own; otherwise the arms wear the shirt. */
export const sleeve = (look: Look) => (look.top && (look.top.kind === "hoodie" || look.top.kind === "jacket") ? look.top.color : look.shirt);

const item = <K,>(kind: K, color: Color | string): Item<K> => ({ kind, color: typeof color === "string" ? new Color(color) : color });

/** the head scales about the neck, so a kid's bigger head still sits on their shoulders */
const NECK_Y = 0.45;
const SHOULDER = 0.18;
const ONE = new Vector3(1, 1, 1);
const lv = new Vector3();
const ls = new Vector3();
const lq = new Quaternion();
const joint = new Matrix4();
const wrist = new Matrix4();
const armQ = new Quaternion();
const upright = new Quaternion();
const relQ = new Quaternion();
const lm = new Matrix4();
// arms pitch before they raise, so a positive pitch always swings the hand forward, hanging or overhead
const armEul = new Euler(0, 0, 0, "ZYX");

/** The head bone: `torso` with the head turned by `yaw` and scaled by `head`, both about the neck. */
export function skull(torso: Matrix4, head: number, yaw: number, out: Matrix4): Matrix4 {
  if (head === 1 && !yaw) return out.copy(torso);
  lm.makeTranslation(0, NECK_Y, 0).multiply(joint.makeRotationY(yaw)).scale(lv.setScalar(head));
  return out.multiplyMatrices(torso, lm).multiply(joint.makeTranslation(0, -NECK_Y, 0));
}

/** How many matrices `limbs` writes. */
export const RIG = 7;

/**
 * Feet, sleeves and hands at pose `g`, mid-stride at `step` with waddle `amp`: feet hang off the ground
 * frame `base`, arms off `torso`. `flail` (0..1) throws the arms up, waving on the clock `wave`.
 * Writes [right foot, left foot, right sleeve, left sleeve, right hand, left hand, right hand bone].
 */
export function limbs(base: Matrix4, torso: Matrix4, g: Pose, step: number, amp: number, flail: number, wave: number, out: Matrix4[]) {
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1;
    const swing = step * side * amp;
    // feet hang off the ground frame, not the torso, so the waddle never lifts them through the floor
    const tap = k ? g.tap * 0.1 : 0;
    out[k]
      .compose(lv.set(side * 0.1, 0.06 + Math.max(0, swing) * 0.06 + tap, 0.03 + swing * 0.1 + tap * 0.4), lq.identity(), ls.set(0.09, 0.065, 0.125))
      .premultiply(base);
    // gestures lead with the right arm (k 0), the side away from the intro bubble
    let raise = k ? g.armL : g.armR;
    const fwd = swing * 0.6 * g.swing + (k ? g.fwdL : g.fwdR);
    let grow = g.grow;
    if (flail) {
      raise += (2.3 + Math.sin(wave + k * 2) * 0.35 - raise) * flail;
      grow = Math.max(grow, flail);
    }
    // a raised arm steps out from the shoulder and grows, so the hand clears the head and reads at close range
    joint.compose(lv.set(side * (SHOULDER + 0.06 * grow), 0.42, 0), armQ.setFromEuler(armEul.set(-fwd, 0, side * raise)), ONE).premultiply(torso);
    out[2 + k].compose(lv.set(0, -0.08 - 0.07 * grow, 0), lq.identity(), ls.set(0.065 + 0.02 * grow, 0.1 + 0.07 * grow, 0.07 + 0.02 * grow)).premultiply(joint);
    const hand = lm.makeTranslation(0, -0.2 - 0.14 * grow, 0).premultiply(joint);
    if (!k) {
      out[6].copy(hand);
      if (g.level) {
        // the wrist counter-turns the item toward upright, as it hangs at rest
        upright.setFromEuler(armEul.set(0, 0, -HANG)).slerp(armQ, 1 - g.level);
        out[6].multiply(wrist.makeRotationFromQuaternion(relQ.copy(armQ).invert().multiply(upright)));
      }
    }
    out[4 + k].copy(hand).scale(ls.set(0.05, 0.055, 0.05).multiplyScalar(1 + 0.2 * grow));
  }
}

interface Body extends Look {
  n: Vector3;
  heading: Vector3;
  /** walk speed now, in surface units per second */
  speed: number;
  phase: number;
  /** waddle amplitude, eased toward 0 at rest and 1 at full walk */
  amp: number;
  /** squash spring for start/stop */
  sq: number;
  sqv: number;
  /** signed turn rate, for leaning into turns */
  lean: number;
  /** seconds since the last greeting hop started; Infinity when idle */
  hop: number;
}

export type Folk = Body &
  (
    | { kind: "player" }
    | {
        kind: "villager";
        id: number;
        want: number;
        turn: number;
        timer: number;
        goal: Vector3 | null;
        /** centre of the landmark this villager may walk onto, while it heads to or from a spot there */
        skip: Vector3 | null;
        /** the spot it has settled into and holds: a desk, a gym machine, a bed */
        pin: Post | null;
        /** feet above the ground: a plinth top, a stool, a mattress */
        lift: number;
        /** the work loop's pose, chased toward the pin's move each frame */
        pose: Pose;
        clock: number;
        /** false while no agent holds this slot: nothing drawn, nothing to bump into */
        shown: boolean;
        /** height above the ground while it drops in from the sky, and its vertical speed */
        alt: number;
        vy: number;
      }
    | {
        kind: "keeper";
        station: StationId;
        post: Vector3;
        rest: Vector3;
        duty: Duty;
        gest: Gesture;
        clock: number;
        /** seconds left in this duty */
        timer: number;
        /** where a stroll is headed; `post` itself while heading home */
        goal: Vector3 | null;
        pose: Pose;
        /** has waved at the player during this approach */
        met: boolean;
        /** a prop that was planted on the post before the keeper arrived, which they stand through rather than get pushed off by */
        skip: Vector3 | null;
        /** its own seeded stream, so keepers never fall into step */
        rand: () => number;
      }
    | {
        /** another person on the site; the network writes `peer`..`emote`, the crowd glides toward them */
        kind: "visitor";
        slot: number;
        peer: string | null;
        look: number;
        /** where the last update put them, and the way they face */
        to: Vector3;
        facing: Vector3;
        /** just arrived, or just re-seated: snap to `to` and re-dress from `look` */
        fresh: boolean;
        emote: Emote | null;
        gest: Gesture;
        clock: number;
        pose: Pose;
        lift: number;
        shown: boolean;
        /** the room crowned them as the site owner */
        king: boolean;
      }
  );

/** What a keeper is up to: working their prop, a short walk round the post, an idle fidget, or waving at the player. */
export type Duty = "chore" | "stroll" | "idle" | "greet";

export type Villager = Extract<Folk, { kind: "villager" }>;
export type Visitor = Extract<Folk, { kind: "visitor" }>;

/** A spot on the planet a villager settles into: where, facing which way, how high, doing what. */
export interface Post {
  n: Vector3;
  heading: Vector3;
  lift: number;
  move: Gesture;
  pace?: number;
}

const rest = (): Omit<Body, "n" | "heading" | keyof Look> => ({
  speed: 0,
  phase: 0,
  amp: 0,
  sq: 0,
  sqv: 0,
  lean: 0,
  hop: Infinity,
});

/** Your own look: the only white outfit on the planet, so "you" reads at a glance in a colourful crowd. */
export const PLAYER: Look = {
  skin: SKIN[1],
  shirt: new Color(TONE.white),
  foot: new Color("#4a5694"),
  face: item("smile", PLAIN),
  bottom: item("trousers", "#5b6c94"),
  top: null,
  hat: item("beanie", ACCENT),
  hair: null,
  neck: null,
  back: null,
  eyes: null,
  prop: null,
  build: 1,
  height: 1,
  head: 1,
};

/** What each keeper wears and holds for their job. Their shirt stays their station's wall colour. */
export const UNIFORM: Record<StationId, Partial<Look> & { prop: Item<Prop> }> = {
  // plans the architecture
  about: { hat: item("hardhat", HARD[0]), eyes: item("glasses", FRAME[0]), prop: item("blueprint", PLAIN) },
  projects: { hat: item("headphones", DARK[1]), back: item("backpack", BAG[2]), prop: item("laptop", PLAIN) },
  experience: {
    neck: item("tie", TIE[0]),
    eyes: item("glasses", FRAME[0]),
    hair: item("bob", HAIR[1]),
    top: item("jacket", DARK[1]),
    prop: item("briefcase", PLAIN),
  },
  skills: { hat: item("beanie", "#f6b26b"), neck: item("scarf", NECK[1]), top: item("overalls", DENIM[0]), prop: item("wrench", PLAIN) },
  awards: { hat: item("tophat", DARK[0]), neck: item("medal", PLAIN), prop: item("trophy", PLAIN) },
  github: { hat: item("cap", IDENTITY.github.top), back: item("satchel", BAG[0]), prop: item("mug", PLAIN) },
  contact: { hat: item("newsboy", "#6d7a94"), back: item("satchel", BAG[1]), prop: item("envelope", PLAIN) },
  // fresh off the press
  updates: { hat: item("paper", PAPER[0]), neck: item("bowtie", TIE[0]), prop: item("newspaper", PLAIN) },
  // keeps the pins and the pens
  guestbook: { hat: item("beanie", IDENTITY.guestbook.top), neck: item("scarf", NECK[0]), prop: item("envelope", PLAIN) },
};

/** The looping job each keeper does with their prop. */
export const CHORE: Record<StationId, Gesture> = {
  about: "study",
  projects: "tinker",
  experience: "check",
  skills: "fix",
  awards: "show",
  github: "sip",
  contact: "sort",
  updates: "read",
  guestbook: "sort",
};

const TALL: readonly Hair[] = ["spiky", "bun", "curly"];

/** `look` with `over` on top; tall hair gives way to a hat, and overalls need trousers under them. */
export function dressUp(look: Look, over: Partial<Look>): Look {
  const out = { ...look, ...over };
  if (out.hat && out.hair && TALL.includes(out.hair.kind)) out.hair = null;
  if (out.top?.kind === "overalls" && out.bottom.kind !== "trousers") out.bottom = item("trousers", out.bottom.color);
  return out;
}

/** Each station's keeper: a seeded grown-up under their uniform, bare of anything it doesn't give them. */
export const keeperLook = (id: StationId, k: number): Look => {
  const base = lookOf(seedOf(1000 + k), false);
  const shirt = new Color(IDENTITY[id].wall);
  // skin close to a peach wall would make the shirt read as bare skin
  const near = Math.hypot(base.skin.r - shirt.r, base.skin.g - shirt.g, base.skin.b - shirt.b) < 0.3;
  const skin = near ? SKIN[(SKIN.indexOf(base.skin) + 3) % SKIN.length] : base.skin;
  return dressUp({ ...base, skin, top: null, hat: null, neck: null, back: null, eyes: null }, { ...UNIFORM[id], shirt });
};

/** A well-spread uint32 for a small index. */
export const seedOf = (i: number) => Math.imul(i + 1, 0x9e3779b1) >>> 0;

/** The player rides on `ctl.player`'s vectors, so the crowd always reads the live pose. */
export function makeCrowd(player: { n: Vector3; heading: Vector3 }): Folk[] {
  const rand = rng(42);
  const folk: Folk[] = [{ kind: "player", ...player, ...rest(), ...PLAYER }];
  STATIONS.forEach((s, k) => {
    const { keeper, keeperFacing } = LANDMARKS[s.id];
    folk.push({
      kind: "keeper",
      station: s.id,
      post: keeper,
      rest: keeperFacing,
      duty: "chore",
      gest: CHORE[s.id],
      clock: 0,
      timer: 0,
      goal: null,
      pose: blankPose(),
      met: false,
      skip: null,
      rand: rng(seedOf(2000 + k)),
      n: keeper.clone(),
      heading: keeperFacing.clone(),
      ...rest(),
      ...keeperLook(s.id, k),
    });
    const me = folk[folk.length - 1];
    if (me.kind === "keeper") {
      me.skip = OBSTACLES.filter((o) => arc(keeper, o.n) < o.r + RADIUS).sort((a, b) => arc(keeper, a.n) - arc(keeper, b.n))[0]?.n ?? null;
      me.clock = me.rand() * 10;
      me.timer = 2 + me.rand() * 8;
    }
  });
  for (let id = 0; id < VILLAGERS; id++) {
    const n = new Vector3();
    do scatter(rand, n);
    while (OBSTACLES.some((o) => arc(n, o.n) < o.r + 0.4) || arc(n, NORTH_POLE) < 2.5);
    folk.push({
      kind: "villager",
      id,
      n,
      heading: toward(n, scatter(rand, new Vector3()), new Vector3()),
      ...rest(),
      want: 0,
      turn: 0,
      timer: rand() * 3,
      goal: null,
      skip: null,
      pin: null,
      lift: 0,
      pose: blankPose(),
      clock: 0,
      shown: false,
      alt: 0,
      vy: 0,
      ...lookOf(seedOf(id)),
    });
  }
  for (let slot = 0; slot < VISITORS; slot++) {
    const n = new Vector3(0, 1, 0);
    folk.push({
      kind: "visitor",
      slot,
      peer: null,
      look: 0,
      to: n.clone(),
      facing: new Vector3(0, 0, 1),
      fresh: false,
      emote: null,
      gest: "rest",
      clock: 0,
      pose: blankPose(),
      lift: 0,
      shown: false,
      king: false,
      n,
      heading: new Vector3(0, 0, 1),
      ...rest(),
      ...lookOf(0),
    });
  }
  return folk;
}

/** Odds for each kind in a slot; what is left over wears nothing. */
type Odds<K> = [K, number][];
const FACE_ODDS: Odds<Face> = [["smile", 0.34], ["grin", 0.22], ["joy", 0.26], ["oh", 0.18]];
const TOP_ODDS: Odds<Top> = [["overalls", 0.07], ["hoodie", 0.1], ["jacket", 0.08], ["stripes", 0.1]];
const HAT_ODDS: Odds<Hat> = [
  ["ears", 0.04],
  ["beanie", 0.08],
  ["cap", 0.07],
  ["bucket", 0.06],
  ["newsboy", 0.04],
  ["headphones", 0.04],
  ["hardhat", 0.02],
  ["tophat", 0.02],
  ["paper", 0.02],
];
const BARE_HAIR: Odds<Hair> = [
  ["bob", 0.15],
  ["fringe", 0.15],
  ["spiky", 0.12],
  ["bun", 0.1],
  ["curly", 0.12],
  ["long", 0.12],
  ["pigtails", 0.1],
];
const HATTED_HAIR: Odds<Hair> = [["bob", 0.25], ["fringe", 0.2], ["long", 0.2], ["pigtails", 0.08]];
const NECK_ODDS: Odds<Neck> = [["scarf", 0.1], ["tie", 0.05], ["bowtie", 0.04], ["medal", 0.03]];
const BACK_ODDS: Odds<Back> = [["backpack", 0.09], ["satchel", 0.08]];
const EYES_ODDS: Odds<Eyes> = [["glasses", 0.1], ["shades", 0.07]];
/** hats and neckwear a kid never wears */
const GROWN: readonly (Hat | Neck)[] = ["tophat", "hardhat", "newsboy", "tie", "bowtie", "medal"];

function roll<K>(odds: Odds<K>, r: number): K | null {
  for (const [k, p] of odds) {
    if (r < p) return k;
    r -= p;
  }
  return null;
}

const HAT_TINT: Partial<Record<Hat, Color[]>> = { ears: EARS, tophat: DARK, hardhat: HARD, paper: PAPER };
const TOP_TINT: Record<Top, Color[]> = { overalls: DENIM, hoodie: KNIT, jacket: COAT, stripes: [PLAIN, ...DARK] };

/** A person's whole look from one uint32 seed, so every browser dresses a visitor alike; `kids` lets it roll a child. */
export function lookOf(seed: number, kids = true): Look {
  const rand = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const wear = <K extends string>(odds: Odds<K>, tints: (k: K) => readonly Color[]): Item<K> | null => {
    const kind = roll(odds, rand());
    return kind && item(kind, pick(tints(kind)));
  };
  const kid = kids && rand() < 0.12;
  const face = item(roll(FACE_ODDS, rand()) ?? "smile", PLAIN);
  const hat = wear(HAT_ODDS, (k) => HAT_TINT[k] ?? HAT);
  const skin = pick(SKIN);
  const shirt = pick(CLOTHES);
  const foot = pick(SHOES);
  const skirt = rand() < 0.3;
  // a skirt in the shirt's colour reads as a dress
  const bottom = skirt ? item("skirt" as const, rand() < 0.35 ? shirt : pick(SKIRT)) : item("trousers" as const, pick(TROUSERS));
  const top = wear(TOP_ODDS, (k) => TOP_TINT[k]);
  const hair = wear(hat ? HATTED_HAIR : BARE_HAIR, () => (rand() < 0.07 ? HAIR_PASTEL : HAIR));
  const neck = wear(NECK_ODDS, (k) => (k === "medal" ? [PLAIN] : k === "scarf" ? NECK : TIE));
  const back = wear(BACK_ODDS, () => BAG);
  const eyes = wear(EYES_ODDS, (k) => (k === "shades" ? [PLAIN] : FRAME));
  const build = kid ? 0.84 + rand() * 0.1 : 0.84 + rand() * 0.36;
  const height = kid ? 0.72 + rand() * 0.08 : 0.88 + rand() * 0.26;
  return dressUp(
    {
      skin,
      shirt,
      foot,
      face,
      bottom,
      top,
      hat: kid && hat && GROWN.includes(hat.kind) ? null : hat,
      hair,
      neck: kid && neck && GROWN.includes(neck.kind) ? null : neck,
      back,
      eyes: kid && eyes?.kind === "glasses" ? null : eyes,
      prop: null,
      build,
      height,
      head: kid ? 1.22 : 1,
    },
    {},
  );
}

/** What the site owner wears over their own look, so everyone sees the same king. */
export const KING: Partial<Look> = {
  hat: item("crown", PLAIN),
  shirt: new Color("#8e6fd8"),
  foot: new Color("#5b4a8a"),
};

export const RADIUS = 0.26;
export const WALK = 1.1;
const SPACE = 0.75;
/** how close to its goal a villager stops, in surface units */
const ARRIVE = 0.6;

const dir = new Vector3();
const push = new Vector3();
const tmp = new Vector3();

/** Random-walk steering: wander, keep a little apart, give the player and props room. A pinned villager just settles. */
export function stepVillager(f: Villager, crowd: Folk[], dt: number, rand: () => number) {
  const pin = f.pin;
  if (pin) settle(f, pin, dt);
  else roam(f, crowd, dt, rand);
  f.lift += ((pin ? pin.lift : plinthLift(f.n)) - f.lift) * Math.min(1, dt * 8);
}

function roam(f: Villager, crowd: Folk[], dt: number, rand: () => number) {
  const goal = f.goal;
  if (goal) {
    toward(f.n, goal, dir);
    // spots on a plinth sit close together, so walk right up to them
    f.want = arc(f.n, goal) > (f.skip ? 0.25 : ARRIVE) ? WALK * 1.3 : 0;
    f.turn = 0;
  } else {
    f.timer -= dt;
    if (f.timer < 0) {
      const stroll = rand() < 0.7;
      f.want = stroll ? WALK * (0.6 + rand() * 0.5) : 0;
      f.turn = (rand() - 0.5) * (stroll ? 1.6 : 0);
      f.timer = 1.5 + rand() * 3.5;
    }
    dir.copy(f.heading).applyAxisAngle(f.n, f.turn * dt);
  }
  push.set(0, 0, 0);
  // all-pairs is fine for ~70 walkers; bucket by cell if the crowd grows into the hundreds
  for (const o of crowd) {
    if (o === f || ((o.kind === "villager" || o.kind === "visitor") && !o.shown)) continue;
    const c = f.n.dot(o.n);
    if (c < Math.cos(SPACE / R)) continue;
    const d = Math.acos(Math.min(1, c)) * R;
    toward(f.n, o.n, tmp).multiplyScalar(-(SPACE - d) / SPACE);
    push.add(o.kind === "player" ? tmp.multiplyScalar(2) : tmp);
  }
  const crowded = push.lengthSq() > 0.04;
  dir.addScaledVector(push, 2.5);
  flatten(dir, f.n);
  const pressed = steer(f.n, dir, RADIUS, goal, f.skip);
  // turning the body is what makes the wander read as walking, not sliding
  f.heading.lerp(dir, Math.min(1, dt * 4));
  flatten(f.heading, f.n);
  const want = crowded && !goal ? Math.max(f.want, WALK * 0.7) : f.want * (1 - pressed * 0.5);
  f.speed += (want - f.speed) * Math.min(1, dt * 3);
  move(f, dt);
}

/** a keeper greets the player inside this, and forgets them beyond `LEAVE` */
const GREET = 3.2;
const LEAVE = 4.5;
/** how far from the post a keeper strolls, and how near home counts as home */
const WANDER = [0.5, 1.0] as const;
const HOME = 0.1;
const BACK = 0.4;
const WAVE_FOR = 1.5;
const aim = blankPose();

function duty(f: Extract<Folk, { kind: "keeper" }>, d: Duty, gest: Gesture, timer: number) {
  f.duty = d;
  f.gest = gest;
  f.clock = 0;
  f.timer = timer;
}

const work = (f: Extract<Folk, { kind: "keeper" }>) => duty(f, "chore", CHORE[f.station], 6 + f.rand() * 4);
const pause = (f: Extract<Folk, { kind: "keeper" }>) => 1 + f.rand();

/** A spot a little way from the post that is dry, clear of every footprint and plinth, or null after a few tries. */
function wanderGoal(f: Extract<Folk, { kind: "keeper" }>): Vector3 | null {
  for (let k = 0; k < 8; k++) {
    const goal = f.post.clone();
    dir.crossVectors(f.post, f.rest).applyAxisAngle(f.post, f.rand() * Math.PI * 2);
    walk(goal, dir, WANDER[0] + f.rand() * (WANDER[1] - WANDER[0]));
    if (!blocked(goal, RADIUS + 0.1) && !plinthAt(goal) && !swimming(goal)) return goal;
  }
  return null;
}

/**
 * A keeper's day: work the prop, take a short walk round the post, fidget, work again. Close to the
 * player they wave once, then keep working while facing them. Under reduced motion (`motion` 0) they
 * never stroll or wave and hold the chore pose still. Returns the turn rate.
 */
export function stepKeeper(f: Extract<Folk, { kind: "keeper" }>, dt: number, player: Vector3, motion: number): number {
  const gap = arc(f.n, player);
  const close = gap < GREET;
  if (gap > LEAVE) f.met = false;
  const home = arc(f.n, f.post);
  if (f.duty !== "greet") {
    if (close && (f.duty === "stroll" || home > BACK)) {
      // heading back to the post, whatever it was doing
      f.goal = f.post;
      f.duty = "stroll";
      f.gest = "rest";
    } else if (close && f.duty === "idle") work(f);
  }
  f.timer -= dt;
  f.clock += dt * (close ? 0.7 : 1);

  if (f.duty === "stroll") {
    const goal = f.goal;
    if (goal) {
      if (arc(f.n, goal) < (goal === f.post ? (close ? BACK : HOME) : 0.15)) {
        f.goal = null;
        if (goal !== f.post) f.timer = pause(f);
        else if (close && !f.met && motion) {
          f.met = true;
          duty(f, "greet", "wave", WAVE_FOR);
        } else if (close || !motion) work(f);
        else duty(f, "idle", IDLES[Math.floor(f.rand() * IDLES.length)], 3 + f.rand());
      }
    } else if (f.timer < 0) f.goal = f.post;
  } else if (f.duty === "greet") {
    if (f.timer < 0) work(f);
  } else if (f.duty === "idle") {
    if (f.timer < 0) work(f);
  } else if (close && !f.met && motion) {
    f.met = true;
    duty(f, "greet", "wave", WAVE_FOR);
  } else if (f.timer < 0 && !close && motion) {
    const goal = wanderGoal(f);
    if (goal) {
      f.goal = goal;
      duty(f, "stroll", "rest", 0);
    } else duty(f, "idle", IDLES[Math.floor(f.rand() * IDLES.length)], 3 + f.rand());
  }

  const goal = f.goal;
  if (goal) toward(f.n, goal, dir);
  else if (close || f.duty === "greet") toward(f.n, player, dir);
  else toward(f.n, tmp.copy(f.n).add(f.rest), dir);
  if (goal) steer(f.n, dir, RADIUS, goal, f.skip);
  const turn = Math.atan2(push.crossVectors(f.heading, dir).dot(f.n), f.heading.dot(dir));
  f.heading.lerp(dir, Math.min(1, dt * (goal ? 4 : 5)));
  flatten(f.heading, f.n);
  f.speed += ((goal ? WALK * 0.55 : 0) - f.speed) * Math.min(1, dt * 3);
  move(f, dt);
  chasePose(f.pose, poseOf(f.gest, f.clock, motion, aim), Math.min(1, dt * 6));
  return turn * 0.3;
}

/** a visitor further than this from their last update was moved, not walked: a reconnect, a long hidden tab */
const TELEPORT = 8;
/** how fast a visitor closes on their last reported spot, per second */
const GLIDE = 7;
const EMOTE_FOR = 2.5;

/**
 * Eases a remote visitor toward the last position and heading the room reported, and turns the ground
 * they cover into the walk speed that drives the waddle. `motion` is 0 under reduced motion. Returns the turn rate.
 */
export function stepVisitor(f: Visitor, dt: number, motion: number, aim: Pose): number {
  if (f.fresh || arc(f.n, f.to) > TELEPORT) {
    f.n.copy(f.to);
    f.heading.copy(f.facing);
    f.speed = 0;
    f.fresh = false;
  }
  tmp.copy(f.n);
  f.n.lerp(f.to, 1 - Math.exp(-dt * GLIDE)).normalize();
  f.speed += ((dt > 0 ? Math.min(arc(tmp, f.n) / dt, WALK * 3.2) : 0) - f.speed) * Math.min(1, dt * 8);
  // rotate rather than lerp: a lerp between opposite headings passes through zero
  dir.crossVectors(f.heading, f.facing);
  const off = Math.atan2(dir.dot(f.n), f.heading.dot(f.facing));
  f.heading.applyAxisAngle(f.n, off * Math.min(1, dt * 10));
  flatten(f.heading, f.n);
  f.lift += (standLift(f.n) - f.lift) * Math.min(1, dt * 8);
  if (f.emote) {
    f.gest = f.emote;
    f.clock = 0;
    f.emote = null;
  }
  f.clock += dt;
  if (f.gest !== "rest" && f.clock > (onceOf(f.gest) ?? EMOTE_FOR)) f.gest = "rest";
  chasePose(f.pose, poseOf(f.gest === "rest" && swimming(f.n) ? "swim" : f.gest, f.clock, motion, aim), Math.min(1, dt * 8));
  return off * 0.3;
}

/** Slides onto a pinned spot and turns to face its way, then holds there; `pace` keeps a treadmill runner's legs going. */
function settle(f: Villager, pin: Post, dt: number) {
  const d = arc(f.n, pin.n);
  if (d > 1e-3) walk(f.n, toward(f.n, pin.n, dir), Math.min(d, dt * WALK * 0.6), f.heading);
  f.heading.lerp(pin.heading, Math.min(1, dt * 5));
  flatten(f.heading, f.n);
  f.speed = d > 0.05 ? WALK * 0.5 : (pin.pace ?? 0);
  f.want = f.turn = 0;
}

/** Advances along the heading by the current speed and keeps clear of footprints. */
export function move(f: Folk, dt: number, along: Vector3 = f.heading, ...riders: Vector3[]) {
  if (f.speed > 1e-3) walk(f.n, along, f.speed * dt, f.heading, ...riders);
  resolve(f.n, RADIUS, f.kind === "villager" || f.kind === "keeper" ? f.skip : null, f.kind === "player", f.heading, ...riders);
}

const SQ_SPRING = 170;
const SQ_DAMP = 15;

/** Walk cycle, waddle, squash spring and hop clock, shared by every character. */
export function animate(f: Folk, dt: number, turnRate: number) {
  const walking = f.speed > 0.25;
  const target = Math.min(1, f.speed / WALK);
  if ((f.amp > 0.4) !== walking && Math.abs(target - f.amp) > 0.3) f.sqv += walking ? 3 : -3.2;
  f.amp += (target - f.amp) * Math.min(1, dt * 8);
  f.phase += dt * (5 + 7 * f.amp) * (f.amp > 0.02 ? 1 : 0);
  // a stiff spring diverges on a long step (a hitch, or ?speed), so it never takes one
  const k = Math.min(dt, 1 / 30);
  f.sqv += (-SQ_SPRING * f.sq - SQ_DAMP * f.sqv) * k;
  f.sq += f.sqv * k;
  f.lean += (turnRate - f.lean) * Math.min(1, dt * 6);
  if (f.hop !== Infinity) f.hop += dt;
}

export const HOP = 0.45;
