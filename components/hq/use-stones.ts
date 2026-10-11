import { useCallback, useEffect, useState } from "react";
import { type Stone, parseStones } from "@/data/stones";
import { cleanName } from "@/data/room";
import { ctl, setGesture } from "./game";
import type { Room } from "./use-room";
import type { Toast } from "./use-hq";

const KEY = "hq:stone";
const NAME_KEY = "hq:name";
const kept = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** The planet's stones, and leaving yours: once per browser (the server also limits an address to one a day). */
export function useStones(room: Room) {
  const [stones, setStones] = useState<Stone[]>([]);
  const [left, setLeft] = useState(true);
  const [note, setNote] = useState<Toast | null>(null);

  useEffect(() => {
    fetch("/api/stones")
      .then((r) => r.json())
      .then((x: unknown) => setStones((now) => (now.length ? now : parseStones(x))))
      .catch(() => {})
      // after the fetch, so the server-rendered "already left" shows no flash of the button
      .finally(() => setLeft(kept()));
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 4200);
    return () => clearTimeout(id);
  }, [note]);

  const leave = useCallback(async () => {
    const say = (text: string) => setNote({ id: performance.now(), text });
    const p = ctl.player.n;
    const n = [p.x, p.y, p.z].map((c) => Math.round(c * 1000) / 1000) as Stone["n"];
    let name = room.myName;
    try {
      name ??= cleanName(localStorage.getItem(NAME_KEY));
    } catch {}
    const res = await fetch("/api/stones", {
      method: "POST",
      body: JSON.stringify({ n, name: name ?? "Traveler" }),
    }).catch(() => null);
    if (res?.status === 429) {
      setLeft(true);
      return say("You already left one today.");
    }
    if (!res?.ok) return say(res?.status === 400 ? "Not a good spot for a stone." : "Couldn't leave it just now.");
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setLeft(true);
    setStones((s) => [{ n, name: name ?? "Traveler", at: Date.now() }, ...s]);
    setGesture("hop");
    say("Your stone is on the planet.");
  }, [room.myName]);

  return { stones, left, note, leave };
}
