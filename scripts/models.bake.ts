/**
 * Bakes every clay model the scene used to build at load into public/models/*.glb.
 * The builders run here as they did in the browser, then Blender reimports each file and writes it back
 * Draco-compressed. Rerun after changing a builder: npm run models. `npm run models -- --check` only verifies.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";
import type { BufferGeometry } from "three";
import type { ModelName } from "../components/hq/scene/models.ts";

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

const BLENDER = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const OUT = "public/models";

const { buildGround, clouds } = await import("../components/hq/scene/props.ts");
const { LANDMARKS, seaSurface } = await import("../components/hq/scene/planet.ts");
const { AMBIENCE, IDENTITY, RIGS, buildStation } = await import("../components/hq/scene/dioramas.ts");
const { PARTS, WEAR } = await import("../components/hq/scene/folk.ts");
const { merge } = await import("../components/hq/scene/clay.ts");
const { STATIONS } = await import("../data/stations.ts");
const { mergeVertices } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");

type Model = () => Record<string, BufferGeometry>;
// already placed on the planet: the clay shader patterns in object space, so the stations keep their planet-space stone and planks
const station = (id: (typeof STATIONS)[number]["id"]): Model => () => ({ [id]: buildStation(id).applyMatrix4(LANDMARKS[id].frame) });

const MODELS = {
  ground: () => ({ ground: buildGround() }),
  sea: () => ({ sea: seaSurface() }),
  clouds: () => ({ high: clouds(11, 7, [50, 58], 0.75, [2.2, 2.7]), low: clouds(23, 14, [82, 150], 1.05, [1.8, 3.2]) }),
  folk: () => ({
    ...Object.fromEntries(Object.entries(PARTS).map(([k, build]) => [k, build()])),
    ...Object.fromEntries(Object.entries(WEAR).map(([k, { build }]) => [k, build()])),
  }),
  rigs: () => Object.fromEntries(RIGS.map((rig, j) => [`rig${j}`, merge(rig.parts(IDENTITY[AMBIENCE.station]))])),
  ...(Object.fromEntries(STATIONS.map(({ id }) => [`station-${id}`, station(id)])) as Record<`station-${(typeof STATIONS)[number]["id"]}`, Model>),
} satisfies Record<ModelName, Model>;

const ATTR: Record<string, string> = { position: "POSITION", normal: "NORMAL", color: "COLOR_0", surf: "_SURF", centre: "_CENTRE" };
const TYPE = ["", "SCALAR", "VEC2", "VEC3", "VEC4"];

/** Hash of everything a builder produced, so a stale bake is caught exactly. */
function source(g: BufferGeometry): string {
  const h = createHash("sha1");
  for (const k of Object.keys(ATTR)) {
    const a = g.getAttribute(k);
    if (a) h.update(new Uint8Array(new Float32Array(a.array).buffer));
  }
  return h.digest("hex").slice(0, 16);
}

/** A bare glTF binary: one node per mesh, float attributes, no materials. Blender does the rest. */
function glb(meshes: Record<string, BufferGeometry>): Buffer {
  const chunks: Buffer[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const out: object[] = [];
  let offset = 0;
  const push = (arr: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>, size: number, target: number) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target });
    chunks.push(b);
    offset += b.length;
    const acc: Record<string, unknown> = { bufferView: bufferViews.length - 1, count: arr.length / size, type: TYPE[size] };
    acc.componentType = arr instanceof Uint32Array ? 5125 : 5126;
    if (target === 34962 && size === 3) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < arr.length; i++) {
        min[i % 3] = Math.min(min[i % 3], arr[i]);
        max[i % 3] = Math.max(max[i % 3], arr[i]);
      }
      Object.assign(acc, { min, max });
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  for (const [name, loose] of Object.entries(meshes)) {
    // the builders emit loose triangles; welding the exact duplicates shrinks the file several times over
    const g = mergeVertices(loose);
    const attributes: Record<string, number> = {};
    for (const [k, gl] of Object.entries(ATTR)) {
      const a = g.getAttribute(k);
      if (a) attributes[gl] = push(new Float32Array(a.array), a.itemSize, 34962);
    }
    const prim: Record<string, unknown> = { attributes };
    if (g.index) prim.indices = push(new Uint32Array(g.index.array), 1, 34963);
    out.push({ name, primitives: [prim] });
  }
  const bin = Buffer.concat(chunks);
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "porto models.bake" },
    scene: 0,
    scenes: [{ nodes: out.map((_, i) => i) }],
    nodes: Object.entries(meshes).map(([name, g], i) => ({ name, mesh: i, extras: { source: source(g) } })),
    meshes: out,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  });
  const pad = (b: Buffer, fill: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const j = pad(Buffer.from(json), 0x20);
  const bb = pad(bin, 0);
  const u32 = (...v: number[]) => Buffer.from(new Uint32Array(v).buffer);
  return Buffer.concat([u32(0x46546c67, 2, 28 + j.length + bb.length), u32(j.length, 0x4e4f534a), j, u32(bb.length, 0x004e4942), bb]);
}

/** The committed files' mesh names and the source hash each was baked from, read from the glTF header without decoding. */
function stamps(file: string): Record<string, string> {
  const b = readFileSync(file);
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  return Object.fromEntries(json.nodes.map((n: { name: string; extras?: { source?: string } }) => [n.name, n.extras?.source]));
}

// `--check` fails when a builder changed but the baked files didn't follow
if (process.argv.includes("--check")) {
  for (const [name, build] of Object.entries(MODELS)) {
    const fresh = Object.fromEntries(Object.entries(build()).map(([k, g]) => [k, source(g)]));
    assert.deepEqual(stamps(`${OUT}/${name}.glb`), fresh, `${name}.glb is stale, run npm run models`);
  }
  console.log("models: baked files match the builders");
  process.exit(0);
}

const raw = mkdtempSync(join(tmpdir(), "porto-models-"));
for (const [name, build] of Object.entries(MODELS)) writeFileSync(join(raw, `${name}.glb`), glb(build()));
mkdirSync(OUT, { recursive: true });
execFileSync(BLENDER, ["-b", "--factory-startup", "-P", "scripts/models.blend.py", "--", raw, OUT], { stdio: ["ignore", "inherit", "inherit"] });
rmSync(raw, { recursive: true });

// the loader fetches the Draco decoder from here rather than a third-party CDN
mkdirSync("public/draco", { recursive: true });
for (const f of ["draco_decoder.wasm", "draco_wasm_wrapper.js"]) copyFileSync(`node_modules/three/examples/jsm/libs/draco/gltf/${f}`, `public/draco/${f}`);
