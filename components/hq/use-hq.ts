import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { STATIONS, STATION_BY_ID, type StationId } from "@/data/stations";
import { INTRO } from "@/data/onboarding";
import { HOVER, ctl, gameReducer, setGesture, setPing, setTarget, initialState } from "./game";
import { IDENTITY } from "./scene/dioramas";
import { LANDMARKS, arc, plinthAt, toward } from "./scene/planet";

const VISITED_KEY = "hq:visited";
const INTRO_KEY = "hq:intro";
/** a step stays up this long before Next works, so a double click can't skip two lines */
const STEP_DWELL = 600;
const NEAR_RADIUS = 1.9;
const ARRIVE_RADIUS = 0.35;
const MOVE_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);
const NEXT_KEYS = new Set(["Enter", "NumpadEnter", "Space"]);

export interface Toast {
  id: number;
  text: string;
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function load<T>(key: string, keep: (v: unknown) => v is T): T[] {
  const saved = read(key);
  return Array.isArray(saved) ? saved.filter(keep) : [];
}

const isStation = (v: unknown): v is StationId => typeof v === "string" && v in STATION_BY_ID;

const STATIONS_DONE = "All 8 lit. Thanks for looking around!";

export function useHQ(start?: StationId) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [toast, setToast] = useState<Toast | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
    ctl.frozen = state.mode !== "exploring";
    ctl.focus = state.mode === "inspecting" ? state.station : null;
    if (state.mode === "onboarding") ctl.intro = "hover";
    else if (state.mode === "landing" && ctl.intro === "hover") ctl.intro = "crouch";
  }, [state]);

  useEffect(() => {
    const gl = document.createElement("canvas");
    if (!gl.getContext("webgl2") && !gl.getContext("webgl")) location.replace(start ? `/read#${start}` : "/read");
    const introSeen = localStorage.getItem(INTRO_KEY) === "1";
    if (start) {
      // a deep link stands the player at the station's door, already on the ground
      ctl.player.n.copy(LANDMARKS[start].door);
      toward(ctl.player.n, LANDMARKS[start].n, ctl.north);
      ctl.player.heading.copy(ctl.north);
      ctl.intro = "ground";
      ctl.alt = 0;
    } else if (!introSeen) {
      // a first visit opens already hanging in the air rather than floating up from the drop-in
      ctl.alt = HOVER;
      ctl.player.heading.copy(ctl.north).negate();
    }
    dispatch({ type: "hydrate", visited: load(VISITED_KEY, isStation), introSeen, start });
  }, [start]);

  // a deep link skipped the intro without showing it, so it still plays on the next plain visit
  useEffect(() => {
    if (state.mode === "exploring" && !start) localStorage.setItem(INTRO_KEY, "1");
  }, [state.mode, start]);

  // the address bar names the open book; replaceState keeps Next from remounting the page
  useEffect(() => {
    if (state.mode !== "inspecting" && state.mode !== "exploring") return;
    const path = state.mode === "inspecting" ? `/${state.station}` : "/";
    if (location.pathname !== path) history.replaceState(null, "", path);
  }, [state]);

  const step = state.mode === "onboarding" ? state.step : -1;
  const stepAt = useRef(0);
  useEffect(() => {
    stepAt.current = performance.now();
    if (step >= 0) setGesture(INTRO[step].gesture);
  }, [step]);
  const next = useCallback(() => {
    if (performance.now() - stepAt.current >= STEP_DWELL) dispatch({ type: "next" });
  }, []);
  const skip = useCallback(() => dispatch({ type: "skip" }), []);
  const replay = useCallback(() => {
    ctl.target = null;
    ctl.keys.clear();
    dispatch({ type: "replay" });
  }, []);

  const toggleMap = useCallback(() => {
    ctl.keys.clear();
    dispatch({ type: "map" });
  }, []);

  useEffect(() => {
    if (state.visited.size) localStorage.setItem(VISITED_KEY, JSON.stringify([...state.visited]));
  }, [state.visited]);

  const say = useCallback((text: string) => setToast({ id: performance.now(), text }), []);
  const celebrate = useCallback(
    (text: string) => {
      ctl.celebrate.t = 0;
      ctl.celebrate.active = true;
      setGesture("celebrate");
      say(text);
    },
    [say],
  );

  // owed only when the last station is lit live, never when a finished run is restored
  const partyOwedRef = useRef(false);
  const open = useCallback((id: StationId) => {
    const { visited } = stateRef.current;
    if (!visited.has(id) && visited.size === STATIONS.length - 1) partyOwedRef.current = true;
    ctl.target = null;
    // face the landmark so the camera frames it from its door, whichever side the player came from
    toward(ctl.player.n, LANDMARKS[id].n, ctl.north);
    setGesture("hop");
    dispatch({ type: "open", id });
  }, []);

  // the stations party waits for the last panel to close so it plays out in view
  const close = useCallback(() => {
    const { mode } = stateRef.current;
    if (mode !== "inspecting" && mode !== "map") return;
    dispatch({ type: "close" });
    if (partyOwedRef.current) {
      partyOwedRef.current = false;
      celebrate(STATIONS_DONE);
    }
  }, [celebrate]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const travel = useCallback(
    (id: StationId) => {
      const { mode } = stateRef.current;
      if (mode === "onboarding" || mode === "landing") return;
      close();
      if (plinthAt(ctl.player.n) === id) return open(id);
      setTarget(LANDMARKS[id].door, id);
      setPing(LANDMARKS[id].door, "move", IDENTITY[id].top);
    },
    [close, open],
  );

  // Poll at 10Hz so proximity and landing never touch React from the render loop.
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.mode === "landing" && ctl.intro === "ground") dispatch({ type: "landed" });
      if (s.mode !== "exploring") return;
      const p = ctl.player.n;
      // standing on a plinth counts as being at its door
      let near: StationId | null = plinthAt(p) ?? null;
      let best = near ? 0 : NEAR_RADIUS;
      for (const st of STATIONS) {
        const d = arc(p, LANDMARKS[st.id].door);
        if (d < best) [best, near] = [d, st.id];
      }
      if (near !== s.near) dispatch({ type: "approach", id: near });
      const t = ctl.target;
      if (t?.station && arc(t.n, p) < ARRIVE_RADIUS) open(t.station);
    }, 100);
    return () => clearInterval(id);
  }, [open]);

  const interact = useCallback(() => {
    const s = stateRef.current;
    if (s.mode === "exploring" && s.near) open(s.near);
  }, [open]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // typing in the chat box must not walk, jump to a station or open one
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { mode } = stateRef.current;
      if (mode === "onboarding") {
        if (e.code === "Escape") skip();
        // a focused button already turns Enter and Space into its own click
        else if (e.code === "ArrowRight" || (NEXT_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement))) {
          e.preventDefault();
          next();
        }
        return;
      }
      if (mode === "landing") return;
      if (e.code === "KeyM") {
        e.preventDefault();
        toggleMap();
      } else if (MOVE_KEYS.has(e.code)) {
        if (stateRef.current.mode === "exploring") {
          e.preventDefault();
          ctl.keys.add(e.code);
        }
      } else if (e.code === "Space") {
        // a focused button keeps Space as its own click
        if (stateRef.current.mode === "exploring" && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          if (!e.repeat) ctl.jump = true;
        }
      } else if (e.code === "KeyE" || e.code === "Enter") {
        if (!(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) interact();
      } else if (e.code === "Escape") {
        close();
      } else {
        const st = STATIONS.find((s) => s.hotkey === e.key);
        if (st) travel(st.id);
      }
    };
    const up = (e: KeyboardEvent) => ctl.keys.delete(e.code);
    const clear = () => ctl.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [interact, travel, close, next, skip, toggleMap]);

  return { state, toast, travel, open, close, next, skip, replay, toggleMap };
}
