import { type Vec, cleanName, vec } from "./room.ts";
import { exactly, isRecord } from "./pulse.ts";

/** A signed stone a visitor left on the planet. */
export type Stone = { n: Vec; name: string; at: number };
/** What a visitor sends; the server stamps `at`. */
export type Draft = Pick<Stone, "n" | "name">;

export const STONES_MAX = 200;

export function parseDraft(x: unknown): Draft | null {
  if (!isRecord(x) || !exactly(x, ["n", "name"])) return null;
  const n = vec(x.n);
  const name = cleanName(x.name);
  return n && name ? { n, name } : null;
}

export function parseStone(x: unknown): Stone | null {
  if (!isRecord(x) || !exactly(x, ["n", "name", "at"])) return null;
  const d = parseDraft({ n: x.n, name: x.name });
  return d && typeof x.at === "number" && Number.isSafeInteger(x.at) && x.at > 0 ? { ...d, at: x.at } : null;
}

/** Drops anything malformed rather than failing the whole list. */
export function parseStones(x: unknown): Stone[] {
  return Array.isArray(x) ? x.slice(0, STONES_MAX).flatMap((s) => parseStone(s) ?? []) : [];
}
