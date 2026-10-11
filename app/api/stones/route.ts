import { createHash } from "node:crypto";
import { Vector3 } from "three";
import { STONES_MAX, parseDraft, parseStones } from "@/data/stones";
import { coast, plinthAt } from "@/components/hq/scene/planet";
import { hasRedis, redis } from "@/lib/redis";

const KEY = "stones";
const DAY = 86_400;
/** `coast` below this is dry land; the same threshold `standLift` uses for walkable ground */
const LAND = -0.7;
/** dev only: serverless instances don't share it; on globalThis so dev recompiles keep it */
const mem = globalThis as { stonesMemory?: string[]; stonesSeen?: Map<string, number> };

/** the visitor's address, hashed so the raw IP never reaches the store */
function who(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** true when this visitor hasn't left a stone in the last day, and now has */
async function claim(id: string) {
  if (hasRedis) return (await redis("SET", `stones:ip:${id}`, 1, "NX", "EX", DAY)) === "OK";
  const seen = (mem.stonesSeen ??= new Map());
  if ((seen.get(id) ?? 0) > Date.now()) return false;
  seen.set(id, Date.now() + DAY * 1000);
  return true;
}

export async function POST(req: Request) {
  const draft = parseDraft(await req.json().catch(() => null));
  if (!draft) return Response.json({ error: "bad stone" }, { status: 400 });
  const n = new Vector3(...draft.n).normalize();
  if (plinthAt(n) || coast(n) > LAND) return Response.json({ error: "no room there" }, { status: 400 });
  try {
    if (!(await claim(who(req)))) return Response.json({ error: "one a day" }, { status: 429 });
    const json = JSON.stringify({ ...draft, at: Date.now() });
    if (hasRedis) {
      await redis("LPUSH", KEY, json);
      await redis("LTRIM", KEY, 0, STONES_MAX - 1);
    } else mem.stonesMemory = [json, ...(mem.stonesMemory ?? [])].slice(0, STONES_MAX);
  } catch {
    return Response.json({ error: "store unavailable" }, { status: 502 });
  }
  return Response.json({ ok: true });
}

export async function GET() {
  let stones: unknown[] = [];
  try {
    const rows = hasRedis ? await redis<string[]>("LRANGE", KEY, 0, STONES_MAX - 1) : (mem.stonesMemory ?? []);
    stones = rows.map((r) => JSON.parse(r) as unknown);
  } catch {}
  // re-parse so nothing but numbers and cleaned names can leave, even if the store were poisoned
  return Response.json(parseStones(stones), { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=20" } });
}
