/**
 * All-time AI usage from local Claude Code / Codex transcripts, scanned incrementally in small time slices.
 * PRIVACY: lines are parsed in memory; only model ids and numbers are kept, cached or returned.
 * Per-file state lives in ~/.cache/porto-usage-v2.json so a restart resumes instead of re-reading gigabytes.
 */
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type Bucket, MAX_DAYS, MAX_MODELS, MODEL_ID, type Provider, type Tally, type Usage, addBucket, addTally } from "../data/pulse.ts";

const CACHE = join(homedir(), ".cache/porto-usage-v2.json");
const RATES = join(homedir(), ".t3/userdata/usage-model-rates.json");
const SLICE_MS = 150;
const CHUNK = 16 * 1024 * 1024;
const SAVE_MS = 30_000;
const DISCOVER_MS = 10_000;
const AGGREGATE_MS = 60_000;

type Totals = { input: number; cached: number; write: number; output: number };
interface FileState {
  offset: number;
  isSession: boolean;
  provider: Provider;
  lastMsgId?: string;
  prevTotal?: Totals;
  model?: string;
  /** per Jakarta day: what happened on it */
  days: Record<string, { models: Record<string, Tally>; toolCalls: number }>;
  /** earliest day with usage; the session counts there */
  firstDay?: string;
  since: number;
}

let files: Record<string, FileState> = {};
let loaded = false;
let dirty = false;
let savedAt = 0;
let discoveredAt = 0;
let queue: [string, Provider, boolean][] = [];
let complete = false;
let snapshot: Usage | null = null;
let snapshotAt = 0;

type Rate = { input_cost_per_token?: number; output_cost_per_token?: number; cache_read_input_token_cost?: number; cache_creation_input_token_cost?: number };
let rates: Record<string, Rate> | null = null;
const rateCache = new Map<string, Rate | null>();
function rateOf(model: string): Rate | null {
  if (rates === null) {
    try {
      rates = JSON.parse(readFileSync(RATES, "utf8")).document ?? {};
    } catch {
      rates = {};
    }
  }
  if (rateCache.has(model)) return rateCache.get(model)!;
  const key = Object.hasOwn(rates!, model) ? model : Object.keys(rates!).find((k) => k.endsWith(`/${model}`));
  const r = key ? rates![key] : null;
  rateCache.set(model, r);
  return r;
}

/** yyyy-mm-dd in Asia/Jakarta (UTC+7, no DST) */
const jakartaDay = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);

const emptyTally = (provider: Provider): Tally => ({ provider, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, saved: 0 });
const dayOf = (s: FileState, d: string) => (s.days[d] ??= { models: {}, toolCalls: 0 });

function toolCall(s: FileState, ts: number) {
  if (Number.isFinite(ts)) dayOf(s, jakartaDay(ts)).toolCalls++;
}

/** ponytail: ignores long-context price tiers, so very long prompts are slightly underpriced */
function record(s: FileState, model: string, ts: number, input: number, output: number, cacheRead: number, cacheWrite: number) {
  if (!MODEL_ID.test(model) || !Number.isFinite(ts)) return;
  const r = rateOf(model) ?? {};
  const d = jakartaDay(ts);
  if (!s.firstDay || d < s.firstDay) s.firstDay = d;
  if (!s.since || ts < s.since) s.since = ts;
  const t = ((dayOf(s, d).models[model] ??= emptyTally(s.provider)));
  t.input += input;
  t.output += output;
  t.cacheRead += cacheRead;
  t.cacheWrite += cacheWrite;
  t.turns += 1;
  t.inputCost += input * (r.input_cost_per_token ?? 0);
  t.outputCost += output * (r.output_cost_per_token ?? 0);
  t.cacheReadCost += cacheRead * (r.cache_read_input_token_cost ?? 0);
  t.cacheWriteCost += cacheWrite * (r.cache_creation_input_token_cost ?? 0);
  t.saved += cacheRead * Math.max(0, (r.input_cost_per_token ?? 0) - (r.cache_read_input_token_cost ?? 0));
}

