import { timingSafeEqual } from "node:crypto";
import { MAX_AGENTS, type Pulse, parsePulse } from "@/data/pulse";
import { hasRedis, redis } from "@/lib/redis";

/** a machine that hasn't posted for this long is asleep; its watcher heartbeats every minute */
const STALE_MS = 150_000;
/** past this a machine's runsToday belongs to another day, so only its lastSeen still counts */
const GONE_MS = 12 * 3_600_000;
const SOURCE = /^[0-9a-f]{8}$/;
const EMPTY: Pulse = { agents: [], lastSeen: 0, runsToday: 0 };

type Stored = { pulse: Pulse; at: number };

/** dev only: serverless instances don't share it; on globalThis so dev recompiles keep it */
const mem = globalThis as { pulseMemory?: Map<string, string> };
const memory = () => (mem.pulseMemory ??= new Map());

// Each machine writes its own key, so two watchers never overwrite each other.
const keyOf = (source: string) => `pulse:${source}`;

async function save(source: string, json: string) {
  if (!hasRedis) return void memory().set(source, json);
  await redis("SET", keyOf(source), json, "EX", 86_400 * 7);
  await redis("SADD", "pulse:sources", source);
}

async function loadAll(): Promise<(string | null)[]> {
  if (!hasRedis) return [...memory().values()];
  const sources = await redis<string[]>("SMEMBERS", "pulse:sources");
  return sources.length ? redis<(string | null)[]>("MGET", ...sources.map(keyOf)) : [];
}

function authorized(req: Request, secret: string) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function POST(req: Request) {
  // pasted dashboard values often carry a trailing newline, which no header can ever match
  const secret = process.env.PULSE_SECRET?.trim();
  if (!secret) return Response.json({ error: "PULSE_SECRET is not set" }, { status: 503 });
  if (!authorized(req, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const source = req.headers.get("x-pulse-source") ?? "00000000";
  if (!SOURCE.test(source)) return Response.json({ error: "bad source" }, { status: 400 });
  const pulse = parsePulse(await req.json().catch(() => null));
  if (!pulse) return Response.json({ error: "bad pulse" }, { status: 400 });
  try {
    await save(source, JSON.stringify({ pulse, at: Date.now() } satisfies Stored));
  } catch {
    return Response.json({ error: "store unavailable" }, { status: 502 });
  }
  return Response.json({ ok: true });
}

export async function GET() {
  const now = Date.now();
  const merged: Pulse = { ...EMPTY, agents: [] };
  try {
    for (const raw of await loadAll()) {
      let stored: Stored | null = null;
      try {
        const x = JSON.parse(raw ?? "null");
        // re-parse so nothing but enums and numbers can leave, even if the store were poisoned
        const pulse = parsePulse(x?.pulse);
        if (pulse && typeof x.at === "number") stored = { pulse, at: x.at };
      } catch {}
      if (!stored) continue;
      const age = now - stored.at;
      merged.lastSeen = Math.max(merged.lastSeen, stored.pulse.lastSeen);
      if (age > GONE_MS) continue;
      merged.runsToday += stored.pulse.runsToday;
      if (age <= STALE_MS) merged.agents.push(...stored.pulse.agents);
    }
  } catch {}
  merged.agents = merged.agents.slice(0, MAX_AGENTS);
  return Response.json(merged, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=3" } });
}
