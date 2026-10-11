"use client";

import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Chat } from "./hud/chat";
import { Cheat } from "./hud/cheat";
import { Dock, Hint, Replay, Toast, Wordmark } from "./hud/hud";
import { EdgeArrows, MapChrome, Minimap } from "./hud/map";
import { Sky } from "./sky";
import { Today } from "./hud/today";
import { Book } from "./hud/book";
import { JumpButton, Stick } from "./hud/stick";
import { IntroControls } from "./scene/intro";
import { useHQ } from "./use-hq";
import { useRoom } from "./use-room";

// The DOM shell paints first; three.js loads behind a plain placeholder.
const Scene = dynamic(() => import("./scene/scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0" />,
});

export function HQ() {
  const { state, toast, quests, streak, travel, open, close, next, skip, replay, toggleMap } = useHQ();
  const current = state.mode === "inspecting" ? state.station : state.mode === "exploring" ? state.near : null;
  // the intro has the stage to itself; the first render is a drop-in too, so nothing flashes before it
  const intro = state.mode === "onboarding" || state.mode === "landing";
  const visit = quests?.find((q) => q.quest.kind === "visit" && !q.done)?.quest;
  /** today's unfinished visit quest, which the map and the waypoints point at */
  const target = visit?.kind === "visit" ? visit.station : null;
  const map = state.mode === "map";
  const room = useRoom(!intro);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Sky />
      <Scene state={state} target={target} room={room} onTravel={travel} onOpen={open} onNext={next} onSkip={skip} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-4 sm:p-6">
        <div data-hud className={cn("transition-opacity duration-500", map && "max-sm:opacity-0")}>
          <Wordmark />
        </div>
        <div
          data-hud
          className={cn(
            "flex flex-col items-end gap-3 transition-opacity duration-500",
            (intro || state.mode === "inspecting") && "sm:opacity-0",
            intro && "opacity-0",
            map && "opacity-30 max-sm:opacity-0",
          )}
          aria-hidden={intro}
        >
          {quests && state.mode === "exploring" && <Today quests={quests} streak={streak} onTravel={travel} />}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-3 max-sm:top-44">
        <AnimatePresence>{toast && <Toast key={toast.id} text={toast.text} />}</AnimatePresence>
      </div>

      {state.mode === "onboarding" && (
        <IntroControls
          bar
          step={state.step}
          onNext={next}
          onSkip={skip}
          className="absolute inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:hidden"
        />
      )}
      {!intro && (
        <div
          data-hud
          className={cn(
            "absolute bottom-3 left-1/2 z-20 -translate-x-1/2 transition-opacity duration-500 sm:bottom-5",
            map && "opacity-40",
          )}
        >
          <Dock visited={state.visited} current={current} onTravel={travel} />
        </div>
      )}
      {state.mode === "exploring" && (
        <div data-hud className="absolute bottom-20 left-5 z-20 flex items-end gap-1.5 max-sm:bottom-auto max-sm:left-3 max-sm:top-24 sm:pointer-coarse:bottom-5">
          <Hint />
          <Replay onReplay={replay} />
        </div>
      )}

      {state.mode === "exploring" && (
        <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-20 hidden pointer-coarse:block sm:bottom-20 sm:left-5">
          <Stick />
        </div>
      )}
      {state.mode === "exploring" && (
        <div className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(13rem+env(safe-area-inset-bottom))] z-20 hidden pointer-coarse:block sm:right-5 sm:bottom-44">
          <JumpButton />
        </div>
      )}
      {state.mode === "exploring" && <Chat room={room} />}
      {state.mode === "exploring" && <EdgeArrows target={target} onTravel={travel} />}
      {state.mode === "exploring" && (
        <div data-hud className="absolute right-5 bottom-5 z-20 max-sm:right-3 max-sm:bottom-16">
          <Minimap visited={state.visited} target={target} onOpen={toggleMap} />
        </div>
      )}
      <AnimatePresence>{map && <MapChrome onClose={close} />}</AnimatePresence>

      <AnimatePresence>
        {state.mode === "inspecting" && <Book key={state.station} id={state.station} onClose={close} />}
      </AnimatePresence>
      <Cheat room={room} />
    </main>
  );
}
