"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrthographicCamera } from "@react-three/drei";
import { Color, Euler, type InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from "three";
import { STATIONS } from "@/data/stations";
import { CLAY } from "./scene/clay";
import { useModel } from "./scene/models";
import {
  BACKS,
  BLOB,
  BOTTOMS,
  CHORE,
  EYES,
  FACES,
  HAIRS,
  HATS,
  KING,
  NECKS,
  PLAIN,
  PLAYER,
  PROPS,
  RIG,
  SCALE,
  TOPS,
  WEAR,
  type Look,
  type Wear,
  dressUp,
  keeperLook,
  limbs,
  lookOf,
  seedOf,
  skull,
  sleeve,
  worn,
} from "./scene/folk";
import { type Gesture, blankPose, poseOf } from "./scene/gesture";
import { blobTexture } from "./scene/props";

interface Who {
  look: Look;
  label: string;
  x: number;
  y: number;
  /** the gesture it plays, in the `?chore` view */
  gest?: Gesture;
}

const row = (looks: [Look, string][], y: number, gap: number): Who[] =>
  looks.map(([look, label], k) => ({ look, label, x: (k - (looks.length - 1) / 2) * gap, y }));

function cast(view: View): Who[] {
  const staff = STATIONS.map((s, k): [Look, string] => [keeperLook(s.id, k), s.id]);
  // the first sixteen villagers
  const seeds = Array.from({ length: 16 }, (_, i): [Look, string] => [lookOf(seedOf(i)), `#${i}`]);
  if (view === "chore") return cast("keepers").map((w) => ({ ...w, gest: CHORE[w.label as keyof typeof CHORE] }));
  if (view === "keepers") return [...row(staff.slice(0, 4), 1.35, 1.25), ...row(staff.slice(4), 0, 1.25)];
  if (view === "wear") return wardrobe();
  if (view === "seeds") return [...row(seeds.slice(0, 8), 1.35, 1.1), ...row(seeds.slice(8), 0, 1.1)];
  return [
    ...row([[PLAYER, "you"], [dressUp(PLAYER, KING), "king"], ...staff], 2.9, 1),
    ...row(seeds.slice(0, 8), 1.45, 1),
    ...row(seeds.slice(8), 0, 1),
  ];
}

const SLOTS = [
  ["face", FACES],
  ["bottom", BOTTOMS],
  ["top", TOPS],
  ["hat", HATS],
  ["hair", HAIRS],
  ["neck", NECKS],
  ["back", BACKS],
  ["eyes", EYES],
  ["prop", PROPS],
] as const;

/** One plain person per wearable kind, wearing only that. */
function wardrobe(): Who[] {
  const plain: Look = { ...lookOf(seedOf(7), false), top: null, hat: null, hair: null, neck: null, back: null, eyes: null, prop: null };
  const all = SLOTS.flatMap(([slot, kinds]) =>
    kinds.map((kind): [Look, string] => {
      const baked = slot === "face" || slot === "prop" || kind === "crown" || kind === "medal" || kind === "shades";
      const color = baked ? PLAIN : new Color(slot === "hair" ? "#4a3224" : "#e58f7a");
      return [dressUp(plain, { [slot]: { kind, color } }), kind];
    }),
  );
  return Array.from({ length: Math.ceil(all.length / 12) }, (_, r) => row(all.slice(r * 12, r * 12 + 12), (3 - r) * 1.3, 1.05)).flat();
}

const KINDS = Object.keys(WEAR) as Wear[];
const STILL = blankPose();
const live = blankPose();
const lean = new Euler();
const NONE = new Matrix4().makeScale(0, 0, 0);
const UP = new Vector3(0, 1, 0);
const base = new Matrix4();
const nod = new Matrix4();
const torso = new Matrix4();
const blob = new Matrix4();
const shade = new Matrix4();
const rig = Array.from({ length: RIG }, () => new Matrix4());
const q = new Quaternion();
const v = new Vector3();
const s = new Vector3();

function Folks({ who, back, spin, at, yaw }: { who: Who[]; back: boolean; spin: boolean; at: number | null; yaw: number }) {
  const meshes = useRef<Record<string, InstancedMesh | null>>({});
  const frames = useRef(0);
  const n = who.length;
  // the blob texture draws on a canvas, so it can't be made during the server render
  const blobMat = useMemo(() => new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), []);

  useEffect(() => {
    const m = meshes.current;
    who.forEach(({ look }, i) => {
      m.head?.setColorAt(i, look.skin);
      m.body?.setColorAt(i, look.shirt);
      const arm = sleeve(look);
      [look.foot, look.foot, arm, arm, look.skin, look.skin].forEach((c, k) => m.nub?.setColorAt(i * 6 + k, c));
      for (const [k, c] of worn(look)) m[k]?.setColorAt(i, c);
    });
    for (const mesh of Object.values(m)) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [who]);

  useFrame(({ clock }) => {
    const m = meshes.current;
    const turn = yaw + (back ? Math.PI : 0) + (spin ? clock.elapsedTime * 0.6 : 0);
    who.forEach(({ look, x, y, gest }, i) => {
      const pose = gest ? poseOf(gest, at ?? clock.elapsedTime, 1, live) : STILL;
      base.compose(v.set(x, y, 0), q.setFromAxisAngle(UP, turn), s.set(SCALE * look.build, SCALE * look.height, SCALE * look.build));
      shade.copy(base);
      // the torso bone, as the crowd poses it: bounce, roll and squash
      const sq = Math.max(-0.25, Math.min(0.25, pose.squash));
      torso.compose(v.set(0, pose.bounce, 0), q.setFromEuler(lean.set(0, 0, pose.lean)), s.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5)).premultiply(base);
      skull(torso, look.head, pose.headYaw, nod);
      limbs(base, torso, pose, 0, 0, 0, 0, rig);
      m.head?.setMatrixAt(i, nod);
      m.body?.setMatrixAt(i, torso);
      for (let k = 0; k < 6; k++) m.nub?.setMatrixAt(i * 6 + k, rig[k]);
      m.blob?.setMatrixAt(i, base.copy(shade).multiply(blob.makeTranslation(0, 0.02, 0).scale(s.set(1.15, 1, 1.15))));
      const on = worn(look).map(([k]) => k);
      for (const k of KINDS) {
        const bone = WEAR[k].bone;
        m[k]?.setMatrixAt(i, !on.includes(k) ? NONE : bone === "head" ? nod : bone === "hand" ? rig[6] : torso);
      }
    });
    for (const mesh of Object.values(m)) if (mesh) mesh.instanceMatrix.needsUpdate = true;
    if (++frames.current === 10) document.body.dataset.ready = "";
  });

  const baked = useModel("folk");
  const layers: [string, number][] = [
    ["head", n],
    ["body", n],
    ["nub", n * 6],
    ...KINDS.map((k): [string, number] => [k, n]),
  ];
  return (
    <>
      {layers.map(([k, count]) => (
        <instancedMesh
          key={k}
          ref={(mesh) => {
            meshes.current[k] = mesh;
          }}
          args={[baked[k], CLAY, count]}
          frustumCulled={false}
        />
      ))}
      <instancedMesh
        ref={(mesh) => {
          meshes.current.blob = mesh;
        }}
        args={[BLOB, blobMat, n]}
        frustumCulled={false}
        renderOrder={1}
      />
      {who.map(({ label, x, y }) => (
        <Html key={label} position={[x, y - 0.08, 0.5]} center>
          <span style={{ font: "11px ui-monospace, monospace", color: "#6b6760", whiteSpace: "nowrap" }}>{label}</span>
        </Html>
      ))}
    </>
  );
}

type View = "all" | "keepers" | "seeds" | "wear" | "chore";

export function Lineup({ back, spin, view, at, yaw }: { back: boolean; spin: boolean; view: View; at: number | null; yaw: number }) {
  const who = cast(view);
  const centre = view === "all" ? 1.95 : view === "wear" ? 2.3 : 1.0;
  return (
    <main style={{ position: "fixed", inset: 0, background: "#f3f0ea" }}>
      <Canvas flat>
        <OrthographicCamera
          makeDefault
          position={[0, centre + 3, 12]}
          zoom={{ all: 124, keepers: 215, seeds: 140, wear: 98, chore: 215 }[view]}
          onUpdate={(c) => c.lookAt(0, centre, 0)}
        />
        <hemisphereLight args={["#eaf2ff", "#f3e3c8", 1.1]} />
        <directionalLight color="#fff3e2" intensity={2.1} position={[-4, 8, 10]} />
        <Suspense fallback={null}>
          <Folks who={who} back={back} spin={spin} at={at} yaw={yaw} />
        </Suspense>
      </Canvas>
    </main>
  );
}
