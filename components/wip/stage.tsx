"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useGLTF } from "@react-three/drei";
import { AnimationMixer, Euler, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, Quaternion, type AnimationAction, type AnimationClip, type Object3D } from "three";

/** Baked by `npm run wip` (scripts/wip.blend.py). */
const MODEL = "/models/wip.glb";
const DRACO = "/draco/";
const FADE = 0.35;
const FUN = ["Wave", "Hammer", "Dance", "Jump", "Trip", "Carry", "Typing"];
const POKES = ["Jump", "Wave", "Dance"];
const DOING: Record<string, string> = {
  Idle: "taking a breather",
  Wave: "saying hi",
  Hammer: "nailing up the sign",
  Dance: "dancing it out",
  Jump: "celebrating a green build",
  Trip: "tripping over nothing",
  Carry: "hauling a plank",
  Typing: "pushing a commit",
};

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
  const clay = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      o.material = clay;
      // the skinned bot leaves its bind-pose bounds when it jumps and walks
      o.frustumCulled = false;
    }
  });
  let clip = "";
  let bag: string[] = [];
  let idleFor = 1.6;
  const turn = { x: 0, y: 0 };

  const play = (name: string) => {
    const next = actions[name];
    if (!next || clip === name) return;
    next.reset().setLoop(name === "Idle" ? LoopRepeat : LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.fadeIn(FADE).play();
    if (clip) actions[clip].fadeOut(FADE);
    if (name === "Idle") idleFor = 2 + Math.random() * 3;
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

      // the head turns toward the cursor on top of the clip: fully at rest, a little mid-stunt, not at all face-down
      const w = { Idle: 1, Wave: 0.8, Typing: 0.5, Trip: 0 }[clip] ?? 0.35;
      const k = 1 - Math.exp(-dt * 6);
      turn.x += (px * 0.55 * w - turn.x) * k;
      turn.y += (-py * 0.3 * w - turn.y) * k;
      head.parent!.getWorldQuaternion(parent);
      look.setFromEuler(euler.set(turn.y, turn.x, 0));
      // a world-space turn carried into the head's parent space: P⁻¹ · look · P
      head.quaternion.premultiply(parent.clone().invert().multiply(look).multiply(parent));
    },
    dispose() {
      mixer.stopAllAction();
      clay.dispose();
    },
  };
}

/** onReady hands the parent a way to poke the bot, and null once it is gone. */
function Bot({ calm, onClip, onReady }: { calm: boolean; onClip: (name: string) => void; onReady: (poke: (() => void) | null) => void }) {
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

/** Frames the bot and its props: wide screens put it right of the text, tall ones at the bottom. */
function Framing() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const tan = Math.tan((35 / 2) * (Math.PI / 180));
    const wide = aspect > 1.1;
    const fit = wide ? 9.6 : 4.2; // world width that must stay in view
    const dist = Math.max(6.4, fit / (2 * tan * aspect));
    camera.position.set(0.5, 1.9 + dist * 0.06, dist);
    camera.lookAt(wide ? -1.9 : 0, wide ? 1.0 : 1.0 + dist * 0.12, 0);
  }, [camera, size]);
  return null;
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
      <div className="absolute inset-0 cursor-pointer" onClick={() => poke.current?.()} aria-hidden>
        <Canvas
          flat
          dpr={[1, 2]}
          camera={{ fov: 35, near: 0.1, far: 100 }}
          fallback={<p className="p-5 text-sm text-hq-mute">Your browser can&apos;t draw my little builder, but the new site is still coming.</p>}
        >
          <hemisphereLight args={["#eaf2ff", "#f3e3c8", 1.25]} />
          <directionalLight color="#fff3e2" intensity={2.2} position={[-3, 7, 6]} />
          <Suspense fallback={null}>
            <Bot calm={calm} onClip={setClip} onReady={onReady} />
          </Suspense>
          <ContactShadows position={[0, 0.005, 0]} scale={9} blur={2.4} opacity={0.35} far={3} resolution={512} frames={calm ? 1 : Infinity} />
          <Framing />
        </Canvas>
      </div>
      <div
        className={`pointer-events-none absolute inset-0 grid place-items-center text-sm text-hq-mute transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`}
        role="status"
      >
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-hq-accent motion-safe:animate-ping" />
          Waking up the builder…
        </span>
      </div>
      <div className="pointer-events-none absolute right-5 bottom-5 z-10 flex flex-col items-end gap-2 sm:right-10 sm:bottom-10">
        <p className={`text-[12px] text-hq-mute transition-opacity ${ready ? "opacity-100" : "opacity-0"}`} aria-hidden>
          Bolt is {DOING[clip]}
        </p>
        <button
          type="button"
          onClick={() => poke.current?.()}
          className="pointer-events-auto rounded-full border border-hq-line bg-white/80 px-4 py-2 text-[13px] font-semibold text-hq-ink backdrop-blur transition hover:border-hq-accent hover:text-hq-accent active:scale-95"
        >
          Poke Bolt
        </button>
      </div>
    </>
  );
}

useGLTF.preload(MODEL, DRACO);