interface Line {
  type?: string;
  timestamp?: string;
  message?: { id?: string; model?: string; content?: unknown; usage?: Record<string, unknown> };
  payload?: { type?: string; model?: string; info?: { total_token_usage?: Record<string, unknown> } | null };
}

function claudeLine(s: FileState, l: string) {
  if (!l.includes('"assistant"') || !l.includes('"usage"')) return;
  const j: Line = JSON.parse(l);
  const m = j.message;
  if (j.type !== "assistant" || !m?.usage || typeof m.model !== "string" || m.model === "<synthetic>") return;
  // Claude writes one line per content block, each block once, so tool_use blocks are summed per line
  const ts = Date.parse(j.timestamp ?? "");
  if (Array.isArray(m.content)) for (const c of m.content) if (c?.type === "tool_use") toolCall(s, ts);
  // the usage repeats on every line of one message; those lines are consecutive
  if (m.id !== undefined && m.id === s.lastMsgId) return;
  s.lastMsgId = m.id;
  const u = m.usage;
  record(s, m.model, ts, num(u.input_tokens), num(u.output_tokens), num(u.cache_read_input_tokens), num(u.cache_creation_input_tokens));
}

function codexLine(s: FileState, l: string) {
  const call = l.includes('"function_call"') || l.includes('"custom_tool_call"');
  if (!call && !l.includes('"token_count"') && !l.includes('"turn_context"')) return;
  const j: Line = JSON.parse(l);
  const p = j.payload;
  if (!p) return;
  if (j.type === "turn_context" && typeof p.model === "string") s.model = p.model;
  else if (j.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) toolCall(s, Date.parse(j.timestamp ?? ""));
  else if (j.type === "event_msg" && p.type === "token_count" && p.info?.total_token_usage) {
    const u = p.info.total_token_usage;
    const total: Totals = { input: num(u.input_tokens), cached: num(u.cached_input_tokens), write: num(u.cache_write_input_tokens), output: num(u.output_tokens) };
    const prev = s.prevTotal;
    s.prevTotal = total;
    // a smaller total means the counter restarted, so the whole new total is the delta
    const reset = !prev || total.input < prev.input || total.cached < prev.cached || total.write < prev.write || total.output < prev.output;
    const d = reset ? total : { input: total.input - prev.input, cached: total.cached - prev.cached, write: total.write - prev.write, output: total.output - prev.output };
    if (!s.model || (!d.input && !d.cached && !d.write && !d.output)) return;
    record(s, s.model, Date.parse(j.timestamp ?? ""), Math.max(0, d.input - d.cached), d.output, d.cached, d.write);
  }
}

function lineOf(s: FileState, l: string) {
  try {
    (s.provider === "claude" ? claudeLine : codexLine)(s, l);
  } catch {}
}

/** reads one chunk past s.offset; returns false when there was nothing complete to read */
function readChunk(path: string, s: FileState, size: number): void {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset));
    const n = readSync(fd, buf, 0, buf.length, s.offset);
    const end = buf.lastIndexOf(10, n - 1);
    if (end < 0) {
      // ponytail: a line over the chunk size is a pasted image or tool output, never a usage record; skip it
      if (n === CHUNK) s.offset += n;
      return;
    }
    s.offset += end + 1;
    for (const l of buf.toString("utf8", 0, end).split("\n")) if (l) lineOf(s, l);
    dirty = true;
  } finally {
    closeSync(fd);
  }
}

const list = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

function walk(dir: string, out: string[]) {
  for (const e of list(dir)) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
}

