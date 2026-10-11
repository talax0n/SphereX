import { createHash } from "node:crypto";
import { NOTES_MAX, parseDraft, parseNotes } from "@/data/notes";
import { hasRedis, redis } from "@/lib/redis";

const KEY = "notes";
/** seconds between two notes from one address */
const GAP = 600;
/** dev only: serverless instances don't share it; on globalThis so dev recompiles keep it */
const mem = globalThis as { notesMemory?: string[]; notesSeen?: Map<string, number> };

/** the visitor's address, hashed so the raw IP never reaches the store */
function who(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** true when this visitor hasn't pinned a note in the last `GAP`, and now has */
async function claim(id: string) {
  if (hasRedis) return (await redis("SET", `notes:ip:${id}`, 1, "NX", "EX", GAP)) === "OK";
  const seen = (mem.notesSeen ??= new Map());
  if ((seen.get(id) ?? 0) > Date.now()) return false;
  seen.set(id, Date.now() + GAP * 1000);
  return true;
}

export async function POST(req: Request) {
  const draft = parseDraft(await req.json().catch(() => null));
  if (!draft) return Response.json({ error: "bad note" }, { status: 400 });
  const note = { ...draft, at: Date.now() };
  try {
    if (!(await claim(who(req)))) return Response.json({ error: "slow down" }, { status: 429 });
    const json = JSON.stringify(note);
    if (hasRedis) {
      await redis("LPUSH", KEY, json);
      await redis("LTRIM", KEY, 0, NOTES_MAX - 1);
    } else mem.notesMemory = [json, ...(mem.notesMemory ?? [])].slice(0, NOTES_MAX);
  } catch {
    return Response.json({ error: "store unavailable" }, { status: 502 });
  }
  return Response.json(note);
}

export async function GET() {
  let notes: unknown[] = [];
  try {
    const rows = hasRedis ? await redis<string[]>("LRANGE", KEY, 0, NOTES_MAX - 1) : (mem.notesMemory ?? []);
    notes = rows.map((r) => JSON.parse(r) as unknown);
  } catch {}
  // re-parse so nothing but cleaned text can leave, even if the store were poisoned
  return Response.json(parseNotes(notes), { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=20" } });
}
