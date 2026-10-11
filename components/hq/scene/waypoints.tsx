import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  Color,
  DoubleSide,
  type Group,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import { STATIONS, type Station, type StationId } from "@/data/stations";
import { ctl } from "../game";
import { ACCENT, CLAY, box, cone, cyl, merge, part } from "./clay";
import { IDENTITY, buildStation } from "./dioramas";
import { OVERLAY } from "./minimap";
import { LANDMARKS, LANDMARK_SCALE, R, arc, frameAt, toward, walk } from "./planet";

const N = STATIONS.length;
/** screen-up distances above a diorama's roofline */
const ARROW_UP = 0.65;
const CHECK_UP = 0.4;
const TAG_UP = 0.28;
/** world half-width of a roof: an arrow slides at most this far sideways to stay on screen over its building */
const HALF = 1;
/** edge arrows: this many of the nearest unvisited places */
const NEAREST = 3;
const GUIDE_AHEAD = 1.1;
/** pixels the header, dock and screen edge keep for the HUD */
const INSET = { top: 92, bottom: 80, side: 12 };
/** NDC kept clear of the screen edge, then the band over which a marker hands over to its edge arrow */
const MARGIN = 0.12;
const FADE = 0.1;
/** how far (world units) the camera ray to the roofline must clear the ground to count as fully in view */
const LIMB_FADE = 0.35;
const ease = (v: number) => Math.min(1, Math.max(0, v));
const reduced = typeof window === "undefined" ? null : window.matchMedia("(prefers-reduced-motion: reduce)");

const arrowGeo = merge([
  part(cone(0.3, 0.42), [0, 0.21, 0], { rot: [Math.PI, 0, 0] }),
  part(cyl(0.13, 0.13, 0.36), [0, 0.58, 0]),
]);
const checkGeo = merge([
  part(box(0.12, 0.3, 0.12, 0.05), [-0.09, 0.14, 0], { rot: [0, 0, 0.75] }),
  part(box(0.12, 0.56, 0.12, 0.05), [0.12, 0.25, 0], { rot: [0, 0, -0.6] }),
]);
const guideShape = new Shape()
  .moveTo(0, 0.42)
  .lineTo(0.3, 0.05)
  .lineTo(0.11, 0.05)
  .lineTo(0.11, -0.32)
  .lineTo(-0.11, -0.32)
  .lineTo(-0.11, 0.05)
  .lineTo(-0.3, 0.05)
  .closePath();
// the shape's +Y becomes the surface frame's forward
const guideGeo = new ShapeGeometry(guideShape).rotateX(Math.PI / 2);
const guideMat = new MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide });

const identity = STATIONS.map((s) => new Color(IDENTITY[s.id].top));
const accent = new Color(ACCENT);
const white = new Color("#ffffff");
const tint = new Color();
const m = new Matrix4();
const s3 = new Vector3();
const p3 = new Vector3();
const fwd = new Vector3();
const anchor = new Vector3();
const ray = new Vector3();
const camX = new Vector3();
const camY = new Vector3();
const camZ = new Vector3();
const ndc = new Vector3();
const vis = new Float32Array(N);
const dirX = new Float32Array(N);
const dirY = new Float32Array(N);
const dist = new Float32Array(N);
const ranked = new Float32Array(N);
/** HUD boxes the edge arrows slide around, re-measured every few frames */
let hud: DOMRect[] = [];
let measured = 0;
/** tag widths in pixels, re-measured every few frames so the clamp never forces a layout per frame */
const tagW = new Float32Array(N);
let tick = 0;
/** pixels a name tag keeps from the left and right screen edges */
const TAG_EDGE = 8;

/** 0 an arrow, 1 a check: eased so a fresh visit turns over instead of popping */
const done = new Float32Array(N);

/**
 * How far the camera ray to `a` clears the planet before reaching it: negative once the ground
 * hides it. Measured at the ray's closest approach to the centre, or at `a` if that lies beyond.
 */
