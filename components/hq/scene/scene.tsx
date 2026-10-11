"use client";

import { useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import type { StationId } from "@/data/stations";
import type { GameState } from "../game";
import { CameraRig, ClickToMove } from "./camera";
import { Agents } from "./agents";
import { Confetti } from "./confetti";
import { Crowd } from "./crowd";
import { Daylight } from "./daylight";
import { Earth } from "./earth";
import { Globe } from "./globe";
import { GithubGrid } from "./github-grid";
import { IntroBubble } from "./intro";
import { Lamps } from "./lamps";
import type { Room } from "../use-room";
import { MinimapView } from "./minimap";
import { Ping } from "./ping";
import { Speech } from "./speech";
import { Waypoints } from "./waypoints";
import { World } from "./world";
import { Rigs, Screens } from "./workplaces";

interface SceneProps {
  state: GameState;
  target: StationId | null;
  room: Room;
  onTravel: (id: StationId) => void;
  onOpen: (id: StationId) => void;
  onNext: () => void;
  onSkip: () => void;
}

export default function Scene({ state, target, room, onTravel, onOpen, onNext, onSkip }: SceneProps) {
  const [dpr, setDpr] = useState(1.5);
  const near = state.mode === "exploring" ? state.near : null;
  const inspecting = state.mode === "inspecting" ? state.station : null;
  return (
    <Canvas
      flat
      dpr={dpr}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 30, near: 0.5, far: 160, position: [0, 30, 20] }}
      // clip, not hidden: focusing a button in an <Html> bubble would otherwise scroll the whole canvas away
      style={{ position: "absolute", inset: 0, touchAction: "none", overflow: "clip" }}
    >
      <PerformanceMonitor onChange={({ factor }) => setDpr(1 + 0.5 * factor)} />
      <Daylight />
      <Earth />
      <World near={near} inspecting={inspecting} visited={state.visited} />
      <Lamps />
      <Screens />
      <Rigs />
      <Waypoints
        near={near}
        inspecting={inspecting}
        visited={state.visited}
        target={target}
        show={state.mode === "exploring" || state.mode === "inspecting"}
      />
      <GithubGrid />
      <Crowd near={near} onOpen={onOpen} />
      <Agents />
      <Speech lines={room.lines} names={room.names} me={room.me} kings={room.kings} onMute={room.mute} />
      {state.mode === "map" && <Globe visited={state.visited} target={target} onTravel={onTravel} />}
      {state.mode === "onboarding" && <IntroBubble step={state.step} onNext={onNext} onSkip={onSkip} />}
      <Ping />
      <Confetti />
      <CameraRig />
      <ClickToMove onTravel={onTravel} />
      <MinimapView />
      {INFO && <Info />}
    </Canvas>
  );
}

const INFO = process.env.NODE_ENV !== "production" && typeof location !== "undefined" && new URLSearchParams(location.search).has("info");

/** `?info` in dev: logs the fewest and most draw calls per frame over two seconds, minimap passes included. */
const seen = { n: 0, lo: Infinity, hi: 0 };
function Info() {
  useFrame(({ gl }) => {
    gl.info.autoReset = false;
    const calls = gl.info.render.calls;
    gl.info.reset();
    // skip the first second while shaders compile and the crowd drops in
    if (++seen.n < 60 || seen.n > 180) return;
    seen.lo = Math.min(seen.lo, calls);
    seen.hi = Math.max(seen.hi, calls);
    if (seen.n === 180) console.log(`draw calls ${seen.lo}-${seen.hi}`);
  });
  return null;
}
