import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { type InstancedMesh, Matrix4, Vector3 } from "three";
import { STONES_MAX, type Stone } from "@/data/stones";
import { ctl } from "../game";
import { CLAY, TONE, ball, merge, part } from "./clay";
import { NORTH_POLE, R, arc, frameAt, standLift, toward } from "./planet";

/** name tags show only for stones this close (surface units), and for at most this many */
const NEAR = 4;
const TAGS = 4;

/** three flattened pebbles, stacked */
const cairn = merge([
  part(ball(0.2, 8, 6), [0, 0.08, 0], { scale: [1, 0.55, 0.9], tone: TONE.mid }),
  part(ball(0.14, 8, 6), [0.02, 0.22, 0.01], { scale: [1, 0.6, 0.9], tone: TONE.light }),
  part(ball(0.09, 8, 6), [-0.01, 0.31, 0], { scale: [1, 0.65, 1], tone: TONE.white }),
]);

const m = new Matrix4();
const dir = new Vector3();
const fwd = new Vector3();
const at = new Vector3();
const hits: { i: number; d: number }[] = [];

/** Small clay cairns where visitors left them, in one draw call; the few nearest the player wear their name. */
export function Stones({ stones }: { stones: Stone[] }) {
  const mesh = useRef<InstancedMesh>(null);
  const spots = useRef<Vector3[]>([]);
  const [near, setNear] = useState<number[]>([]);
  const tick = useRef(0);

  useEffect(() => {
    const mesh_ = mesh.current;
    if (!mesh_) return;
    spots.current = stones.slice(0, STONES_MAX).map((s, i) => {
      const n = new Vector3(...s.n).normalize();
      // a steady turn per stone so the row of cairns doesn't look stamped
      fwd.copy(toward(n, NORTH_POLE, dir));
      if (fwd.lengthSq() === 0) fwd.set(1, 0, 0);
      fwd.applyAxisAngle(n, s.at % 6.28);
      mesh_.setMatrixAt(i, frameAt(n, fwd, m, standLift(n)));
      return n;
    });
    mesh_.count = spots.current.length;
    mesh_.instanceMatrix.needsUpdate = true;
    tick.current = 0;
  }, [stones]);

  useFrame(() => {
    if (++tick.current % 10 !== 1) return;
    const p = ctl.player.n;
    hits.length = 0;
    spots.current.forEach((n, i) => {
      const d = arc(p, n);
      if (d < NEAR) hits.push({ i, d });
    });
    const next = hits.sort((a, b) => a.d - b.d).slice(0, TAGS).map((h) => h.i);
    setNear((now) => (now.length === next.length && now.every((v, k) => v === next[k]) ? now : next));
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[cairn, CLAY, STONES_MAX]} frustumCulled={false} />
      {near.map((i) => {
        const s = stones[i];
        if (!s) return null;
        at.set(...s.n).normalize();
        at.multiplyScalar(R + standLift(at) + 0.55);
        return (
          <group key={`${s.at}-${i}`} position={at.toArray()}>
            <Html center zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
              <div className="whitespace-nowrap rounded-full border border-hq-line bg-white px-2 py-0.5 text-[10px] font-medium text-black">
                {s.name}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