function discover(): [string, Provider, boolean][] {
  const out: [string, Provider, boolean][] = [];
  const claude = join(homedir(), ".claude/projects");
  for (const p of list(claude).filter((e) => e.isDirectory()))
    for (const f of list(join(claude, p.name))) {
      const path = join(claude, p.name, f.name);
      if (f.isFile() && f.name.endsWith(".jsonl")) out.push([path, "claude", true]);
      else if (f.isDirectory()) for (const a of list(join(path, "subagents"))) if (a.name.endsWith(".jsonl")) out.push([join(path, "subagents", a.name), "claude", false]);
    }
  for (const h of list(homedir()).filter((e) => e.isDirectory() && e.name.startsWith(".codex"))) {
    const paths: string[] = [];
    walk(join(homedir(), h.name, "sessions"), paths);
    for (const path of paths) out.push([path, "codex", true]);
  }
  return out;
}

function save() {
  const tmp = `${CACHE}.tmp`;
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(tmp, JSON.stringify(files));
  renameSync(tmp, CACHE);
  dirty = false;
  savedAt = Date.now();
}

const emptyBucket = (): Bucket => ({ models: {}, sessions: { claude: 0, codex: 0 }, toolCalls: { claude: 0, codex: 0 } });

/** keeps the biggest models by cost; the wire allows MAX_MODELS per bucket */
function top(b: Bucket): Bucket {
  const cost = (t: Tally) => t.inputCost + t.outputCost + t.cacheReadCost + t.cacheWriteCost;
  const kept = Object.entries(b.models).sort(([, x], [, y]) => cost(y) - cost(x) || y.turns - x.turns).slice(0, MAX_MODELS);
  return { ...b, models: Object.fromEntries(kept) };
}

function aggregate(): Usage {
  const days: Record<string, Bucket> = {};
  let since = 0;
  for (const s of Object.values(files)) {
    for (const [d, day] of Object.entries(s.days)) {
      const b = (days[d] ??= emptyBucket());
      b.toolCalls[s.provider] += day.toolCalls;
      for (const [id, t] of Object.entries(day.models)) b.models[id] = addTally(b.models[id], t);
    }
    if (s.isSession && s.firstDay) (days[s.firstDay] ??= emptyBucket()).sessions[s.provider]++;
    if (s.since && (!since || s.since < since)) since = s.since;
  }
  const keys = Object.keys(days).sort();
  let all = emptyBucket();
  for (const k of keys) all = addBucket(all, days[k]);
  // the wire is capped; the oldest days go first
  const kept = Object.fromEntries(keys.slice(-MAX_DAYS).map((k) => [k, top(days[k])]));
  return { since: since || Date.now(), all: top(all), days: kept };
}

/** The latest aggregate, or null until every transcript has been read once. */
export const usageSnapshot = () => snapshot;

/** Spends at most about SLICE_MS scanning; call it from the watcher's tick. */
export function usageTick(): void {
  const t0 = Date.now();
  if (!loaded) {
    loaded = true;
    try {
      files = JSON.parse(readFileSync(CACHE, "utf8"));
    } catch {
      files = {};
    }
  }
  if (queue.length === 0 && t0 - discoveredAt > DISCOVER_MS) {
    discoveredAt = t0;
    queue = discover();
  }
  while (queue.length && Date.now() - t0 < SLICE_MS) {
    const [path, provider, isSession] = queue[queue.length - 1];
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      queue.pop();
      continue;
    }
    const s = (files[path] ??= { offset: 0, isSession, provider, days: {}, since: 0 });
    // a truncated file is left alone: totals never shrink
    if (size > s.offset) {
      const before = s.offset;
      try {
        readChunk(path, s, size);
      } catch {
        queue.pop();
        continue;
      }
      // no complete line yet (still being written): move on, it is picked up next discovery
      if (s.offset === before || s.offset >= size) queue.pop();
    } else queue.pop();
  }
  const now = Date.now();
  if (queue.length === 0 && !complete) {
    complete = true;
    if (dirty) save();
  }
  if (complete && now - snapshotAt > AGGREGATE_MS) {
    snapshot = aggregate();
    snapshotAt = now;
  }
  if (dirty && now - savedAt > SAVE_MS) save();
}
