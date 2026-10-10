import { DataTexture, LinearFilter, type MeshStandardMaterial, RepeatWrapping } from "three";

/**
 * What a piece of clay is made of. Baked per vertex as the `surf` attribute, so one material and
 * one draw call still cover a whole station; the shader below turns each into a procedural texture.
 */
export const SURF = {
  clay: 0,
  wood: 1,
  brick: 2,
  tile: 3,
  stone: 4,
  fabric: 5,
  metal: 6,
  glass: 7,
  grass: 8,
  leaf: 9,
  glow: 10,
  water: 11,
  sand: 12,
  plaster: 13,
  bark: 14,
} as const;
export type Surf = keyof typeof SURF;

const NOISE = 256;
/**
 * Value noise as a texture: red is random per texel, green is red 37 and 17 texels on, so one
 * bilinear read returns two neighbouring z-slices of 3D noise. It replaces eight hashes per sample.
 */
function noiseTexture(): DataTexture {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const r = Array.from({ length: NOISE * NOISE }, () => Math.floor(rand() * 256));
  const data = new Uint8Array(NOISE * NOISE * 4);
  for (let y = 0; y < NOISE; y++)
    for (let x = 0; x < NOISE; x++) {
      const i = (y * NOISE + x) * 4;
      data[i] = r[y * NOISE + x];
      data[i + 1] = r[((y + 17) % NOISE) * NOISE + ((x + 37) % NOISE)];
    }
  const t = new DataTexture(data, NOISE, NOISE);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Shared by every clay material: the scene clock for water, 0 day … 1 night for lit windows, the planet radius, and the noise. */
export const SURFACE_UNIFORMS = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uR: { value: 1 },
  uNoise: { value: noiseTexture() },
};

/** 3D value noise from `uNoise`, for any shader that takes `SURFACE_UNIFORMS`. */
export const NOISE_GLSL = /* glsl */ `
uniform sampler2D uNoise;
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 rg = texture(uNoise, (i.xy + vec2(37.0, 17.0) * i.z + f.xy + 0.5) / ${NOISE}.0).rg;
  return mix(rg.x, rg.y, f.z);
}
`;

const VERTEX_HEAD = /* glsl */ `
attribute float surf;
varying float vSurf;
varying vec3 vObj;
varying vec3 vObjN;
`;

