"use client";

import { useEffect, useState } from "react";
import { type Pulse, ago, say } from "@/data/pulse";
import { Section } from "./section";

const POLL_MS = 15_000;

export function AiPulse() {
  const [state, setState] = useState<{ pulse: Pulse; at: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const pulse: Pulse = await res.json();
        if (alive) setState({ pulse, at: Date.now() });
      } catch {
        // keep the last good pulse so one dropped request doesn't make the section flicker away
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  if (!state || state.pulse.lastSeen === 0) return null;
  const { agents, lastSeen, runsToday } = state.pulse;
  const live = agents.length > 0;

  return (
    <Section id="ai" title="AI at work">
      <p className="text-mute">I build with Claude Code and Codex every day. This shows what my agents are doing right now.</p>
      <p className="mt-4 flex items-center gap-2" aria-live="polite">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${live ? "bg-green motion-safe:animate-pulse" : "bg-mute"}`} />
        {live ? (
          <span>
            <strong className="font-bold text-accent">{agents.length}</strong> {agents.length === 1 ? "agent" : "agents"} working right now
          </span>
        ) : (
          <span>Agents are resting. Last active {ago(state.at - lastSeen)}.</span>
        )}
      </p>
      {live && (
        <ul className="mt-3 space-y-1">
          {agents.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2">
              <span className="shrink-0 rounded border border-line px-1.5 text-xs text-link">{a.provider}</span>
              <span className="shrink-0">{say(a)}</span>
              <span className="min-w-0 truncate text-mute">{a.title ?? "untitled session"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-mute">
        <strong className="font-bold">{runsToday}</strong> agent {runsToday === 1 ? "session" : "sessions"} today.
      </p>
    </Section>
  );
}
