/**
 * Watches local Claude Code / Codex transcripts and posts a tiny summary to the site.
 * PRIVACY: transcript lines are parsed in memory and reduced to enums; no string from them
 * is stored, logged or sent. Run: npm run pulse
 */
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { type Agent, MAX_AGENTS, type Provider, type Pulse, cleanTitle, kindOf } from "../data/pulse.ts";

const ENDPOINT = process.env.PULSE_URL;
const SECRET = process.env.PULSE_SECRET;
if (!ENDPOINT || !SECRET) {
  console.error("pulse: set PULSE_URL and PULSE_SECRET");
  process.exit(1);
}

const LIVE_MS = 90_000;
const SCAN_MS = 2_000;
const DEBOUNCE_MS = 5_000;
const HEARTBEAT_MS = 60_000;

/** 8 hex of the transcript path: stable per session, and says nothing about the path */
const idOf = (path: string) => createHash("sha256").update(path).digest("hex").slice(0, 8);

interface Session {
  provider: Provider;
  offset: number;
  mtime: number;
  /** when the watcher last read a line of real work; Claude appends bookkeeping like cost-state to idle transcripts */
  active: number;
  last: Pick<Agent, "phase" | "kind">;
  title: string | null;
  /** the thread name T3 Code shows, when T3 runs this session */
  t3Title: string | null;
  titledAt: number;
  tail: string;
}

const sessions = new Map<string, Session>();
const countedToday = new Set<string>();
let day = new Date().toDateString();
let first = true;

const list = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayDir = (home: string, d: Date) => join(home, "sessions", String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()));
/** ~/.codex plus any side install (CODEX_HOME=~/.codex-something), each with its own sessions */
const codexHomes = () => list(homedir()).filter((e) => e.isDirectory() && e.name.startsWith(".codex")).map((e) => join(homedir(), e.name));

const REGISTRY = join(homedir(), ".claude/sessions");
/**
 * Claude Code's own process registry: sessions whose process is alive and mid-turn. A long tool
 * call or a wait on a subagent leaves the transcript quiet for minutes while the session still works.
 */
function busyClaude(): Set<string> {
  const out = new Set<string>();
  for (const f of list(REGISTRY)) {
    if (!f.name.endsWith(".json")) continue;
    try {
      const { pid, sessionId, status } = JSON.parse(readFileSync(join(REGISTRY, f.name), "utf8"));
      if (status !== "busy" || typeof sessionId !== "string") continue;
      // throws once the process is gone, so a crashed session's stale "busy" doesn't count
      process.kill(pid, 0);
      out.add(sessionId);
    } catch {}
  }
  return out;
}

/** [transcript, provider, owning session]; a Claude subagent writes beside its parent, which goes quiet while it waits */
function files(): [string, Provider, string][] {
  const out: [string, Provider, string][] = [];
  const claude = join(homedir(), ".claude/projects");
  for (const p of list(claude).filter((e) => e.isDirectory()))
    for (const f of list(join(claude, p.name))) {
      const path = join(claude, p.name, f.name);
      if (f.isFile() && f.name.endsWith(".jsonl")) out.push([path, "claude", path]);
      else if (f.isDirectory())
        for (const a of list(join(path, "subagents"))) if (a.name.endsWith(".jsonl")) out.push([join(path, "subagents", a.name), "claude", `${path}.jsonl`]);
    }
  // today and yesterday cover a session that straddles midnight
  const now = Date.now();
  for (const home of codexHomes())
    for (const d of [new Date(now), new Date(now - 864e5)])
      for (const f of list(dayDir(home, d))) if (f.name.endsWith(".jsonl")) out.push([join(dayDir(home, d), f.name), "codex", join(dayDir(home, d), f.name)]);
  return out;
}

interface Line {
  type?: string;
  message?: { content?: unknown };
  payload?: { type?: string; name?: string };
}
interface Block {
  type?: string;
  name?: string;
}

/** Claude: assistant tool_use -> tool; any other assistant/user line -> thinking. */
function claudeEvent(j: Line): Session["last"] | null {
  if (j.type !== "assistant" && j.type !== "user") return null;
  const content = j.message?.content;
  const use = Array.isArray(content) ? (content as Block[]).findLast((c) => c?.type === "tool_use") : null;
  return j.type === "assistant" && use ? { phase: "tool", kind: kindOf(use.name) } : { phase: "thinking", kind: "other" };
}

function codexEvent(j: Line): Session["last"] | null {
  const t = j.payload?.type;
  if (j.type === "event_msg") return t === "task_complete" ? { phase: "done", kind: "other" } : null;
  if (j.type !== "response_item") return null;
  if (t === "function_call" || t === "custom_tool_call") return { phase: "tool", kind: kindOf(j.payload?.name) };
  return t === "reasoning" || t === "message" ? { phase: "thinking", kind: "other" } : null;
}

const EVENT = { claude: claudeEvent, codex: codexEvent };

/** Claude rewrites `ai-title` as the session goes on; the last one wins. */
function claudeTitle(text: string): string | null {
  let title: string | null = null;
  for (const l of text.split("\n")) {
    if (!l.includes('"ai-title"')) continue;
    try {
      title = cleanTitle(JSON.parse(l).aiTitle) ?? title;
    } catch {}
  }
  return title;
}

/** Claude names a transcript by its session id; Codex ends the rollout file name with its thread id */
const nativeId = (path: string) => {
  const id = basename(path, ".jsonl").slice(-36);
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
};