export function clearance(cam: Vector3, a: Vector3) {
  ray.subVectors(a, cam);
  const t = ease(-cam.dot(ray) / ray.lengthSq());
  return ray.multiplyScalar(t).add(cam).length() - R;
}

interface WaypointsProps {
  near: StationId | null;
  inspecting: StationId | null;
  visited: ReadonlySet<StationId>;
  /** markers stay out of the intro's white sky */
  show: boolean;
}

/**
 * Everything that points at a landmark: a bouncing clay arrow over each one (a check once visited),
 * its name tag, screen-edge arrows for the ones out of view, and a ground arrow while travelling.
 */
export function Waypoints({ near, inspecting, visited, show }: WaypointsProps) {
  const arrows = useRef<InstancedMesh>(null);
  const checks = useRef<InstancedMesh>(null);
  const guide = useRef<Mesh>(null);
  const tags = useRef<(HTMLDivElement | null)[]>([]);
  const tagGroups = useRef<(Group | null)[]>([]);
  const live = useRef({ near, inspecting, visited, show });
  // rooflines; the GitHub plinth is nearly flat but its contribution bars stand up off it
  const roofs = useMemo(
    () =>
      STATIONS.map((s) => {
        const g = buildStation(s.id);
        g.computeBoundingBox();
        g.dispose();
        return R + Math.max(0.9, g.boundingBox!.max.y * LANDMARK_SCALE);
      }),
    [],
  );

  useEffect(() => {
    live.current = { near, inspecting, visited, show };
  }, [near, inspecting, visited, show]);

  useFrame(({ camera, clock, size }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const { near: talking, inspecting: focus, visited: lit, show: on } = live.current;
    const still = !!reduced?.matches;
    const t = clock.elapsedTime;
    const p = ctl.player.n;
    camera.updateMatrixWorld();
    // camera +Y is screen-up for any point, so markers offset along it sit straight above their anchor
    camera.matrixWorld.extractBasis(camX, camY, camZ);
    const a = arrows.current;
    const c = checks.current;
    // nothing points anywhere until the camera is back from the map's globe view
    const back = 1 - ctl.globe.t;
    const roaming = on && !ctl.frozen && ctl.intro === "ground" && back === 1;
    // the HUD's top and bottom bands count as off screen; the arrow rises from its tip, so the bottom needs no margin
    const top = 1 - (2 * INSET.top) / size.height - MARGIN;
    const bottom = -1 + (2 * INSET.bottom) / size.height;
    const side = 1 - (2 * INSET.side) / size.width - MARGIN;

    tick++;
    for (let i = 0; i < N; i++) {
      const id = STATIONS[i].id;
      const { n } = LANDMARKS[id];
      done[i] += ((lit.has(id) ? 1 : 0) - done[i]) * Math.min(1, dt * 6);
      anchor.copy(n).multiplyScalar(roofs[i]);
      const open = ease(clearance(camera.position, anchor) / LIMB_FADE);
      // the arrow is what has to fit on screen, so test its tip rather than the roof
      ndc.copy(anchor).addScaledVector(camY, ARROW_UP).project(camera);
      const ahead = ndc.z < 1;
      // a building cut by the side of the screen keeps its arrow over the part still showing
      p3.copy(anchor).addScaledVector(camY, ARROW_UP).addScaledVector(camX, HALF).project(camera);
      const halfW = p3.x - ndc.x;
      const over = Math.abs(ndc.x) - side;
      const slide = over > 0 && halfW > 1e-4 ? (-Math.sign(ndc.x) * Math.min(over, halfW) * HALF) / halfW : 0;
      const inside = Math.min(side + Math.max(0, halfW) - Math.abs(ndc.x), top - ndc.y, ndc.y - bottom);
      const v = (vis[i] = on && ahead ? open * ease(inside / FADE) * back : 0);
      // edge arrows point from the screen centre at the anchor, or along the walk there once it's over the limb
      let sx = ahead ? ndc.x : -ndc.x;
      let sy = ahead ? ndc.y : -ndc.y;
      if (open < 1) {
        anchor.copy(p).multiplyScalar(R);
        toward(p, n, fwd);
        p3.copy(anchor).add(fwd).project(camera);
        ndc.copy(anchor).project(camera);
        const wl = Math.hypot(p3.x - ndc.x, p3.y - ndc.y) || 1;
        const sl = Math.hypot(sx, sy) || 1;
        sx = ((p3.x - ndc.x) / wl) * (1 - open) + (sx / sl) * open;
        sy = ((p3.y - ndc.y) / wl) * (1 - open) + (sy / sl) * open;
      }
      dirX[i] = sx * size.width;
      dirY[i] = -sy * size.height;
      // a keeper's speech bubble owns the screen while it's up
      dist[i] = roaming && v < 1 && !talking && !lit.has(id) ? arc(p, n) : Infinity;

      const g = tagGroups.current[i];
      const el = tags.current[i];
      if (g) g.position.copy(n).multiplyScalar(roofs[i]).addScaledVector(camY, TAG_UP).addScaledVector(camX, slide);
      if (el) {
        el.style.opacity = !focus || id === focus ? v.toFixed(2) : "0";
        if (tick % 20 === 0 || !tagW[i]) tagW[i] = el.offsetWidth * 1.1;
        if (g && v > 0) {
          // the arrow over a wide tag can sit near the edge while the pill itself runs off it
          const x = (p3.copy(g.position).project(camera).x * 0.5 + 0.5) * size.width;
          const hw = tagW[i] / 2;
          const nudge = Math.max(0, TAG_EDGE + hw - x) - Math.max(0, x + hw - (size.width - TAG_EDGE));
          el.style.translate = `${nudge.toFixed(1)}px 0`;
        }
      }

      if (!a || !c) continue;
      const bob = still ? 0 : Math.sin(t * 3 + i * 1.3) * 0.14 * (1 - done[i]);
      m.makeBasis(camX, camY, camZ).setPosition(
        anchor
          .copy(n)
          .multiplyScalar(roofs[i])
          .addScaledVector(camY, ARROW_UP + bob)
          .addScaledVector(camX, slide),
      );
      a.setMatrixAt(i, m.scale(s3.setScalar(v * (1 - done[i]) + 1e-4)));
      // unvisited arrows breathe toward white, a soft glow without an emissive material
      const glow = still ? 0.1 : (Math.sin(t * 2.4 + i) * 0.5 + 0.5) * 0.2;
      a.setColorAt(i, tint.copy(identity[i]).lerp(white, Math.max(glow, 1 - v)));
      m.makeBasis(camX, camY, camZ).setPosition(
        anchor.copy(n).multiplyScalar(roofs[i]).addScaledVector(camY, CHECK_UP).addScaledVector(camX, slide),
      );
      c.setMatrixAt(i, m.scale(s3.setScalar(0.8 * v * done[i] + 1e-4)));
    }
    if (a && c) {
      a.instanceMatrix.needsUpdate = true;
      a.instanceColor!.needsUpdate = true;
      c.instanceMatrix.needsUpdate = true;
    }

    // keep only the nearest few unvisited places, so the screen edge stays readable
    ranked.set(dist);
    const cut = ranked.sort()[NEAREST - 1];
    if (roaming && ++measured % 20 === 1) {
      hud = [...document.querySelectorAll("[data-hud]")].map((e) => e.getBoundingClientRect()).filter((r) => r.width);
    }
    for (let i = 0; i < N; i++) {
      const el = ctl.edges[i];
      if (!el) continue;
      const fade = 1 - vis[i];
      const showEdge = roaming && !talking && fade > 0.02 && dist[i] <= cut;
      el.style.visibility = showEdge ? "visible" : "hidden";
      if (!showEdge) continue;
      el.style.opacity = fade.toFixed(2);
      const bearing = Math.atan2(dirX[i], -dirY[i]);
      const [x, y] = pinToEdge(
        size.width / 2,
        size.height / 2,
        Math.sin(bearing),
        -Math.cos(bearing),
        size.width,
        size.height,
        el,
      );
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      const pointer = el.firstElementChild as HTMLElement | null;
      if (pointer) pointer.style.transform = `rotate(${bearing}rad)`;
    }

    const g = guide.current;
    const tgt = ctl.target;
    if (g) {
      g.visible = roaming && !!tgt && arc(p, tgt.n) > GUIDE_AHEAD + 0.6;
      if (g.visible && tgt) {
        toward(p, tgt.n, fwd);
        p3.copy(p);
        walk(p3, fwd, GUIDE_AHEAD + (still ? 0 : ((t * 1.2) % 1) * 0.3));
        toward(p3, tgt.n, fwd);
        frameAt(p3, fwd, g.matrix, 0.04);
      }
    }
  });

  return (
    <>
      <instancedMesh ref={arrows} layers={OVERLAY} args={[arrowGeo, CLAY, N]} frustumCulled={false} />
      <instancedMesh ref={checks} layers={OVERLAY} args={[checkGeo, CLAY, N]} frustumCulled={false} onUpdate={paintChecks} />
      <mesh
        ref={guide}
        layers={OVERLAY}
        geometry={guideGeo}
        material={guideMat}
        matrixAutoUpdate={false}
        visible={false}
        renderOrder={2}
      />
      {STATIONS.map((s, i) => (
        <group
          key={s.id}
          ref={(g) => {
            tagGroups.current[i] = g;
          }}
        >
          <Tag
            station={s}
            near={near === s.id}
            lit={visited.has(s.id)}
            bind={(el) => {
              tags.current[i] = el;
            }}
          />
        </group>
      ))}
    </>
  );
}

