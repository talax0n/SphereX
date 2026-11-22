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
/** lastSeen is epoch ms; 0 means the laptop never reported */
export type Pulse = { agents: Agent[]; lastSeen: number; runsToday: number };

export const MAX_AGENTS = 10;
export const TITLE_MAX = 60;
const ID = /^[0-9a-f]{8}$/;

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

export function parsePulse(x: unknown): Pulse | null {
  if (!isRecord(x) || !exactly(x, ["agents", "lastSeen", "runsToday"])) return null;
  const { agents, lastSeen, runsToday } = x;
  if (!Array.isArray(agents) || agents.length > MAX_AGENTS || !isCount(lastSeen) || !isCount(runsToday)) return null;
  const out: Agent[] = [];
  for (const a of agents) {
    if (!isRecord(a) || !exactly(a, ["id", "provider", "phase", "kind", "title"])) return null;
    if (typeof a.id !== "string" || !ID.test(a.id)) return null;
    if (!oneOf(PROVIDERS, a.provider) || !oneOf(PHASES, a.phase) || !oneOf(KINDS, a.kind)) return null;
    if (a.title !== null && cleanTitle(a.title) !== a.title) return null;
    out.push({ id: a.id, provider: a.provider, phase: a.phase, kind: a.kind, title: a.title as string | null });
  }
  return { agents: out, lastSeen, runsToday };
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
