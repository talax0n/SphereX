import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  type Intersection,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Vector2,
  Vector3,
} from "three";
import { STATIONS, type StationId } from "@/data/stations";
import { ctl, setPing, setTarget } from "../game";
import { keyLight } from "./daylight";
import { RADIUS } from "./folk";
import { lampHits, toggleLamp } from "./lamps";
import { introScale } from "../hud/intro";
import { DENY, MOVE } from "./ping";
import { LANDMARKS, R, blocked, flatten, plinthAt } from "./planet";

/** Tilt of the view away from straight down; the horizon curves in near the top of the screen. Drag tilts it within the range. */
const PITCH = 1.0;
const MIN_PITCH = 0.55;
const MAX_PITCH = 1.3;
/** radians of orbit per pixel of drag */
const DRAG = 0.006;
let pitch = PITCH;
/** how steeply the camera looks down on a plinth, and how far into that view it has eased */
const ROOM_PITCH = 0.7;
let room = 0;
const orbit = new Quaternion();
const DIST = 18;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.6;
const INSPECT = 0.85;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const aim = ctl.player.n.clone();
const desired = new Vector3();
const north = ctl.north.clone();
const side = new Vector3();
const lookAt = new Vector3();
const view = { x: 0, y: 0, dist: DIST };
/** close-up on the hovering player, eye level and front-on, so only white sky sits behind it */
const CLOSE_BACK = 5.2;
/** phones drop the close-up's subject this share of the screen below centre, under the chat thread */
const CLOSE_DROP = 0.12;
/** how far into the intro close-up the camera is; negative until the first frame picks a side */
let close = -1;
const closePos = new Vector3();
const closeAt = new Vector3();
const reduced = typeof window === "undefined" ? null : window.matchMedia("(prefers-reduced-motion: reduce)");
/** seconds for the fly out to the map's globe view and back */
const GLOBE_TIME = 0.6;
/** the globe's radius on screen, roofs included, with a margin for the map header */
const GLOBE_FIT = (R + 1.5) * 1.12;
const GLOBE_DROP = 48;
let globe = 0;
const from = new Vector3();
const swing = new Quaternion();
const part = new Quaternion();

/** Distance at which the whole planet fits the narrower of the two fields of view. */
function globeDist(cam: PerspectiveCamera) {
  const half = (cam.fov * Math.PI) / 360;
  return GLOBE_FIT / Math.sin(Math.min(half, Math.atan(Math.tan(half) * cam.aspect)));
}

/**
 * Messenger-style follow cam: it hovers behind the player along the carried `ctl.north`, so the
 * planet turns underneath. The light rides with it, which is why nothing bakes a shadow map.
 */
