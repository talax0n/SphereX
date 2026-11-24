"use client";

import { useEffect, useRef } from "react";
import { PROVIDER } from "./ai-pulse";

const RAMP = ".,-~:;=!*#$@";
const CELL_W = 6;
const CELL_H = 12;
const FRAME_MS = 50;
/** camera distance, in the same units as the shapes, which all fit a radius of about 3 */
const K2 = 5;
/** ramp index from which a cell counts as a highlight and draws in the accent colour */
const HOT = 10;
const HOLD_S = 3.2;
const MORPH_S = 1.8;
/** points per shape; every shape has the same count so a morph can pair them one to one */
const N = 20_000;
const TAU = Math.PI * 2;

type V3 = [number, number, number];
type Tri = { a: V3; b: V3; c: V3; n: V3; area: number };
type Warp = (p: V3) => V3;

const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

// `inside` is any point within the solid the face belongs to, which is what orients the normal outward.
function tri(out: Tri[], a: V3, b: V3, c: V3, inside: V3) {
  const n = cross(sub(b, a), sub(c, a));
  const len = Math.hypot(...n);
  if (!len) return;
  const flip = dot(n, sub(a, inside)) < 0 ? -1 : 1;
  out.push({ a, b, c, n: [(n[0] / len) * flip, (n[1] / len) * flip, (n[2] / len) * flip], area: len / 2 });
}

function box(out: Tri[], [cx, cy, cz]: V3, [hx, hy, hz]: V3, warp: Warp = (p) => p) {
  const corner = (i: number) => warp([cx + (i & 1 ? hx : -hx), cy + (i & 2 ? hy : -hy), cz + (i & 4 ? hz : -hz)]);
  const inside = warp([cx, cy, cz]);
  for (const [p, q, r, s] of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
    tri(out, corner(p), corner(q), corner(r), inside);
    tri(out, corner(p), corner(r), corner(s), inside);
  }
}

/** leans a box sideways around the height `y0`, turning its front face into a parallelogram */
const shear = (k: number, y0: number): Warp => ([x, y, z]) => [x + k * (y - y0), y, z];

function solana() {
  const t: Tri[] = [];
  for (const [y, k] of [[1.5, 1], [0, -1], [-1.5, 1]]) box(t, [0, y, 0], [1.9, 0.36, 0.12], shear(k, y));
  return t;
}

function ethereum() {
  const t: Tri[] = [];
  const ring = (y: number): V3[] => [[1.55, y, 0], [0, y, 1.55], [-1.55, y, 0], [0, y, -1.55]];
  const piece = (corners: V3[], apexes: V3[], inside: V3) => {
    for (const apex of apexes) corners.forEach((c, i) => tri(t, c, corners[(i + 1) % 4], apex, inside));
  };
  piece(ring(-0.1), [[0, 2.9, 0], [0, -0.95, 0]], [0, 0.6, 0]);
  // The lower piece is a downward point with a notch cut into its top, as in the logo.
  piece(ring(-0.75), [[0, -2.9, 0], [0, -1.55, 0]], [0, -1.9, 0]);
  return t;
}

// Seeded, so the point layout is the same on every visit.
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** N points as x, y, z, nx, ny, nz, spread over the triangles by area */
function sample(tris: Tri[]) {
  const rand = mulberry(7);
  const total = tris.reduce((sum, t) => sum + t.area, 0);
  const pts = new Float32Array(N * 6);
  let k = 0;
  let reach = tris[0].area;
  for (let i = 0; i < N; i++) {
    const at = ((i + 0.5) / N) * total;
    while (at > reach && k < tris.length - 1) reach += tris[++k].area;
    const { a, b, c, n } = tris[k];
    let [u, v] = [rand(), rand()];
    if (u + v > 1) [u, v] = [1 - u, 1 - v];
    for (let d = 0; d < 3; d++) pts[i * 6 + d] = a[d] + (b[d] - a[d]) * u + (c[d] - a[d]) * v;
    pts.set(n, i * 6 + 3);
  }
  return pts;
}

