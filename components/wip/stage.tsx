"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useGLTF } from "@react-three/drei";
import {
  AnimationMixer,
  BackSide,
  Color,
  DataTexture,
  DoubleSide,
  Euler,
  InstancedMesh,
  LinearFilter,
  LoopOnce,
  LoopRepeat,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  Quaternion,
  RedFormat,
  SkinnedMesh,
  type AnimationAction,
  type AnimationClip,
} from "three";

/** Baked by `npm run wip` (scripts/wip.blend.py). */
const MODEL = "/models/wip.glb";
const DRACO = "/draco/";
const FADE = 0.4;
const FUN = ["Wave", "Hammer", "Dance", "Jump", "Trip", "Carry", "Sketch"];
const POKES = ["Jump", "Wave", "Dance"];
const DOING: Record<string, string> = {
  Idle: "taking a breather",
  Wave: "saying hi",
  Hammer: "nailing up the sign",
  Dance: "dancing it out",
  Jump: "celebrating a good day's work",
  Trip: "tripping over nothing",
  Carry: "hauling a plank",
  Sketch: "sketching the new rooms",
};
const SKY = "#dcebf2"; // the haze at the horizon; the ground fades into it
const INK = "#3b2a22";

function shuffled(last?: string): string[] {
  const a = [...FUN];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a[a.length - 1] === last) a.unshift(a.pop()!);
  return a;
}

function useReducedMotion(): boolean {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCalm(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  return calm;
}

/** Cel shading: a dark band, a soft painted edge, then full light. */
function toonRamp(): DataTexture {
  const t = new DataTexture(new Uint8Array([120, 128, 236, 255]), 4, 1, RedFormat);
  t.minFilter = t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** An inverted hull: the skinned mesh again, pushed out along its normals and drawn back faces only. */
function inkMaterial(width: number): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color: INK, side: BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <skinning_vertex>", `#include <skinning_vertex>\ntransformed += normalize(objectNormal) * ${width.toFixed(4)};`);
  };
  return m;
}

const look = new Quaternion();
const parent = new Quaternion();
const euler = new Euler(0, 0, 0, "YXZ");

type Rig = { frame: (dt: number, x: number, y: number) => void; poke: () => void };

/** Everything that mutates three.js state lives here, outside React's render. */
function rig(scene: Object3D, animations: AnimationClip[], onClip: (name: string) => void, calm: () => boolean): Rig & { dispose: () => void } {
  const mixer = new AnimationMixer(scene);
  const actions = Object.fromEntries(animations.map((c) => [c.name, mixer.clipAction(c)])) as Record<string, AnimationAction>;
  const head = scene.getObjectByName("head")!;
  const rest = head.quaternion.clone();
  const ramp = toonRamp();
  const paint = new MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const ink = inkMaterial(0.0055);
  const hulls: SkinnedMesh[] = [];
  const skinned: SkinnedMesh[] = [];
  scene.traverse((o) => {
    if (o instanceof SkinnedMesh) skinned.push(o);
  });
  for (const o of skinned) {
    o.material = paint;
    // Nao walks and jumps out of the bind-pose bounds
    o.frustumCulled = false;
    if (o.name.startsWith("nao")) {
      const hull = new SkinnedMesh(o.geometry, ink);
      hull.bind(o.skeleton, o.bindMatrix);
      hull.position.copy(o.position);
      hull.quaternion.copy(o.quaternion);
      hull.scale.copy(o.scale);
      hull.frustumCulled = false;
      o.parent!.add(hull);
      hulls.push(hull);
    }
  }
  let clip = "";
  let bag: string[] = [];
  let idleFor = 1.6;
  const turn = { x: 0, y: 0 };

  const play = (name: string) => {
    const next = actions[name];
    if (!next || clip === name) return;
    next.reset().setLoop(name === "Idle" ? LoopRepeat : LoopOnce, Infinity);
    next.clampWhenFinished = true;
    // the very first clip starts at full weight: fading in from the bind pose would flash every prop
    if (clip) {
      next.fadeIn(FADE);
      actions[clip].fadeOut(FADE);
    }
    next.play();
    if (name === "Idle") idleFor = 2.5 + Math.random() * 3;
    clip = name;
    onClip(name);
  };
  play("Idle");
  idleFor = 1.6;

  return {
    poke: () => play(POKES.filter((n) => n !== clip)[Math.floor(Math.random() * 2)]),
    frame(dt, px, py) {
      head.quaternion.copy(rest);
      mixer.update(Math.min(dt, 0.1));
      const a = actions[clip];
      if (clip === "Idle") {
        if (!calm() && a.time > idleFor) {
          if (!bag.length) bag = shuffled();
          const next = bag.shift()!;
          if (!bag.length) bag = shuffled(next);
          play(next);
        }
      } else if (a.time >= a.getClip().duration - FADE) play("Idle");

      // the head turns toward the cursor on top of the clip: fully at rest, a little mid-task, not at all mid-stumble
      const w = { Idle: 1, Wave: 0.8, Sketch: 0.3, Trip: 0 }[clip] ?? 0.35;
      const k = 1 - Math.exp(-dt * 5);
      turn.x += (px * 0.5 * w - turn.x) * k;
      turn.y += (-py * 0.25 * w - turn.y) * k;
      head.parent!.getWorldQuaternion(parent);
      look.setFromEuler(euler.set(turn.y, turn.x, 0));
      // a world-space turn carried into the head's parent space: P⁻¹ · look · P
      head.quaternion.premultiply(parent.clone().invert().multiply(look).multiply(parent));
    },
    dispose() {
      mixer.stopAllAction();
      for (const h of hulls) h.removeFromParent();
      paint.dispose();
      ink.dispose();
      ramp.dispose();
    },
  };
}