export function CameraRig() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      ctl.zoomMul = clamp(ctl.zoomMul * Math.exp(-e.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
    };
    // drag orbits around the player; turning the carried north keeps WASD, the minimap and the ping in step
    let last: { id: number; x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (!last && !ctl.frozen) last = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== last?.id || ctl.frozen) return;
      orbit.setFromAxisAngle(ctl.player.n, (e.clientX - last.x) * DRAG);
      flatten(ctl.north.applyQuaternion(orbit), ctl.player.n);
      pitch = clamp(pitch + (e.clientY - last.y) * DRAG * 0.5, MIN_PITCH, MAX_PITCH);
      last = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === last?.id) last = null;
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [gl]);

  useFrame(({ size, camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const k = 1 - Math.exp(-dt * 4);
    const narrow = size.width < 640;
    const cam = camera as PerspectiveCamera;

    let dist = DIST / ctl.zoomMul;
    let ox = 0;
    let oy = 0;
    if (ctl.focus) {
      const { n, door } = LANDMARKS[ctl.focus];
      // between the landmark and its door, so the diorama and the keeper both fit
      desired.copy(n).lerp(door, 0.35).normalize();
      dist = Math.min(dist, DIST) * (narrow ? 1.25 : INSPECT);
      // shift the projection so the station sits in the space beside the panel
      if (narrow) oy = size.height * 0.25;
      else ox = Math.min(460, size.width * 0.42) / 2 + 12;
    } else {
      desired.copy(ctl.player.n);
    }
    // on a plinth, come in closer and look down more steeply, over the walls into the room
    const on = !ctl.focus && !ctl.globe.open && !!plinthAt(ctl.player.n);
    room += ((on ? 1 : 0) - room) * k;
    dist *= 1 - 0.3 * room;
    const tilt = pitch + (Math.min(pitch, ROOM_PITCH) - pitch) * room;
    if (narrow) dist *= 1.05;
    // the map's header sits over the top of the globe, so the globe sits a little lower
    if (ctl.globe.open) oy = -GLOBE_DROP;

    aim.lerp(desired, k).normalize();
    // ease toward the carried north; a half-turn needs a sideways nudge or the lerp never leaves home
    if (north.dot(ctl.north) < -0.5) north.addScaledVector(side.crossVectors(aim, north), 0.3);
    north.lerp(ctl.north, k * 0.8);
    if (flatten(north, aim).lengthSq() === 0) north.copy(ctl.north);
    view.dist += (dist - view.dist) * k;

    // the crouch before the jump still plays in the close-up
    const hover = ctl.intro === "hover" || ctl.intro === "crouch" ? 1 : 0;
    close = close < 0 || reduced?.matches ? hover : close + (hover - close) * k;
    const c = close * close * (3 - 2 * close);

    lookAt.copy(aim).multiplyScalar(R + 0.5);
    camera.position
      .copy(lookAt)
      .addScaledVector(aim, view.dist * Math.cos(tilt))
      .addScaledVector(north, -view.dist * Math.sin(tilt));
    camera.up.copy(aim);
    if (c > 0) {
      const p = ctl.player.n;
      closeAt.copy(p).multiplyScalar(R + ctl.alt + 0.45);
      // phones are tall and narrow, so back off further to keep the character and the bubble in frame
      const back = narrow ? 1.45 : 1;
      closePos.copy(closeAt).addScaledVector(north, -CLOSE_BACK * back);
      camera.position.lerp(closePos, c);
      lookAt.lerp(closeAt, c);
      camera.up.lerp(p, c).normalize();
      // the bubble needs room beside the character on wide screens and above it on phones
      if (narrow) oy += (-size.height * CLOSE_DROP - oy) * c;
      else ox += (Math.min(220 * introScale(size.width, size.height), size.width * 0.14) - ox) * c;
    }

    const want = ctl.globe.open ? 1 : 0;
    globe = reduced?.matches ? want : clamp(globe + Math.sign(want - globe) * (dt / GLOBE_TIME), 0, 1);
    const g = (ctl.globe.t = globe * globe * (3 - 2 * globe));
    if (g > 0) {
      // swing around the planet rather than straight through it, which a spun globe would ask for
      from.copy(camera.position).normalize();
      swing.setFromUnitVectors(from, ctl.globe.dir);
      const len = camera.position.length() + (globeDist(cam) - camera.position.length()) * g;
      camera.position.copy(from).applyQuaternion(part.identity().slerp(swing, g)).multiplyScalar(len);
      lookAt.multiplyScalar(1 - g);
      camera.up.lerp(ctl.globe.up, g).normalize();
    }
    camera.lookAt(lookAt);
    view.x += (ox - view.x) * k;
    view.y += (oy - view.y) * k;
    cam.setViewOffset(size.width, size.height, view.x, view.y, size.width, size.height);

    // key light over the camera's left shoulder, wherever on the planet that is
    keyLight.position.copy(camera.position).addScaledVector(aim, 8).addScaledVector(side.crossVectors(north, aim), -6);
    keyLight.target.position.copy(lookAt);
    keyLight.target.updateMatrixWorld();
  });
  return <primitive object={keyLight} />;
}

const ray = new Raycaster();
const ndc = new Vector2();
const planet = new Sphere(new Vector3(), R);
const hit = new Vector3();
const found: Intersection[] = [];

/** The lamp under the ray, if nothing nearer (the ground at `ground`, or `limit`) is in front of it. */
function lampUnder(ground: number, limit = Infinity): number {
  found.length = 0;
  const lamp = ray.intersectObjects(lampHits, false, found)[0];
  return lamp && lamp.distance < Math.min(ground + 0.1, limit) ? (lamp.object.userData.lamp as number) : -1;
}

function nearestStation(p: Vector3): StationId {
  let best = STATIONS[0].id;
  let max = -Infinity;
  for (const s of STATIONS) {
    const d = p.dot(LANDMARKS[s.id].n);
    if (d > max) [max, best] = [d, s.id];
  }
  return best;
}

/** One pointer handler: a lamp or landmark first, otherwise the clicked point on the planet. */
export function ClickToMove({ onTravel }: { onTravel: (id: StationId) => void }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const el = gl.domElement;
    let down: [number, number] | null = null;
    let pending: PointerEvent | null = null;
    const aimAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectSphere(planet, hit) ? ray.ray.origin.distanceTo(hit) : Infinity;
    };
    const onHover = () => {
      const e = pending;
      pending = null;
      if (e) el.style.cursor = lampUnder(aimAt(e)) >= 0 ? "pointer" : "";
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons || e.pointerType !== "mouse" || ctl.frozen) return;
      if (!pending) requestAnimationFrame(onHover);
      pending = e;
    };
    const onLeave = () => {
      pending = null;
      el.style.cursor = "";
    };
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (!down || ctl.frozen || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
      const ground = aimAt(e);
      const tagged: Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData.landmark) tagged.push(o);
      });
      const first = ray.intersectObjects(tagged, false)[0];
      const lamp = lampUnder(ground, first?.distance);
      if (lamp >= 0) return toggleLamp(lamp);
      if (first && first.distance < ground + 0.5) return onTravel(nearestStation(first.point.normalize()));
      if (ground < Infinity) {
        setTarget(hit, null);
        // the walker still goes as near as it can, but the marker says the spot itself is taken
        const taken = blocked(hit.normalize(), RADIUS, true);
        setPing(hit, taken ? "deny" : "move", taken ? DENY : MOVE);
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.style.cursor = "";
    };
  }, [gl, camera, scene, onTravel]);
  return null;
}
