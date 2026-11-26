/**
 * All-time AI usage from local Claude Code / Codex transcripts, scanned incrementally in small time slices.
 * PRIVACY: lines are parsed in memory; only model ids and numbers are kept, cached or returned.
 * Per-file state lives in ~/.cache/porto-usage-v2.json so a restart resumes instead of re-reading gigabytes.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as zlib from "node:zlib";
import { type Bucket, MAX_DAYS, MAX_MODELS, MODEL_ID, type Provider, type Tally, type Usage, addBucket, addTally } from "../data/pulse.ts";

const CACHE = join(homedir(), ".cache/porto-usage-v2.json");
const RATES = join(homedir(), ".t3/userdata/usage-model-rates.json");
const T3_CACHE = join(homedir(), ".t3/userdata/usage-scan-cache-v17.json");
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
  /** never read again: an imported record, or a compressed rollout read to its end */
  done?: boolean;
}

/** a Codex rollout moves between sessions/, archived_sessions/ and .jsonl/.jsonl.zst; its basename sans .zst does not */
const codexKey = (path: string) => `codex:${basename(path).replace(/\.zst$/, "")}`;
interface Job {
  key: string;
  path: string;
  provider: Provider;
  isSession: boolean;
}

let files: Record<string, FileState> = {};
let loaded = false;
let dirty = false;
let savedAt = 0;
let discoveredAt = 0;
let queue: Job[] = [];
let complete = false;
let imported = false;
/** the decompressed rollout being worked on; only one is held at a time */
let zst: { path: string; buf: Buffer } | null = null;
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

// ponytail: @types/node here predates zstd; the runtime (Node 22.15+) has it
const zstdDecompressSync = (zlib as unknown as { zstdDecompressSync(b: Buffer): Buffer }).zstdDecompressSync;
const isZst = (path: string) => path.endsWith(".zst");

/** bytes of the file's plain content; offsets are in uncompressed bytes for both kinds */
function plain(path: string): Buffer | null {
  if (!isZst(path)) return null;
  if (zst?.path !== path) zst = { path, buf: zstdDecompressSync(readFileSync(path)) };
  return zst.buf;
}

function sizeOf(path: string): number {
  return plain(path)?.length ?? statSync(path).size;
}

/** reads one chunk past s.offset */
function readChunk(path: string, s: FileState, size: number): void {
  const whole = plain(path);
  let buf: Buffer;
  if (whole) buf = whole.subarray(s.offset, s.offset + Math.min(CHUNK, size - s.offset));
  else {
    const fd = openSync(path, "r");
    try {
      buf = Buffer.alloc(Math.min(CHUNK, size - s.offset));
      buf = buf.subarray(0, readSync(fd, buf, 0, buf.length, s.offset));
    } finally {
      closeSync(fd);
    }
  }
  const n = buf.length;
  const end = buf.lastIndexOf(10, n - 1);
  if (end < 0) {
    // ponytail: a line over the chunk size is a pasted image or tool output, never a usage record; skip it
    if (n === CHUNK) s.offset += n;
    return;
  }
  s.offset += end + 1;
  for (const l of buf.toString("utf8", 0, end).split("\n")) if (l) lineOf(s, l);
  dirty = true;
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
    else if (e.name.endsWith(".jsonl") || e.name.endsWith(".jsonl.zst")) out.push(p);
  }
}

function discover(): Job[] {
  const out = new Map<string, Job>();
  const add = (key: string, path: string, provider: Provider, isSession: boolean) => {
    if (!files[key]?.done && !out.has(key)) out.set(key, { key, path, provider, isSession });
  };
  const claude = join(homedir(), ".claude/projects");
  for (const p of list(claude).filter((e) => e.isDirectory()))
    for (const f of list(join(claude, p.name))) {
      const path = join(claude, p.name, f.name);
      if (f.isFile() && f.name.endsWith(".jsonl")) add(path, path, "claude", true);
      else if (f.isDirectory()) for (const a of list(join(path, "subagents"))) if (a.name.endsWith(".jsonl")) add(join(path, "subagents", a.name), join(path, "subagents", a.name), "claude", false);
    }
  for (const h of list(homedir()).filter((e) => e.isDirectory() && e.name.startsWith(".codex"))) {
    const paths: string[] = [];
    for (const dir of ["sessions", "archived_sessions"]) walk(join(homedir(), h.name, dir), paths);
    for (const path of paths) add(codexKey(path), path, "codex", true);
  }
  return [...out.values()];
}

