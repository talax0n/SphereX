"use client";

import { useEffect, useState } from "react";
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
import { Ground, World } from "./world";
import { Rigs, Screens } from "./workplaces";

interface SceneProps {
  state: GameState;
  room: Room;
  onTravel: (id: StationId) => void;
  onOpen: (id: StationId) => void;
  onNext: () => void;
  onSkip: () => void;
  onBubbleShown: () => void;
  /** false while the HTML placeholder still shows the intro, so the planet's bubbles take over without popping in */
  bubbleAppear: boolean;
}

// Phones already draw at 2-3x density; past 1.25 the clay looks the same and the GPU pays for every extra pixel.
const MAX_DPR = window.matchMedia("(pointer: coarse)").matches ? 1.25 : 1.5;

export default function Scene({ state, room, onTravel, onOpen, onNext, onSkip, onBubbleShown, bubbleAppear }: SceneProps) {
  const [dpr, setDpr] = useState(MAX_DPR);
  // Building the whole planet in one go froze a phone for over a second, Next taps included. The player and
  // camera mount first; each later stage waits for a painted frame, so the build lands as short tasks.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= LAST_STAGE) return;
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setStage(stage + 1))));
    return () => cancelAnimationFrame(id);
  }, [stage]);
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
      <PerformanceMonitor onChange={({ factor }) => setDpr(1 + (MAX_DPR - 1) * factor)} />
      <Daylight />
      <Crowd near={near} onOpen={onOpen} />
      {state.mode === "onboarding" && (
        <IntroBubble step={state.step} onNext={onNext} onSkip={onSkip} onShown={onBubbleShown} appear={bubbleAppear} />
      )}
      <CameraRig />
      <ClickToMove onTravel={onTravel} />
      {stage >= 1 && <Earth />}
      {stage >= 2 && <Ground />}
      {stage >= 3 && <World near={near} inspecting={inspecting} visited={state.visited} />}
      {stage >= 4 && (
        <>
          <Lamps />
          <Screens />
          <Rigs />
        </>
      )}
      {stage >= 5 && (
        <>
          <Waypoints
            near={near}
            inspecting={inspecting}
            visited={state.visited}
            show={state.mode === "exploring" || state.mode === "inspecting"}
          />
          <GithubGrid />
        </>
      )}
      {stage >= 6 && (
        <>
          <Agents />
          <Speech lines={room.lines} names={room.names} me={room.me} kings={room.kings} onMute={room.mute} />
          {state.mode === "map" && <Globe visited={state.visited} onTravel={onTravel} />}
        </>
      )}
      {stage >= 7 && (
        <>
          <Ping />
          <Confetti />
          <MinimapView />
        </>
      )}
      {INFO && <Info />}
    </Canvas>
  );
}

const LAST_STAGE = 7;

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