const VERTEX_BODY = /* glsl */ `
vSurf = surf;
vObj = position;
vObjN = normal;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uR;
varying float vSurf;
varying vec3 vObj;
varying vec3 vObjN;

float h31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
${NOISE_GLSL}/** \`fp\` is the pixel's footprint in p's units: octaves finer than a pixel would only shimmer, so they stop there. */
float fbm(vec3 p, float fp, int n) {
  float a = 0.5, s = 0.0, w = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= n || (i > 0 && fp > 0.6)) break;
    s += a * vnoise(p);
    w += a;
    p = p * 2.03 + 1.7;
    a *= 0.5;
    fp *= 2.03;
  }
  return s / w;
}
/** x: distance to the nearest cell centre, y: gap to the second nearest, z: the cell's hash */
vec3 cells(vec2 p) {
  vec2 i = floor(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y);
    vec2 o = c + vec2(h21(c), h21(c + 17.3)) * 0.8 + 0.1;
    float d = length(p - o);
    if (d < d1) { d2 = d1; d1 = d; id = h21(c + 3.1); } else if (d < d2) d2 = d;
  }
  return vec3(d1, d2 - d1, id);
}
/** face-aligned coordinates: tops read x,z and walls read along their length, then up */
vec2 faceUv(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > a.x && a.y > a.z) return p.xz;
  return a.x > a.z ? p.zy : p.xy;
}
/** 1 while a feature of size s spans a few pixels, fading to 0 before it would shimmer */
float keep(float s, float px) { return 1.0 - smoothstep(s * 0.25, s * 0.8, px); }

struct Surface { vec3 tint; float h; float rough; float metal; vec3 glow; vec3 col; float colMix; };

Surface surface(vec3 base) {
  Surface s = Surface(vec3(1.0), 0.0, 0.85, 0.0, vec3(0.0), vec3(0.0), 0.0);
  int k = int(vSurf + 0.5);
  vec3 p = vObj;
  vec3 n = normalize(vObjN);
  float px = length(fwidth(p));
  vec2 uv = faceUv(p, n);

  if (k == 1 || k == 14) {
    // wood: planks with seams and wavy grain; bark is the same, rougher and darker
    float w = k == 14 ? 0.07 : 0.16;
    float row = floor(uv.y / w);
    float f = fract(uv.y / w);
    float seam = smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f);
    float grain = sin((uv.y * 70.0 + fbm(vec3(uv.x * 3.0, uv.y * 40.0, row), px * 40.0, 4) * 7.0)) * 0.5 + 0.5;
    float g = keep(0.02, px);
    s.tint = vec3(0.88 + 0.16 * h21(vec2(row, 1.0))) * mix(1.0, 0.82 + 0.18 * grain, g) * mix(0.62, 1.0, mix(1.0, seam, keep(w * 0.2, px)));
    if (k == 14) s.tint *= 0.85 + 0.2 * fbm(vec3(uv * vec2(3.0, 25.0), 0.0), px * 25.0, 3);
    s.h = seam * 0.6 + grain * 0.25 * g;
    s.rough = k == 14 ? 0.95 : 0.72;
  } else if (k == 2) {
    // brick: running bond, pale mortar sunk into the joints
    vec2 b = uv / vec2(0.2, 0.085);
    b.x += mod(floor(b.y), 2.0) * 0.5;
    vec2 f = fract(b);
    float m = smoothstep(0.0, 0.07, f.x) * smoothstep(1.0, 0.93, f.x) * smoothstep(0.0, 0.12, f.y) * smoothstep(1.0, 0.88, f.y);
    m = mix(1.0, m, keep(0.03, px));
    float j = h21(floor(b));
    s.tint = mix(vec3(1.25, 1.2, 1.12), vec3(0.86 + 0.2 * j) * (0.92 + 0.12 * fbm(p * 30.0, px * 30.0, 4)), m);
    s.h = m;
    s.rough = 0.9;
  } else if (k == 3) {
    // roof tiles: rows laid along the ridge, each course shading into the one below
    vec3 a = abs(n);
    vec2 t = vec2(a.x > a.z ? p.z : p.x, p.y * 1.5 + (a.y > 0.95 ? (a.x > a.z ? p.x : p.z) : 0.0)) / vec2(0.13, 0.085);
    t.x += mod(floor(t.y), 2.0) * 0.5;
    vec2 f = fract(t);
    float lip = mix(1.0, 0.55 + 0.45 * smoothstep(0.0, 0.5, f.y), keep(0.03, px));
    float gap = mix(1.0, smoothstep(0.0, 0.06, f.x) * smoothstep(1.0, 0.94, f.x), keep(0.04, px));
    s.tint = vec3(0.9 + 0.18 * h21(floor(t))) * lip * mix(0.7, 1.0, gap);
    s.h = f.y * 0.8 * gap;
    s.rough = 0.75;
  } else if (k == 4) {
    // stone: irregular flags with dark joints
    vec3 c = cells(uv * 6.0);
    float edge = mix(1.0, smoothstep(0.02, 0.09, c.y), keep(0.03, px));
    s.tint = vec3(0.86 + 0.22 * c.z) * mix(0.55, 1.0, edge) * (0.92 + 0.12 * fbm(p * 20.0, px * 20.0, 4));
    s.h = edge * (1.0 - c.x * 0.6);
    s.rough = 0.92;
  } else if (k == 5) {
    // fabric: a soft weave
    vec2 w = uv * 160.0;
    float weave = (sin(w.x) * sin(w.y) * 0.5 + 0.5) * keep(0.012, px);
    s.tint = vec3(0.93 + 0.07 * weave) * (0.95 + 0.08 * fbm(p * 8.0, px * 8.0, 4));
    s.h = weave * 0.3 + fbm(p * 6.0, px * 6.0, 4) * 0.4;
    s.rough = 1.0;
  } else if (k == 6) {
    // metal: brushed streaks and a soft sheen
    float br = fbm(vec3(uv.x * 80.0, uv.y * 3.0, 0.0), px * 80.0, 4);
    s.tint = vec3(0.92 + 0.12 * br * keep(0.01, px));
    s.rough = 0.38;
    s.metal = 0.35;
  } else if (k == 7) {
    // glass: a sky sheen by day, warm lamplight behind it at night
    float sheen = smoothstep(0.42, 0.5, fract((uv.x + uv.y) * 2.2)) * smoothstep(0.62, 0.52, fract((uv.x + uv.y) * 2.2));
    s.tint = vec3(0.8 + 0.25 * fract(uv.y * 1.3)) + sheen * 0.35;
    s.rough = 0.12;
    float flicker = 0.85 + 0.15 * vnoise(floor(p * 2.0) + uTime * 0.6);
    s.glow = vec3(1.0, 0.72, 0.38) * uNight * 1.1 * flicker;
  } else if (k == 8) {
    // grass: broad meadow patches, clumps and blades, then beach and seabed below sea level
    vec3 q = p / uR;
    float broad = fbm(q * 3.5, px * 3.5 / uR, 2);
    float clump = fbm(p * 2.2, px * 2.2, 3);
    float blade = h31(floor(p * 38.0)) * keep(0.03, px);
    vec3 grass = mix(vec3(0.24, 0.55, 0.16), vec3(0.47, 0.69, 0.22), smoothstep(0.3, 0.75, broad));
    grass = mix(grass, vec3(0.11, 0.33, 0.14), smoothstep(0.55, 0.8, clump) * 0.55);
    grass *= 0.9 + 0.16 * blade;
    float alt = length(p) - uR;
    vec3 sand = vec3(0.84, 0.67, 0.41) * (0.93 + 0.1 * h31(floor(p * 45.0)));
    vec3 bed = vec3(0.2, 0.42, 0.38);
    vec3 col = mix(grass, sand, smoothstep(-0.02, -0.12, alt));
    s.col = mix(col, bed, smoothstep(-0.25, -0.6, alt));
    s.colMix = 1.0;
    s.h = clump * 0.6 + blade * 0.4;
    s.rough = 0.95;
  } else if (k == 9) {
    // foliage: lumpy leaf clusters with shadowed hollows
    float c = fbm(p * 9.0, px * 9.0, 4);
    float leaf = h31(floor(p * 40.0)) * keep(0.025, px);
    s.tint = vec3(0.72 + 0.45 * c) * (0.92 + 0.14 * leaf);
    s.h = c + leaf * 0.3;
    s.rough = 0.8;
  } else if (k == 10) {
    s.glow = base * (0.35 + 0.9 * uNight);
    s.rough = 0.4;
  } else if (k == 11) {
    // water: drifting ripples and glints
    float r = fbm(vec3(p.xz * 5.0, uTime * 0.35), px * 5.0, 4);
    s.tint = vec3(0.9 + 0.25 * r);
    s.h = r;
    s.rough = 0.08;
    s.glow = vec3(0.7, 0.9, 1.0) * smoothstep(0.78, 0.9, r) * 0.2;
  } else if (k == 12) {
    // sand and packed dirt: grit and the odd pebble
    float pebble = smoothstep(0.74, 0.8, vnoise(vec3(uv * 14.0, 0.0))) * keep(0.03, px);
    s.tint = vec3(0.92 + 0.12 * h31(floor(p * 60.0)) * keep(0.01, px)) * (0.95 + 0.08 * fbm(p * 4.0, px * 4.0, 4)) * (1.0 - pebble * 0.18);
    s.h = pebble;
    s.rough = 0.97;
  } else if (k == 13) {
    // plaster: hand-trowelled render
    float t = fbm(p * 7.0, px * 7.0, 4);
    s.tint = vec3(0.95 + 0.08 * t);
    s.h = t * 0.7 + fbm(p * 30.0, px * 30.0, 4) * 0.3 * keep(0.02, px);
    s.rough = 0.9;
  } else {
    // plain clay: soft thumbprints so nothing reads as a bare primitive
    float t = fbm(p * 5.0, px * 5.0, 3);
    s.tint = vec3(0.95 + 0.07 * t);
    s.h = t * 0.4 + fbm(p * 22.0, px * 22.0, 4) * 0.25 * keep(0.03, px);
  }
  return s;
}

/** Bump from a scalar height via screen-space derivatives (Mikkelsen), in view space. */
vec3 bumped(vec3 pos, vec3 nrm, float h, float amount) {
  vec3 dx = dFdx(pos), dy = dFdy(pos);
  vec3 r1 = cross(dy, nrm), r2 = cross(nrm, dx);
  float det = dot(dx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * nrm - amount * grad);
}
`;

/** How strongly each surface's height pushes the shading normal. */
const BUMP = 0.012;

/** Teaches a MeshStandardMaterial the `surf` attribute. Meshes without it read 0, plain clay. */
export function dress(mat: MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SURFACE_UNIFORMS);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = (FRAGMENT_HEAD + shader.fragmentShader)
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nSurface surf = surface(diffuseColor.rgb);\ndiffuseColor.rgb = mix(diffuseColor.rgb * surf.tint, surf.col, surf.colMix);",
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = surf.rough;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = surf.metal;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\nnormal = bumped(-vViewPosition, normal, surf.h, ${BUMP});`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += surf.glow;");
  };
  return mat;
}