/** v2 cache keyed Codex files by path; rekey them, keeping the further-read entry so nothing counts twice */
function migrate() {
  for (const [k, s] of Object.entries(files)) {
    if (s.provider !== "codex" || k.startsWith("codex:")) continue;
    const key = codexKey(k);
    if (!files[key] || files[key].offset < s.offset) files[key] = s;
    delete files[k];
    dirty = true;
  }
}

/**
 * Claude deletes transcripts after 30 days and Codex archives them, so T3 Code's own cache can be the only copy left.
 * Records that no file on disk can reproduce are copied into ours once and never touched again.
 */
function importT3() {
  let t3: { version?: number; models?: unknown; files?: unknown };
  try {
    t3 = JSON.parse(readFileSync(T3_CACHE, "utf8"));
  } catch {
    return;
  }
  if (t3.version !== 17 || !Array.isArray(t3.models) || typeof t3.files !== "object" || !t3.files) return;
  const models = t3.models as unknown[];
  for (const [path, f] of Object.entries(t3.files as Record<string, { p?: unknown; r?: unknown }>)) {
    const provider = f?.p;
    if ((provider !== "claude" && provider !== "codex") || !Array.isArray(f.r)) continue;
    const key = provider === "codex" ? codexKey(path) : path;
    if (files[key] || existsSync(path) || existsSync(`${path}.zst`) || existsSync(path.replace(/\.zst$/, ""))) continue;
    const s: FileState = { offset: 0, isSession: provider === "codex" || !path.includes("/subagents/"), provider, days: {}, since: 0, done: true };
    for (const r of f.r as unknown[]) {
      if (!Array.isArray(r)) continue;
      const model = models[r[1] as number];
      if (typeof model === "string") record(s, model, r[0], num(r[3]), num(r[6]), num(r[4]), num(r[5]));
    }
    if (s.firstDay) files[key] = s;
  }
  dirty = true;
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
    migrate();
  }
  if (queue.length === 0 && t0 - discoveredAt > DISCOVER_MS) {
    discoveredAt = t0;
    queue = discover();
  }
  while (queue.length && Date.now() - t0 < SLICE_MS) {
    const { key, path, provider, isSession } = queue[queue.length - 1];
    let size: number;
    try {
      size = sizeOf(path);
    } catch {
      // an unreadable compressed rollout is final, so it is not retried every discovery
      if (isZst(path)) (files[key] ??= { offset: 0, isSession, provider, days: {}, since: 0 }).done = true;
      queue.pop();
      continue;
    }
    const s = (files[key] ??= { offset: 0, isSession, provider, days: {}, since: 0 });
    let finished = true;
    // a truncated file is left alone: totals never shrink
    if (size > s.offset) {
      const before = s.offset;
      try {
        readChunk(path, s, size);
        // more to read on the next slice; no complete line yet means still being written, picked up next discovery
        finished = s.offset === before || s.offset >= size;
      } catch {}
    }
    if (finished) {
      queue.pop();
      if (isZst(path)) {
        s.done = true;
        zst = null;
      }
    }
  }
  const now = Date.now();
  if (queue.length === 0 && !complete) {
    complete = true;
    if (dirty) save();
  }
  let fresh = false;
  if (complete && !imported) {
    imported = true;
    fresh = true;
    importT3();
  }
  if (fresh && dirty) save();
  if (complete && (fresh || now - snapshotAt > AGGREGATE_MS)) {
    snapshot = aggregate();
    snapshotAt = now;
  }
  if (dirty && now - savedAt > SAVE_MS) save();
}