function paintChecks(mesh: InstancedMesh) {
  if (mesh.instanceColor) return;
  for (let i = 0; i < N; i++) mesh.setColorAt(i, accent);
  mesh.instanceColor!.needsUpdate = true;
}

/**
 * Where a ray from (x, y) along (dx, dy) leaves the inset screen; a spot under a HUD box slides
 * along that edge to the nearer side of the box.
 */
function pinToEdge(x: number, y: number, dx: number, dy: number, w: number, h: number, el: HTMLElement) {
  const hw = el.offsetWidth / 2 + 6;
  const hh = el.offsetHeight / 2 + 6;
  const [l, r, t, b] = [INSET.side + hw, w - INSET.side - hw, INSET.top + hh, h - INSET.bottom - hh];
  x = Math.min(r, Math.max(l, x));
  y = Math.min(b, Math.max(t, y));
  let k = Infinity;
  if (dx > 1e-6) k = Math.min(k, (r - x) / dx);
  if (dx < -1e-6) k = Math.min(k, (l - x) / dx);
  if (dy > 1e-6) k = Math.min(k, (b - y) / dy);
  if (dy < -1e-6) k = Math.min(k, (t - y) / dy);
  if (Number.isFinite(k)) [x, y] = [x + dx * k, y + dy * k];
  const side = x <= l + 1 || x >= r - 1;
  for (const box of hud) {
    if (x + hw < box.left || x - hw > box.right || y + hh < box.top || y - hh > box.bottom) continue;
    if (side) {
      const below = box.bottom + hh;
      const above = box.top - hh;
      y = below <= b && (below - y < y - above || above < t) ? below : above;
    } else {
      const after = box.right + hw;
      const before = box.left - hw;
      x = after <= r && (after - x < x - before || before < l) ? after : before;
    }
  }
  return [x, y] as const;
}

interface TagProps {
  station: Station;
  near: boolean;
  lit: boolean;
  bind: (el: HTMLDivElement | null) => void;
}

function Tag({ station, near, lit, bind }: TagProps) {
  return (
    <Html center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div
        ref={bind}
        style={{ opacity: 0 }}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium text-black transition-[transform,border-color,opacity] max-sm:px-2 max-sm:text-[10px] ${
          near ? "scale-110 border-hq-accent" : "border-hq-line"
        }`}
      >
        {lit && <span className="size-1.5 rounded-full bg-hq-accent" />}
        {station.label}
      </div>
    </Html>
  );
}
