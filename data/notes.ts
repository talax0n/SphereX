import { SAY_MAX, cleanName, cleanSay } from "./room.ts";
import { exactly, isRecord } from "./pulse.ts";

/** A note a visitor pinned on the guestbook board. */
export type Note = { name: string; text: string; at: number };
/** What a visitor sends; the server stamps `at`. */
export type Draft = Pick<Note, "name" | "text">;

export const NOTES_MAX = 200;
/** a note says as much as a chat line, and passes the same guards */
export const TEXT_MAX = SAY_MAX;

export function parseDraft(x: unknown): Draft | null {
  if (!isRecord(x) || !exactly(x, ["name", "text"])) return null;
  const name = cleanName(x.name);
  const text = cleanSay(x.text);
  return name && text ? { name, text } : null;
}

export function parseNote(x: unknown): Note | null {
  if (!isRecord(x) || !exactly(x, ["name", "text", "at"])) return null;
  const d = parseDraft({ name: x.name, text: x.text });
  return d && typeof x.at === "number" && Number.isSafeInteger(x.at) && x.at > 0 ? { ...d, at: x.at } : null;
}

/** Drops anything malformed rather than failing the whole list. */
export function parseNotes(x: unknown): Note[] {
  return Array.isArray(x) ? x.slice(0, NOTES_MAX).flatMap((n) => parseNote(n) ?? []) : [];
}
