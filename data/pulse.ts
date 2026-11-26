/** Shared by the watcher, the route and the client. Only enums and numbers ever cross the wire. */
export const PROVIDERS = ["claude", "codex"] as const;
export const PHASES = ["thinking", "tool", "done"] as const;
export const KINDS = ["edit", "run", "read", "search", "web", "other"] as const;

export type Provider = (typeof PROVIDERS)[number];
export type Phase = (typeof PHASES)[number];
export type Kind = (typeof KINDS)[number];
/**
 * id is the first 8 hex of sha256(transcript path): stable per session, says nothing about it.
 * title is the session title Claude/Codex generated, already passed through cleanTitle.
 */
export type Agent = { id: string; provider: Provider; phase: Phase; kind: Kind; title: string | null };
/** token counts plus the cost of each, in USD; saved is what cache reads saved vs paying full input price */
export type Tally = {
  provider: Provider;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  turns: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  saved: number;
};
export type Bucket = {
  models: Record<string, Tally>;
  /** sessions whose first usage falls in this bucket */
  sessions: Record<Provider, number>;
  toolCalls: Record<Provider, number>;
};
export type Usage = {
  /** epoch ms of the earliest usage seen */
  since: number;
  /** all-time totals */
  all: Bucket;
  /** "yyyy-mm-dd" (Asia/Jakarta) to that day's bucket, every day with usage */
  days: Record<string, Bucket>;
};
/** lastSeen is epoch ms; 0 means the laptop never reported; usage is null until the first full scan */
export type Pulse = { agents: Agent[]; lastSeen: number; runsToday: number; usage: Usage | null };

export const MAX_AGENTS = 10;
export const TITLE_MAX = 60;
const ID = /^[0-9a-f]{8}$/;
export const MODEL_ID = /^[a-z0-9][a-z0-9.\-]{0,47}$/i;
export const MAX_MODELS = 40;
export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DAYS = 400;

// titles come from prompts, so anything shaped like a link, an address or a key is blanked
export const SECRETISH = /https?:\/\/\S+|\S+@\S+\.\S+|[\w-]{24,}/g;

export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(SECRETISH, "…").replace(/[\p{Cc}\s]+/gu, " ").trim();
  if (!t) return null;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t;
}

export const KIND_BY_TOOL: Record<string, Kind> = {
  Edit: "edit",
  Write: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Bash: "run",
  Read: "read",
  Grep: "search",
  Glob: "search",
  WebFetch: "web",
  WebSearch: "web",
  apply_patch: "edit",
  shell: "run",
  exec: "run",
  exec_command: "run",
  local_shell: "run",
};

export const kindOf = (tool: unknown): Kind =>
  (typeof tool === "string" && Object.hasOwn(KIND_BY_TOOL, tool) ? KIND_BY_TOOL[tool] : "other");

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
export const oneOf = <T extends string>(set: readonly T[], x: unknown): x is T => set.includes(x as T);
export const exactly = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));

const isMoney = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const COUNTS = ["input", "output", "cacheRead", "cacheWrite", "turns"] as const;
const MONEY = ["inputCost", "outputCost", "cacheReadCost", "cacheWriteCost", "saved"] as const;
const TALLY_KEYS = ["provider", ...COUNTS, ...MONEY];

/** what a tally cost in USD */
export const costOf = (t: Pick<Tally, "inputCost" | "outputCost" | "cacheReadCost" | "cacheWriteCost">) => t.inputCost + t.outputCost + t.cacheReadCost + t.cacheWriteCost;
/** every token the model processed */
export const tokensOf = (t: Pick<Tally, "input" | "output" | "cacheRead" | "cacheWrite">) => t.input + t.output + t.cacheRead + t.cacheWrite;

function parseCounts(x: unknown): Record<Provider, number> | null {
  if (!isRecord(x) || !exactly(x, [...PROVIDERS]) || !PROVIDERS.every((p) => isCount(x[p]))) return null;
  return { claude: x.claude as number, codex: x.codex as number };
}