/** Codex keeps the short thread name in its state db (`title` there is the whole first prompt), beside sessions/YYYY/MM/DD. */
function codexTitle(path: string): string | null {
  const CODEX_DB = join(path, "../../../../../state_5.sqlite");
  const id = nativeId(path);
  if (!id) return null;
  try {
    return cleanTitle(execFileSync("sqlite3", ["-readonly", CODEX_DB, `select name from threads where id = '${id}'`], { encoding: "utf8", timeout: 2_000 }));
  } catch {
    return null;
  }
}

const T3_DB = join(homedir(), ".t3/userdata/statev2.sqlite");
/**
 * T3 Code names a thread from its first message and keeps the user's renames. A session it runs often
 * never gets a Claude ai-title, and its delegated Codex threads have no Codex name.
 */
function t3Title(path: string): string | null {
  const id = nativeId(path);
  if (!id) return null;
  try {
    const sql = `select t.title from orchestration_v2_projection_provider_threads p join orchestration_v2_projection_threads t using (thread_id)
      where json_extract(p.payload_json, '$.nativeThreadRef.nativeId') = '${id}' order by p.updated_at desc limit 1`;
    return cleanTitle(execFileSync("sqlite3", ["-readonly", T3_DB, sql], { encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null;
  }
}

function read(path: string, s: Session, size: number) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - s.offset);
    const n = readSync(fd, buf, 0, buf.length, s.offset);
    s.offset += n;
    const lines = (s.tail + buf.toString("utf8", 0, n)).split("\n");
    s.tail = lines.pop()!;
    for (const l of lines) {
      try {
        const e = EVENT[s.provider](JSON.parse(l));
        if (e) {
          s.last = e;
          s.active = Date.now();
        }
      } catch {}
    }
    if (s.provider === "claude") s.title = claudeTitle(lines.join("\n")) ?? s.title;
  } finally {
    closeSync(fd);
  }
}

function scan(): Pulse {
  const now = Date.now();
  if (new Date(now).toDateString() !== day) {
    day = new Date(now).toDateString();
    countedToday.clear();
  }
  /** owning session -> its most recently written transcript, its own or a subagent's */
  const live = new Map<string, Session>();
  const running = busyClaude();
  for (const [path, provider, owner] of files()) {
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    let s = sessions.get(path);
    if (!s) {
      // files that predate the watcher start at EOF; a fresh session is read from its first line
      const fresh = !first && now - st.birthtimeMs < LIVE_MS;
      s = { provider, offset: fresh ? 0 : st.size, mtime: st.mtimeMs, active: 0, last: { phase: "thinking", kind: "other" }, title: null, t3Title: null, titledAt: 0, tail: "" };
      sessions.set(path, s);
    }
    if (st.size < s.offset) s.offset = s.tail.length ? 0 : st.size;
    if (st.size > s.offset) read(path, s, st.size);
    s.mtime = st.mtimeMs;
    const cur = live.get(owner);
    const awake = now - s.active < LIVE_MS || (path === owner && running.has(basename(path, ".jsonl")));
    if (awake && (!cur || s.active > cur.active)) live.set(owner, s);
  }
  const busy: [number, Agent][] = [];
  for (const [owner, s] of live) {
    countedToday.add(owner);
    // the title is the owning session's, never a subagent's brief
    const o = sessions.get(owner) ?? s;
    // a running Claude session's title sits behind the offset, so it is read once; T3 and Codex rename threads, so recheck them each minute
    if (!o.titledAt || now - o.titledAt > HEARTBEAT_MS) {
      if (!o.titledAt && o.provider === "claude")
        try {
          o.title = claudeTitle(readFileSync(owner, "utf8")) ?? o.title;
        } catch {}
      if (o.provider === "codex") o.title = codexTitle(owner);
      o.t3Title = t3Title(owner);
      o.titledAt = now;
    }
    // id from the owner so a session keeps its villager while its subagents do the writing
    busy.push([s.active, { id: idOf(owner), provider: s.provider, ...s.last, title: o.t3Title ?? o.title }]);
  }
  first = false;
  const lastSeen = Math.round(Math.max(0, ...[...sessions.values()].map((s) => s.mtime)));
  // past the cap, drop the quietest sessions so the same ones stay on screen between scans
  const agents = busy.sort(([a], [b]) => b - a).slice(0, MAX_AGENTS).map(([, a]) => a);
  return { agents, lastSeen, runsToday: countedToday.size };
}

let sent = "";
let sentAt = 0;
let down = false;
let latest = "{}";

async function tick() {
  const body = (latest = JSON.stringify(scan()));
  const now = Date.now();
  if (now - sentAt < DEBOUNCE_MS || (body === sent && now - sentAt < HEARTBEAT_MS)) return;
  sentAt = now;
  try {
    const res = await fetch(ENDPOINT!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) sent = body;
    down = false;
    const p: Pulse = JSON.parse(body);
    console.log(`${new Date().toISOString()} post ${res.status} agents=${p.agents.length} runs=${p.runsToday}`);
  } catch {
    // the site is often just not running locally; say so once, not every 5s
    if (!down) console.log(`${new Date().toISOString()} post failed (network), retrying quietly`);
    down = true;
  }
}

await tick();
setInterval(tick, SCAN_MS);

// a listening port is what makes the watcher show up in port-based tools like Portside
createServer((_, res) => res.setHeader("content-type", "application/json").end(`{"site":"${down ? "down" : "up"}","pulse":${latest}}`)).listen(
  Number(process.env.PULSE_PORT ?? 4317),
  "127.0.0.1",
);
// launchd only restarts on a failed exit, so a Stop from Portside (SIGTERM) stays stopped
process.on("SIGTERM", () => process.exit(0));
