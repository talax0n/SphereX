import { Color, type ColorRepresentation, Vector2, Vector3 } from "three";
import { INTRO } from "@/data/onboarding";
import type { StationId } from "@/data/stations";
import type { Pulse } from "@/data/pulse";
import type { Villager, Visitor } from "./scene/folk";
import type { Gesture } from "./scene/gesture";
import { dirAt, flatten } from "./scene/planet";

interface Progress {
  visited: ReadonlySet<StationId>;
}

export type GameState =
  /** the player character talks the visitor through INTRO[step], hanging above the planet */
  | ({ mode: "onboarding"; step: number } & Progress)
  /** dropping onto the planet; the scene owns the fall and reports touchdown with `landed` */
  | ({ mode: "landing" } & Progress)
  | ({ mode: "exploring"; near: StationId | null } & Progress)
  | ({ mode: "inspecting"; station: StationId } & Progress)
  /** the full map, a modal over a paused world: walking under it would move the very thing it charts */
  | ({ mode: "map" } & Progress);

export type GameAction =
  | { type: "approach"; id: StationId | null }
  | { type: "open"; id: StationId }
  | { type: "close" }
  | { type: "map" }
  | { type: "next" }
  | { type: "skip" }
  | { type: "landed" }
  | { type: "replay" }
  | { type: "hydrate"; visited: readonly StationId[]; introSeen: boolean };

/** Every visit starts mid-drop; hydration turns it into the intro for first-time visitors. */
export const initialState: GameState = {
  mode: "landing",
  visited: new Set(),
};

const progress = ({ visited }: GameState): Progress => ({ visited });

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "approach":
      if (state.mode !== "exploring" || state.near === action.id) return state;
      return { ...state, near: action.id };
    case "open":
      if (state.mode === "onboarding" || state.mode === "landing") return state;
      return { ...progress(state), mode: "inspecting", station: action.id, visited: new Set(state.visited).add(action.id) };
    case "close":
      if (state.mode === "inspecting") return { mode: "exploring", near: state.station, ...progress(state) };
      if (state.mode === "map") return { mode: "exploring", near: null, ...progress(state) };
      return state;
    case "map":
      if (state.mode === "map") return { mode: "exploring", near: null, ...progress(state) };
      if (state.mode !== "exploring" && state.mode !== "inspecting") return state;
      return { mode: "map", ...progress(state) };
    case "next":
      if (state.mode !== "onboarding") return state;
      if (state.step + 1 < INTRO.length) return { ...state, step: state.step + 1 };
      return { mode: "landing", ...progress(state) };
    case "skip":
      if (state.mode !== "onboarding") return state;
      return { mode: "landing", ...progress(state) };
    case "landed":
      if (state.mode !== "landing") return state;
      return { mode: "exploring", near: null, ...progress(state) };
    case "replay":
      if (state.mode !== "exploring") return state;
      return { mode: "onboarding", step: 0, ...progress(state) };
    case "hydrate": {
      const restored: Progress = { visited: new Set([...state.visited, ...action.visited]) };
      if (!action.introSeen && state.mode === "landing") return { mode: "onboarding", step: 0, ...restored };
      return { ...state, ...restored };
    }
  }
}

/**
 * Mutable per-frame state shared between the DOM layer and the r3f scene. A module singleton
 * (never React state) so frame loops and key handlers touch it without re-rendering.
 */
export interface Controls {
  /** unit position on the planet and the unit tangent the character faces */
  player: { n: Vector3; heading: Vector3 };
  /** screen-up as a tangent at the player, carried along as they walk so the view never spins */
  north: Vector3;
  /** a great-circle walk toward a surface point, optionally ending at a station door */
  target: { n: Vector3; station: StationId | null } | null;
  keys: Set<string>;
  /** the touch joystick: screen-right and screen-up in [-1, 1], length ≤ 1, dead zone already applied */
  stick: { x: number; y: number };
  /** a jump asked for by Space or the touch button, taken by the scene on its next frame */
  jump: boolean;
  zoomMul: number;
  frozen: boolean;
  focus: StationId | null;
  /** celebration clock, advanced by the scene */
  celebrate: { active: boolean; t: number };
  /** the player's drop: hover while the intro talks, a crouch to jump from, then fall when the state machine says land */
  intro: "hover" | "crouch" | "fall" | "ground";
  /**
   * The player's gesture: `t` seconds into `current`, `blend` easing in from whatever showed before,
   * `side` -1 to play it on the other arm.
   */
  gesture: { current: Gesture; t: number; blend: number; side: 1 | -1 };
  /** player's height above the ground, in world units */
  alt: number;
  /** the room confirmed you are the site owner, so you wear the crown */
  king: boolean;
  /** filled by the crowd once it spawns, so the map can chart villagers without importing the scene */
  villagers: readonly Villager[];
  /** the room's other people, a fixed pool the crowd fills in once it spawns and `use-room` seats peers in */
  visitors: readonly Visitor[];
  /** the owner's agent activity, polled from /api/pulse */
  pulse: Pulse;
  /** screen-edge arrows by STATIONS index; the HUD renders them and the scene moves them each frame */
  edges: (HTMLElement | null)[];
  /** the one move-command marker; a new click rewrites it in place */
  ping: { n: Vector3; t: number; kind: "move" | "deny"; color: Color };
  /**
   * The map's orbit view. `dir` points from the planet centre to the camera, `up` is screen-up,
   * `spin` is drag inertia in rad/s about screen-up and screen-right, `t` how far the camera has flown out.
   */
  globe: { open: boolean; t: number; dir: Vector3; up: Vector3; spin: Vector2 };
  /** the minimap button; while it's mounted the scene paints the live planet under it */
  minimap: HTMLElement | null;
}

const spawn = dirAt(8, 90);
/** returning visitors drop from just above, which also hides the spawn */
export const DROP_IN = 1.6;
export const HOVER = 4.6;

export const ctl: Controls = {
  player: { n: spawn, heading: flatten(new Vector3(0, 0, -1), spawn) },
  north: flatten(new Vector3(0, 0, -1), spawn),
  target: null,
  keys: new Set(),
  stick: { x: 0, y: 0 },
  jump: false,
  zoomMul: 1,
  frozen: false,
  focus: null,
  celebrate: { active: false, t: 0 },
  intro: "fall",
  gesture: { current: "rest", t: 0, blend: 1, side: 1 },
  alt: DROP_IN,
  king: false,
  villagers: [],
  visitors: [],
  pulse: { agents: [], lastSeen: 0, runsToday: 0 },
  edges: [],
  ping: { n: new Vector3(), t: -Infinity, kind: "move", color: new Color() },
  globe: { open: false, t: 0, dir: new Vector3(), up: new Vector3(), spin: new Vector2() },
  minimap: null,
};

/** `t` is performance.now() in seconds, the clock the marker's frame loop reads too. */
export function setPing(n: Vector3, kind: "move" | "deny", color: ColorRepresentation) {
  const p = ctl.ping;
  p.n.copy(n).normalize();
  p.kind = kind;
  p.color.set(color);
  p.t = performance.now() / 1000;
}

export function setTarget(n: Vector3, station: StationId | null) {
  ctl.target = { n: n.clone().normalize(), station };
}

/** Starts `g` from the top; the crowd blends into it from the pose on screen. */
export function setGesture(g: Gesture, side: 1 | -1 = 1) {
  const s = ctl.gesture;
  s.current = g;
  s.t = 0;
  s.blend = 0;
  s.side = side;
}