function parseBucket(x: unknown): Bucket | null {
  if (!isRecord(x) || !exactly(x, ["models", "sessions", "toolCalls"]) || !isRecord(x.models)) return null;
  const sessions = parseCounts(x.sessions);
  const toolCalls = parseCounts(x.toolCalls);
  const ids = Object.keys(x.models);
  if (!sessions || !toolCalls || ids.length > MAX_MODELS) return null;
  const models: Record<string, Tally> = {};
  for (const id of ids) {
    const t = x.models[id];
    if (!MODEL_ID.test(id) || !isRecord(t) || !exactly(t, TALLY_KEYS) || !oneOf(PROVIDERS, t.provider)) return null;
    if (!COUNTS.every((k) => isCount(t[k])) || !MONEY.every((k) => isMoney(t[k]))) return null;
    models[id] = { provider: t.provider, ...Object.fromEntries([...COUNTS, ...MONEY].map((k) => [k, t[k]])) } as Tally;
  }
  return { models, sessions, toolCalls };
}

export function parseUsage(x: unknown): Usage | null {
  if (!isRecord(x) || !exactly(x, ["since", "all", "days"]) || !isCount(x.since) || !isRecord(x.days)) return null;
  const all = parseBucket(x.all);
  const keys = Object.keys(x.days);
  if (!all || keys.length > MAX_DAYS) return null;
  const days: Record<string, Bucket> = {};
  for (const k of keys) {
    const b = DAY_KEY.test(k) ? parseBucket(x.days[k]) : null;
    if (!b) return null;
    days[k] = b;
  }
  return { since: x.since, all, days };
}

const sumCounts = (a: Record<Provider, number>, b: Record<Provider, number>) => ({ claude: a.claude + b.claude, codex: a.codex + b.codex });

export function addTally(a: Tally | undefined, t: Tally): Tally {
  if (!a) return { ...t };
  const o = { ...a };
  for (const k of [...COUNTS, ...MONEY]) o[k] += t[k];
  return o;
}

export function addBucket(a: Bucket, b: Bucket): Bucket {
  const models = { ...a.models };
  for (const [id, t] of Object.entries(b.models)) models[id] = addTally(models[id], t);
  return { models, sessions: sumCounts(a.sessions, b.sessions), toolCalls: sumCounts(a.toolCalls, b.toolCalls) };
}

/** Sums two machines' usage; since is the earlier one. */
export function addUsage(a: Usage | null, b: Usage | null): Usage | null {
  if (!a || !b) return a ?? b;
  const days = { ...a.days };
  for (const [k, v] of Object.entries(b.days)) days[k] = days[k] ? addBucket(days[k], v) : v;
  return { since: Math.min(a.since, b.since), all: addBucket(a.all, b.all), days };
}

export function parsePulse(x: unknown): Pulse | null {
  // watchers older than 3.3.0, and pulses they already stored, have no usage key
  const keys = ["agents", "lastSeen", "runsToday"];
  if (!isRecord(x) || !(exactly(x, keys) || exactly(x, [...keys, "usage"]))) return null;
  const { agents, lastSeen, runsToday } = x;
  const usage = x.usage == null ? null : parseUsage(x.usage);
  if (x.usage != null && !usage) return null;
  if (!Array.isArray(agents) || agents.length > MAX_AGENTS || !isCount(lastSeen) || !isCount(runsToday)) return null;
  const out: Agent[] = [];
  for (const a of agents) {
    if (!isRecord(a) || !exactly(a, ["id", "provider", "phase", "kind", "title"])) return null;
    if (typeof a.id !== "string" || !ID.test(a.id)) return null;
    if (!oneOf(PROVIDERS, a.provider) || !oneOf(PHASES, a.phase) || !oneOf(KINDS, a.kind)) return null;
    if (a.title !== null && cleanTitle(a.title) !== a.title) return null;
    out.push({ id: a.id, provider: a.provider, phase: a.phase, kind: a.kind, title: a.title as string | null });
  }
  return { agents: out, lastSeen, runsToday, usage };
}

const VERB: Record<Kind, string> = {
  edit: "editing",
  run: "running",
  read: "reading",
  search: "searching",
  web: "browsing",
  other: "working",
};

export const say = (a: Agent) => (a.phase === "tool" ? VERB[a.kind] : a.phase);

const AGO: [number, string][] = [
  [86_400_000, "d"],
  [3_600_000, "h"],
  [60_000, "m"],
];
export function ago(ms: number) {
  const [unit, label] = AGO.find(([u]) => ms >= u) ?? [1, ""];
  return label ? `${Math.floor(ms / unit)}${label} ago` : "just now";
}
