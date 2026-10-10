import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SURF, type Surf, dress } from "./surface";

export const ACCENT = "#2b3cff";

export const TONE = {
  white: "#fbfaf7",
  light: "#ebe8e2",
  mid: "#d3cfc7",
} as const;

/** World colours: soft, matte plasticine, never neon. Station identities live in dioramas.ts. */
export const PAL = {
  grass: "#8cc673",
  meadow: "#b5d883",
  sand: "#ecd6ab",
  cobble: "#e2cfb0",
  water: "#8cc6e6",
  wood: "#a8714c",
  woodDark: "#7a5640",
  trunk: "#94664a",
  terracotta: "#d9805f",
  slate: "#3b4250",
  lampPost: "#3d5a4c",
  bulb: "#ffe2a0",
  leaf: ["#8cc27e", "#6aa877", "#a9d38c", "#5c9a6c", "#7fb98a"],
  autumn: ["#f4b98f", "#ee9a86"],
  flower: ["#f6a6b8", "#ffffff", "#f7d26e", "#b9a3e6", "#f29a83"],
} as const;

/** The one clay material. Per-part tone and surface live in vertex attributes so every static mesh can share it. */
export const CLAY = dress(
  new MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
  }),
);

export type Vec3 = [number, number, number];

export interface PartOpts {
  rot?: Vec3;
  scale?: Vec3;
  tone?: string;
  surf?: Surf;
}

export interface Part {
  geo: BufferGeometry;
  pos: Vec3;
  opts: PartOpts;
}

export function paint(geo: BufferGeometry, tone: string, surf: Surf = "clay"): BufferGeometry {
  const c = new Color(tone);
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  geo.setAttribute("color", new Float32BufferAttribute(arr, 3));
  return dub(geo, surf);
}

/** Tags every vertex with what it's made of; see surface.ts. */
export function dub(geo: BufferGeometry, surf: Surf): BufferGeometry {
  geo.setAttribute("surf", new Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count).fill(SURF[surf]), 1));
  return geo;
}

const cache = new Map<string, BufferGeometry>();
function shared(key: string, make: () => BufferGeometry) {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

// Detail follows size: a rounded corner under ~1cm or a curve a few pixels across never shows its segments,
// and the minimap draws every triangle a second time.
/** Rounded boxes at smoothness 2 (300 triangles), square ones (12) once the corner is too small to see. */
export const box = (w: number, h: number, d: number, r = 0.05) =>
  shared(`b${w},${h},${d},${r}`, () => {
    const c = Math.min(r, w / 2, h / 2, d / 2);
    return c < 0.012 ? new BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, c);
  });
/** Segments for a curve of radius r: the full count from 0.2 up, half that for the smallest bits. */
const round = (r: number, n: number, min: number) => Math.max(min, Math.round(n * Math.min(1, Math.max(0.5, r / 0.2))));
export const ball = (r: number, w = 12, h = 9) =>
  shared(`s${r},${w},${h}`, () => new SphereGeometry(r, round(r, w, 6), round(r, h, 4)));
export const cyl = (rt: number, rb: number, h: number) =>
  shared(`c${rt},${rb},${h}`, () => new CylinderGeometry(rt, rb, h, round(Math.max(rt, rb), 14, 6)));
export const cone = (r: number, h: number) => shared(`n${r},${h}`, () => new ConeGeometry(r, h, round(r, 12, 6)));
export const ring = (r: number, tube: number, rad = 8, seg = 18) =>
  shared(`t${r},${tube},${rad},${seg}`, () => new TorusGeometry(r, tube, rad, seg));
export const pill = (r: number, len: number, cap = 4, rad = 10) =>
  shared(`p${r},${len},${cap},${rad}`, () => new CapsuleGeometry(r, len, cap, rad));

/** Square-edged box for trim too small for rounded corners to show: 12 triangles against a rounded box's 300. */
export const slab = (w: number, h: number, d: number) => shared(`x${w},${h},${d}`, () => new BoxGeometry(w, h, d));
/** A four-sided pyramid with a `w` square base at y -h/2, edges along the axes. */
export const pyramid = (w: number, h: number) =>
  shared(`y${w},${h}`, () => new ConeGeometry(w * Math.SQRT1_2, h, 4).rotateY(Math.PI / 4));
/** A cylinder with few sides, for rods, rails and stems. */
export const rod = (r: number, h: number, sides = 6) => shared(`r${r},${h},${sides}`, () => new CylinderGeometry(r, r, h, sides));

/** A gable roof: a triangular prism `w` wide across x, `h` tall, its ridge running `d` along z, base at y 0. */
export const gable = (w: number, h: number, d: number) =>
  shared(`g${w},${h},${d}`, () => {
    const s = new Shape().moveTo(-w / 2, 0).lineTo(w / 2, 0).lineTo(0, h).closePath();
    const bevel = Math.min(0.03, h / 8);
    return new ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 })
      .translate(0, 0, -d / 2 + bevel);
  });

export const part = (geo: BufferGeometry, pos: Vec3, opts: PartOpts = {}): Part => ({ geo, pos, opts });

/** Only position, normal, colour and surface survive a merge, so every source geometry lines up. */
function strip(g: BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  return g;
}

const m = new Matrix4();
const q = new Quaternion();
const one = new Vector3(1, 1, 1);

/** Bakes every part's transform and tone into a single geometry: one draw call per station. */
export function merge(parts: Part[], at: Vec3 = [0, 0, 0]): BufferGeometry {
  const baked = parts.map(({ geo, pos, opts }) => {
    q.setFromEuler(new Euler(...(opts.rot ?? [0, 0, 0])));
    m.compose(new Vector3(pos[0] + at[0], pos[1] + at[1], pos[2] + at[2]), q, opts.scale ? new Vector3(...opts.scale) : one);
    return paint(strip(geo.index ? geo.toNonIndexed() : geo.clone()), opts.tone ?? TONE.white, opts.surf).applyMatrix4(m);
  });
  const out = mergeGeometries(baked, false);
  baked.forEach((g) => g.dispose());
  return out;
}