// Flat marks, as SVG paths on a 24 unit square. The first two are drawn here; DeepSeek is from Simple Icons.
const ICONS = {
  computer: "M2 3H22V16H2ZM4 5V14H20V5ZM6 7L9.5 9.5L6 12V10.6L7.6 9.5L6 8.4ZM10.5 11H14.5V12H10.5ZM10 16H14V19H10ZM6 19H18V21H6Z",
  controller:
    "M6 6H18C21 6 22.5 9 23 14C23.4 17.5 22.5 19 21 19C19.5 19 18.5 17.5 17 15.5H7C5.5 17.5 4.5 19 3 19C1.5 19 .6 17.5 1 14C1.5 9 3 6 6 6ZM6 7.8H7.6V9.2H9V10.8H7.6V12.2H6V10.8H4.6V9.2H6ZM14.4 11.4A1 1 0 1 0 16.4 11.4A1 1 0 1 0 14.4 11.4ZM16.8 9.2A1 1 0 1 0 18.8 9.2A1 1 0 1 0 16.8 9.2Z",
  deepseek:
    "M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45",
};

const MASK = 192;
/** half the thickness of an extruded mark */
const SLAB = 0.22;

/** N points on a flat mark given thickness: most on the front, some on the back and around the rim */
function extrude(d: string, rule: CanvasFillRule = "nonzero") {
  const mask = document.createElement("canvas");
  mask.width = mask.height = MASK;
  const g = mask.getContext("2d", { willReadFrequently: true });
  const pts = new Float32Array(N * 6);
  if (!g) return pts;
  g.scale(MASK / 24, MASK / 24);
  g.fill(new Path2D(d), rule);
  const alpha = g.getImageData(0, 0, MASK, MASK).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < MASK && y < MASK && alpha[(y * MASK + x) * 4 + 3] > 127;
  const face: number[] = [];
  const rim: number[] = [];
  for (let y = 0; y < MASK; y++) {
    for (let x = 0; x < MASK; x++) {
      if (!on(x, y)) continue;
      face.push(x, y);
      // A filled pixel with an empty neighbour is on the outline, and the empty side is where its wall faces.
      const nx = (on(x + 1, y) ? 0 : 1) - (on(x - 1, y) ? 0 : 1);
      const ny = (on(x, y + 1) ? 0 : 1) - (on(x, y - 1) ? 0 : 1);
      if (nx || ny) rim.push(x, y, nx, ny);
    }
  }
  if (!face.length) return pts;
  const rand = mulberry(7);
  const unit = 5.4 / MASK;
  const place = (x: number, y: number): [number, number] => [(x + rand()) * unit - 2.7, 2.7 - (y + rand()) * unit];
  for (let i = 0; i < N; i++) {
    if (i < N * 0.2 && rim.length) {
      const k = Math.floor((rand() * rim.length) / 4) * 4;
      const len = Math.hypot(rim[k + 2], rim[k + 3]);
      pts.set([...place(rim[k], rim[k + 1]), (rand() * 2 - 1) * SLAB, rim[k + 2] / len, -rim[k + 3] / len, 0], i * 6);
    } else {
      const k = Math.floor((rand() * face.length) / 2) * 2;
      // The viewer is on the negative z side, so that is the front.
      const side = i > N * 0.85 ? 1 : -1;
      pts.set([...place(face[k], face[k + 1]), side * SLAB, 0, 0, side], i * 6);
    }
  }
  return pts;
}

function donut() {
  const rand = mulberry(7);
  const pts = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const [tube, around] = [rand() * TAU, rand() * TAU];
    const [ct, st, cp, sp] = [Math.cos(tube), Math.sin(tube), Math.cos(around), Math.sin(around)];
    pts.set([(2 + ct) * cp, (2 + ct) * sp, st, ct * cp, ct * sp, st], i * 6);
  }
  return pts;
}

// Points are ordered top to bottom, then left to right, in every shape. A morph pairs point i with point i,
// so each point travels to roughly the same place in the next shape and the change reads as melting, not a swarm.
function ordered(pts: Float32Array) {
  const band = (i: number) => Math.round(pts[i * 6 + 1] * 6);
  const order = Array.from({ length: N }, (_, i) => i).sort((p, q) => band(q) - band(p) || pts[p * 6] - pts[q * 6]);
  const out = new Float32Array(pts.length);
  order.forEach((from, to) => out.set(pts.subarray(from * 6, from * 6 + 6), to * 6));
  return out;
}

let shapes: Float32Array[] | undefined;
// Built on first use, because extruding a mark needs a canvas and so cannot run on the server.
const getShapes = () =>
  (shapes ??= [
    donut(),
    extrude(ICONS.computer, "evenodd"),
    extrude(PROVIDER.claude.d),
    extrude(PROVIDER.codex.d),
    extrude(ICONS.deepseek),
    sample(solana()),
    sample(ethereum()),
    extrude(ICONS.controller, "evenodd"),
  ].map(ordered));

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

