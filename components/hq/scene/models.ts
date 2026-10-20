import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { BufferGeometry, Mesh } from "three";
import { STATIONS, type StationId } from "@/data/stations";

/**
 * Geometry baked ahead of time by `npm run models` (scripts/models.bake.ts), so the browser downloads
 * the clay instead of building it on the main thread. Each file holds named meshes.
 */
export type ModelName = "ground" | "sea" | "clouds" | "folk" | "rigs" | `station-${StationId}`;

export const MODELS: ModelName[] = ["ground", "sea", "clouds", "folk", "rigs", ...STATIONS.map(({ id }) => `station-${id}` as const)];

const DRACO = "/draco/";
const url = (name: ModelName) => `/models/${name}.glb`;
/** glTF keeps custom attributes under a leading underscore; the shaders read them bare. */
const CUSTOM = ["surf", "centre"];

/** Every mesh in a baked model by name. Suspends until the file is loaded. */
export function useModel(name: ModelName): Record<string, BufferGeometry> {
  const { nodes } = useGLTF(url(name), DRACO);
  return useMemo(() => {
    const out: Record<string, BufferGeometry> = {};
    for (const [key, node] of Object.entries(nodes)) {
      const geo = (node as Mesh).geometry;
      if (!geo) continue;
      for (const k of CUSTOM) {
        const a = geo.getAttribute(`_${k}`);
        if (a) geo.setAttribute(k, a).deleteAttribute(`_${k}`);
      }
      out[key] = geo;
    }
    return out;
  }, [nodes]);
}

if (typeof window !== "undefined") for (const name of MODELS) useGLTF.preload(url(name), DRACO);
