import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type InstancedMesh, Matrix4, MeshBasicMaterial, type Object3D } from "three";
import { STATIONS, type StationId } from "@/data/stations";
import { ctl } from "../game";
import { ACCENT, CLAY, TONE, box, paint } from "./clay";
import { PLINTH_HEIGHT } from "./dioramas";
import { useModel } from "./models";
import { LANDMARKS } from "./planet";
import { blobTexture, buildDecals, softSquare } from "./props";

/** Static props never move again, so skip their per-frame matrix work. */
export function freeze(o: Object3D | null) {
  if (!o) return;
  o.matrixAutoUpdate = false;
  o.updateMatrix();
}

const baseTile = new Color("#e9e7e2");
const accent = new Color(ACCENT);
const POP = 0.45;
const tileGeo = paint(box(0.85, 0.06, 0.85, 0.06).clone(), TONE.white);
/** each plinth's front-right corner, wherever its edge is */
const tileAt = STATIONS.map(({ id }) => {
  const c = LANDMARKS[id].half - 0.55;
  return new Matrix4().makeTranslation(c, PLINTH_HEIGHT + 0.03, c);
});
const m = new Matrix4();
const scale = new Matrix4();
const tint = new Color();

interface TileState {
  lit: number;
  pop: number;
}

interface WorldProps {
  near: StationId | null;
  inspecting: StationId | null;
  visited: ReadonlySet<StationId>;
}

/** The terrain and its painted shadows, a stage apart from the stations so neither build freezes a phone for long. */
export function Ground() {
  const { ground } = useModel("ground");
  const decals = useMemo(() => buildDecals(), []);
  const squareMat = useMemo(
    () => new MeshBasicMaterial({ map: softSquare(), transparent: true, opacity: 0.45, depthWrite: false, color: "#3a3226" }),
    [],
  );
  const roundMat = useMemo(
    () => new MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.6, depthWrite: false }),
    [],
  );
  return (
    <>
      <mesh ref={freeze} geometry={ground} material={CLAY} />
      <mesh ref={freeze} geometry={decals.squares} material={squareMat} renderOrder={1} />
      <mesh ref={freeze} geometry={decals.rounds} material={roundMat} renderOrder={1} />
    </>
  );
}

/** One station on its plinth, baked in place on the planet. */
function Landmark({ id }: { id: StationId }) {
  return <mesh ref={freeze} geometry={useModel(`station-${id}`)[id]} material={CLAY} userData={{ landmark: true }} />;
}

export function World({ near, inspecting, visited }: WorldProps) {
  const tiles = useRef<InstancedMesh>(null);
  const tileState = useRef<TileState[]>(STATIONS.map(() => ({ lit: 0, pop: POP })));
  const seen = useRef(new Set<StationId>());
  const live = useRef({ near, inspecting });

  useEffect(() => {
    live.current = { near, inspecting };
  }, [near, inspecting]);

  useEffect(() => {
    STATIONS.forEach((s, i) => {
      if (visited.has(s.id) && !seen.current.has(s.id)) {
        seen.current.add(s.id);
        tileState.current[i].pop = 0;
      }
    });
  }, [visited]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const k = 1 - Math.exp(-dt * 6);
    const { near: nearId, inspecting: focus } = live.current;
    const cel = ctl.celebrate;
    if (cel.active) cel.t += dt;
    const mesh = tiles.current;
    for (let i = 0; i < STATIONS.length; i++) {
      const id = STATIONS[i].id;
      const t = tileState.current[i];
      const on = seen.current.has(id) ? 1 : 0;
      const hot = id === nearId || id === focus ? 1 : 0;
      t.lit += (on - t.lit) * k;
      if (t.pop < POP) t.pop += dt;
      const pulseT = cel.t - i * 0.08;
      const bump = t.pop < POP ? Math.sin((Math.PI * t.pop) / POP) : 0;
      const pulse = pulseT > 0 && pulseT < POP ? Math.sin((Math.PI * pulseT) / POP) : 0;
      const sx = 1 + 0.22 * bump + 0.18 * pulse + hot * 0.06;
      if (mesh) {
        m.multiplyMatrices(LANDMARKS[id].frame, tileAt[i]).multiply(scale.makeScale(sx, 1 + 0.5 * (bump + pulse), sx));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, tint.lerpColors(baseTile, accent, t.lit));
      }
    }
    if (mesh) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
    if (cel.t > 2.6) cel.active = false;
  });

  return (
    <>
      {STATIONS.map(({ id }) => (
        <Landmark key={id} id={id} />
      ))}
      <instancedMesh
        ref={tiles}
        args={[tileGeo, CLAY, STATIONS.length]}
        frustumCulled={false}
        userData={{ landmark: true }}
      />
    </>
  );
}