/** onReady hands the parent a way to poke Nao, and null once Nao is gone. */
function Nao({ calm, onClip, onReady }: { calm: boolean; onClip: (name: string) => void; onReady: (poke: (() => void) | null) => void }) {
  const { scene, animations } = useGLTF(MODEL, DRACO);
  const ctl = useRef<Rig | null>(null);
  const calmRef = useRef(calm);
  useEffect(() => {
    calmRef.current = calm;
  }, [calm]);

  useEffect(() => {
    const r = rig(scene, animations, onClip, () => calmRef.current);
    ctl.current = r;
    onReady(r.poke);
    return () => {
      ctl.current = null;
      onReady(null);
      r.dispose();
    };
  }, [scene, animations, onClip, onReady]);

  useFrame(({ pointer }, dt) => ctl.current?.frame(dt, pointer.x, pointer.y));

  return <primitive object={scene} />;
}

/** A meadow that fades into the haze, so there is no hard edge to the world. */
function Meadow() {
  const ramp = useMemo(() => toonRamp(), []);
  useEffect(() => () => ramp.dispose(), [ramp]);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
      <circleGeometry args={[60, 48]} />
      <meshToonMaterial color="#a9cc78" gradientMap={ramp} />
    </mesh>
  );
}

const PETALS = 36;
const dummy = new Object3D();

/** Petals and leaves drifting past on the breeze. */
function Petals({ calm }: { calm: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: PETALS }, (_, i) => ({
        x: ((i * 7.31) % 12) - 6,
        y: 0.3 + ((i * 3.17) % 3.4),
        z: ((i * 5.13) % 5) - 3.5,
        s: 0.6 + ((i * 1.7) % 1) * 0.6,
        p: i * 1.3,
      })),
    [],
  );
  const colors = useMemo(() => ["#fff8ee", "#f6c9c4", "#cfe39a"].map((c) => new Color(c)), []);
  useEffect(() => {
    const m = ref.current!;
    seeds.forEach((_, i) => m.setColorAt(i, colors[i % 3]));
    m.instanceColor!.needsUpdate = true;
  }, [seeds, colors]);
  useFrame(({ clock }) => {
    const m = ref.current!;
    const t = calm ? 0 : clock.elapsedTime;
    seeds.forEach((d, i) => {
      const x = ((d.x + t * 0.35 * d.s + 6) % 12) - 6;
      dummy.position.set(x, d.y + Math.sin(t * 0.8 + d.p) * 0.25, d.z + Math.cos(t * 0.5 + d.p) * 0.2);
      dummy.rotation.set(t * 1.3 * d.s + d.p, t * 0.9 + d.p, t * 0.7 * d.s);
      dummy.scale.setScalar(0.045 * d.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PETALS]} frustumCulled={false}>
      <circleGeometry args={[1, 6]} />
      <meshBasicMaterial side={DoubleSide} transparent opacity={0.9} />
    </instancedMesh>
  );
}

/** Frames Nao and the props: wide screens put them right of the text, tall ones at the bottom. */
function Framing() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const tan = Math.tan((32 / 2) * (Math.PI / 180));
    const wide = aspect > 1.1;
    const fit = wide ? 8.2 : 3.7; // world width that must stay in view
    const dist = Math.max(6.2, fit / (2 * tan * aspect));
    camera.position.set(0.4, 1.5 + dist * 0.05, dist);
    camera.lookAt(wide ? -1.45 : 0, wide ? 1.05 : 1.0 + dist * 0.11, 0);
  }, [camera, size]);
  return null;
}