export function AsciiShape({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const all = getShapes();
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    let size = 0;
    let cols = 0;
    let rows = 0;
    let lum = new Int8Array(0);
    let depth = new Float32Array(0);
    // Pointer offset from the viewport centre, -1..1, eased so the tilt glides.
    const target = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0 };

    const draw = (now: number) => {
      // A frame timestamp can predate the mount time, so clamp to keep the shape index from going negative.
      const t = still ? 0 : Math.max(0, now - start) / 1000;
      const step = Math.floor(t / (HOLD_S + MORPH_S));
      const mix = ease(Math.max(0, (t % (HOLD_S + MORPH_S)) - HOLD_S) / MORPH_S);
      const from = all[step % all.length];
      const to = all[(step + 1) % all.length];
      tilt.x += (target.x - tilt.x) * 0.08;
      tilt.y += (target.y - tilt.y) * 0.08;
      // The shape sways around its front view so a flat logo never sits edge-on, and it takes one full turn through each morph.
      const A = -0.22 + 0.1 * Math.sin(t * 0.6) + tilt.y * 0.5;
      const B = 0.38 * Math.sin(t * 0.45) + tilt.x * 0.6 + TAU * mix;
      const [sinA, cosA, sinB, cosB] = [Math.sin(A), Math.cos(A), Math.sin(B), Math.cos(B)];
      const k1 = (size * K2 * 0.4) / 3;
      lum.fill(-1);
      depth.fill(0);

      for (let i = 0; i < from.length; i += 6) {
        const x = from[i] + (to[i] - from[i]) * mix;
        const y = from[i + 1] + (to[i + 1] - from[i + 1]) * mix;
        const z = from[i + 2] + (to[i + 2] - from[i + 2]) * mix;
        // Turn around the vertical axis first, then tip the result toward the viewer.
        const x1 = x * cosB + z * sinB;
        const z1 = -x * sinB + z * cosB;
        const y2 = y * cosA - z1 * sinA;
        const ooz = 1 / (K2 + y * sinA + z1 * cosA);
        const col = Math.floor((size / 2 + k1 * ooz * x1) / CELL_W);
        const row = Math.floor((size / 2 - k1 * ooz * y2) / CELL_H);
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        const cell = row * cols + col;
        if (ooz <= depth[cell]) continue;
        depth[cell] = ooz;
        const nx = from[i + 3] + (to[i + 3] - from[i + 3]) * mix;
        const ny = from[i + 4] + (to[i + 4] - from[i + 4]) * mix;
        const nz = from[i + 5] + (to[i + 5] - from[i + 5]) * mix;
        const nz1 = -nx * sinB + nz * cosB;
        // Light from in front of the shape and a little above it.
        const l = 0.5 * (ny * cosA - nz1 * sinA) - 0.87 * (ny * sinA + nz1 * cosA);
        // The floor keeps faces that point away from the light readable instead of fading to dots.
        lum[cell] = Math.min(RAMP.length - 1, Math.floor((0.3 + 0.7 * Math.max(0, l)) * 11.5));
      }

      // Read per frame so the colours follow a light/dark switch without a listener.
      const style = getComputedStyle(canvas);
      const ink = style.color;
      const accent = style.getPropertyValue("--accent");
      ctx.clearRect(0, 0, size, size);
      ctx.font = `10px ${style.fontFamily}`;
      ctx.textBaseline = "top";
      for (let i = 0; i < lum.length; i++) {
        if (lum[i] < 0) continue;
        ctx.fillStyle = lum[i] >= HOT ? accent : ink;
        ctx.globalAlpha = lum[i] >= HOT ? 1 : 0.35 + lum[i] * 0.07;
        ctx.fillText(RAMP[lum[i]], (i % cols) * CELL_W, Math.floor(i / cols) * CELL_H);
      }
    };

    const fit = () => {
      const dpr = devicePixelRatio || 1;
      size = canvas.clientWidth;
      cols = Math.floor(size / CELL_W);
      rows = Math.floor(size / CELL_H);
      lum = new Int8Array(cols * rows);
      depth = new Float32Array(cols * rows);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    let drawn = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - drawn < FRAME_MS) return;
      drawn = now;
      draw(now);
    };

    const move = (e: PointerEvent) => {
      target.x = (e.clientX / innerWidth) * 2 - 1;
      target.y = (e.clientY / innerHeight) * 2 - 1;
    };

    fit();
    addEventListener("resize", fit);
    if (!still) {
      addEventListener("pointermove", move);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", fit);
      removeEventListener("pointermove", move);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none aspect-square font-mono text-ink ${className}`} />;
}
