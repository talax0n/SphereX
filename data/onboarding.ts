import type { Gesture } from "@/components/hq/scene/gesture";
import { STATIONS } from "./stations";

export interface IntroLine {
  text: string;
  /** replaces `text` on touch screens, where there are no keys to press */
  touch?: string;
  /** what the character acts out while saying it */
  gesture: Gesture;
}

/** What the player character says on a first visit, one bubble per step. */
export const INTRO: readonly IntroLine[] = [
  { text: "Hi! I'm Theo. Welcome to my tiny world.", gesture: "wave" },
  {
    text: "Each little building holds a piece of my story. Walk up and press E.",
    touch: "Each little building holds a piece of my story. Walk up and tap to open.",
    gesture: "point",
  },
  {
    text: `Light up all ${STATIONS.length}. Anyone falling from the sky is one of my AI agents clocking in. Press M for the map.`,
    touch: `Light up all ${STATIONS.length}. Anyone falling from the sky is one of my AI agents clocking in. Tap the corner map.`,
    gesture: "cheer",
  },
  {
    text: "WASD or click to walk. Ready? Here I go!",
    touch: "Drag the stick or tap anywhere to walk. Ready? Here I go!",
    gesture: "ready",
  },
];