const CLOUDS = [
  { top: 8, w: 260, d: 140, delay: -20, x: 10 },
  { top: 18, w: 180, d: 110, delay: -75, x: 55 },
  { top: 4, w: 340, d: 170, delay: -120, x: 80 },
  { top: 28, w: 140, d: 95, delay: -40, x: 30 },
];

/** A painted sky behind the canvas: soft gradient and slow clouds. */
function Sky() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(180deg, #8fc0e8 0%, #b9d8ef 38%, ${SKY} 62%)` }} aria-hidden>
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="wip-cloud absolute left-0"
          style={{ top: `${c.top}%`, width: c.w, height: c.w * 0.38, transform: `translateX(${c.x}vw)`, ["--d" as string]: `${c.d}s`, ["--delay" as string]: `${c.delay}s` }}
        >
          <div className="absolute inset-x-[10%] bottom-0 h-[55%] rounded-full bg-white/85 blur-[6px]" />
          <div className="absolute top-[8%] left-[22%] h-[70%] w-[38%] rounded-full bg-white/90 blur-[5px]" />
          <div className="absolute top-[22%] left-[48%] h-[58%] w-[32%] rounded-full bg-white/85 blur-[5px]" />
        </div>
      ))}
    </div>
  );
}

export function WipStage() {
  const calm = useReducedMotion();
  const poke = useRef<(() => void) | null>(null);
  const [clip, setClip] = useState("Idle");
  const [ready, setReady] = useState(false);
  const onReady = useCallback((p: (() => void) | null) => {
    poke.current = p;
    if (p) setReady(true);
  }, []);

  return (
    <>
      <Sky />
      <div className="absolute inset-0 cursor-pointer" onClick={() => poke.current?.()} aria-hidden>
        <Canvas
          flat
          dpr={[1, 2]}
          camera={{ fov: 32, near: 0.1, far: 120 }}
          fallback={<p className="p-5 text-sm text-hq-mute">Your browser can&apos;t draw Nao, but the new site is still coming.</p>}
        >
          <fog attach="fog" args={[SKY, 14, 40]} />
          <hemisphereLight args={["#e4eeff", "#d8e2b0", 1.5]} />
          <directionalLight color="#fff0d8" intensity={2.1} position={[-4, 7, 6]} />
          <Meadow />
          <Suspense fallback={null}>
            <Nao calm={calm} onClip={setClip} onReady={onReady} />
          </Suspense>
          <ContactShadows position={[0, 0.004, 0]} scale={9} blur={2.6} opacity={0.32} far={3} resolution={512} color="#2f4a1c" frames={calm ? 1 : Infinity} />
          <Petals calm={calm} />
          <Framing />
        </Canvas>
      </div>
      <div
        className={`pointer-events-none absolute inset-0 grid place-items-center text-sm text-hq-ink/70 transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}
        role="status"
      >
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-hq-accent motion-safe:animate-ping" />
          Waking up Nao…
        </span>
      </div>
      <div className="pointer-events-none absolute right-5 bottom-5 z-10 flex flex-col items-end gap-2 sm:right-10 sm:bottom-10">
        <p className={`rounded-full bg-white/60 px-3 py-1 text-[12px] text-hq-ink/75 backdrop-blur transition-opacity ${ready ? "opacity-100" : "opacity-0"}`} aria-hidden>
          Nao is {DOING[clip]}
        </p>
        <button
          type="button"
          onClick={() => poke.current?.()}
          className="pointer-events-auto rounded-full border border-hq-line bg-white/80 px-4 py-2 text-[13px] font-semibold text-hq-ink backdrop-blur transition hover:border-hq-accent hover:text-hq-accent active:scale-95"
        >
          Say hi to Nao
        </button>
      </div>
    </>
  );
}

useGLTF.preload(MODEL, DRACO);
