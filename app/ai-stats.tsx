"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Bucket, PROVIDERS, type Provider, type Tally, type Usage, addBucket, costOf, tokensOf } from "@/data/pulse";
import { ProviderIcon } from "./ai-pulse";

type Range = 7 | 30 | 90 | "all";
type Mode = "cost" | "tokens";
type View = "model" | "day";
type Series = Record<Provider, number[]>;

const DAY_MS = 86_400_000;
const NAME: Record<Provider, string> = { claude: "Claude Code", codex: "Codex" };
const COLOR: Record<Provider, string> = { claude: "#D97757", codex: "var(--ink)" };
const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: "all", label: "All time" },
];
const MODES: { value: Mode; label: string }[] = [
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Tokens" },
];
const VIEWS: { value: View; label: string }[] = [
  { value: "model", label: "Model" },
  { value: "day", label: "Day" },
];

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function tok(n: number) {
  const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  const [size, suffix] = units.find(([u]) => n >= u) ?? [1, ""];
  const v = n / size;
  return `${suffix ? (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) : Math.round(v)}${suffix}`;
}
const pct = (x: number) => (x > 0 && x < 0.001 ? "<0.1%" : `${(x * 100).toFixed(1)}%`);
const plural = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(dayMs(d)).toLocaleDateString("en", { ...opts, timeZone: "UTC" });
const jakartaToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

const EMPTY: Bucket = { models: {}, sessions: { claude: 0, codex: 0 }, toolCalls: { claude: 0, codex: 0 } };
const value = (t: Tally, mode: Mode) => (mode === "cost" ? costOf(t) : tokensOf(t));
const sumTallies = (ts: Tally[], mode: Mode) => ts.reduce((a, t) => a + value(t, mode), 0);

/** every day from the window start to today, zeros filled in */
function daysOf(usage: Usage, range: Range): string[] {
  const keys = Object.keys(usage.days).sort();
  const end = [jakartaToday(), keys.at(-1) ?? ""].sort().at(-1)!;
  const start = range === "all" ? (keys[0] ?? end) : new Date(dayMs(end) - (range - 1) * DAY_MS).toISOString().slice(0, 10);
  const out: string[] = [];
  for (let t = dayMs(start); t <= dayMs(end); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function seriesOf(usage: Usage, days: string[], mode: Mode): Series {
  const s: Series = { claude: [], codex: [] };
  for (const d of days) {
    const b = usage.days[d];
    for (const p of PROVIDERS) s[p].push(b ? sumTallies(Object.values(b.models).filter((t) => t.provider === p), mode) : 0);
  }
  return s;
}

/** monotone cubic through the points, so the curve never dips below a flat day */
function curve(pts: [number, number][]): string {
  const n = pts.length;
  const head = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  if (n < 2) return head;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) t[i] = t[i + 1] = 0;
    else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
  }
  let d = head;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((f) => f * mag >= raw) ?? 10) * mag;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

function Seg<T extends string | number>({ label, options, current, onChange }: { label: string; options: { value: T; label: string }[]; current: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === current}
          onClick={() => onChange(o.value)}
          className={`min-h-8 cursor-pointer rounded-md px-2.5 text-xs whitespace-nowrap transition-colors sm:px-3 ${o.value === current ? "bg-accent/20 font-medium text-ink" : "text-mute hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chart({ days, series, mode }: { days: string[]; series: Series; mode: Mode }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 230;
  const L = 46;
  const R = 8;
  const T = 12;
  const B = 26;
  const live = PROVIDERS.filter((p) => series[p].some((v) => v > 0));
  const peak = Math.max(0, ...live.flatMap((p) => series[p]));
  const ticks = niceTicks(peak);
  const top = ticks.at(-1)!;
  const n = days.length;
  const x = (i: number) => L + (n > 1 ? (i / (n - 1)) * (w - L - R) : (w - L - R) / 2);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const dominant = [...live].sort((a, b) => series[b].reduce((s, v) => s + v, 0) - series[a].reduce((s, v) => s + v, 0))[0];
  const tick = (v: number) => (mode === "cost" ? `$${v >= 1 ? Math.round(v) : v.toFixed(2)}` : tok(v));
  const labels = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n > 1 ? [0, 1] : [0];

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left - L) / (w - L - R)) * (n - 1)))));
  };

  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${w} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Daily ${mode === "cost" ? "cost" : "processed tokens"} from ${days[0]} to ${days.at(-1)}`}
        className="block touch-pan-y text-ink"
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 3.5} fontSize={10} fill="var(--mute)" textAnchor="end" className="tabular-nums">
              {v === 0 ? "0" : tick(v)}
            </text>
          </g>
        ))}
        {dominant && (
          <path d={`${curve(series[dominant].map((v, i) => [x(i), y(v)]))}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={COLOR[dominant]} opacity={0.12} />
        )}
        {live.map((p) => (
          <path key={p} d={curve(series[p].map((v, i) => [x(i), y(v)]))} fill="none" stroke={COLOR[p]} strokeWidth={1.75} strokeLinecap="round" opacity={p === "codex" ? 0.8 : 1} />
        ))}
        {labels.map((i, k) => (
          <text key={i} x={x(i)} y={H - 6} fontSize={10} fill="var(--mute)" textAnchor={k === 0 ? "start" : k === labels.length - 1 ? "end" : "middle"} className="uppercase">
            {dayLabel(days[i], { month: "short", day: "numeric" })}
          </text>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--mute)" strokeWidth={1} strokeDasharray="3 3" />
            {live.map((p) => (
              <circle key={p} cx={x(hover)} cy={y(series[p][hover])} r={3.5} fill="var(--bg)" stroke={COLOR[p]} strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-md border border-line bg-bg px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(w - 70, Math.max(70, x(hover))) }}
        >
          <p className="font-mono text-[11px] text-mute">{dayLabel(days[hover], { weekday: "short", month: "short", day: "numeric" })}</p>
          {(live.length ? live : PROVIDERS).map((p) => (
            <p key={p} className="mt-0.5 flex items-center justify-between gap-4 tabular-nums">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: COLOR[p] }} />
                {NAME[p]}
              </span>
              <span>{mode === "cost" ? usd(series[p][hover]) : tok(series[p][hover])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-mute">{label}</p>
      <p className="mt-1.5 text-base font-medium tabular-nums">{children}</p>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium">{children}</h3>;
}

type Row = { key: string; icon?: Provider; label: string; cost: number; tokens: number; color: string };

export function AiStats({ usage, onClose }: { usage: Usage; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [range, setRange] = useState<Range>(30);
  const [mode, setMode] = useState<Mode>("cost");
  const [view, setView] = useState<View>("model");
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      d.focus();
    }
  }, []);

  const { days, series, bucket } = useMemo(() => {
    const days = daysOf(usage, range);
    const bucket = range === "all" ? usage.all : days.reduce((b, d) => (usage.days[d] ? addBucket(b, usage.days[d]) : b), EMPTY);
    return { days, series: seriesOf(usage, days, mode), bucket };
  }, [usage, range, mode]);

  const all = Object.values(bucket.models);
  const sum = (k: "input" | "output" | "cacheRead" | "cacheWrite" | "saved") => all.reduce((a, t) => a + t[k], 0);
  const totalCost = all.reduce((a, t) => a + costOf(t), 0);
  const totalTokens = all.reduce((a, t) => a + tokensOf(t), 0);
  const total = mode === "cost" ? totalCost : totalTokens;
  const sessions = bucket.sessions.claude + bucket.sessions.codex;
  const share = (v: number) => (total > 0 ? v / total : 0);

  const providers = PROVIDERS.map((p) => {
    const ts = all.filter((t) => t.provider === p);
    return { p, cost: ts.reduce((a, t) => a + costOf(t), 0), tokens: ts.reduce((a, t) => a + tokensOf(t), 0), sessions: bucket.sessions[p] };
  })
    .filter((r) => r.tokens > 0 || r.sessions > 0)
    .sort((a, b) => (mode === "cost" ? b.cost - a.cost : b.tokens - a.tokens));

  const types: { label: string; v: number; tone: string }[] =
    mode === "cost"
      ? [
          { label: "Input", v: all.reduce((a, t) => a + t.inputCost, 0), tone: "bg-ink/25" },
          { label: "Cache read", v: all.reduce((a, t) => a + t.cacheReadCost, 0), tone: "bg-ink/45" },
          { label: "Cache write", v: all.reduce((a, t) => a + t.cacheWriteCost, 0), tone: "bg-ink/65" },
          { label: "Output", v: all.reduce((a, t) => a + t.outputCost, 0), tone: "bg-ink" },
        ]
      : [
          { label: "Input", v: sum("input"), tone: "bg-ink/25" },
          { label: "Cache read", v: sum("cacheRead"), tone: "bg-ink/45" },
          { label: "Cache write", v: sum("cacheWrite"), tone: "bg-ink/65" },
          { label: "Output", v: sum("output"), tone: "bg-ink" },
        ];
  const fmt = (v: number) => (mode === "cost" ? usd(v) : tok(v));

  const rows: Row[] =
    view === "model"
      ? Object.entries(bucket.models).map(([id, t]) => ({ key: id, icon: t.provider, label: id, cost: costOf(t), tokens: tokensOf(t), color: COLOR[t.provider] }))
      : days
          .filter((d) => usage.days[d] && Object.keys(usage.days[d].models).length)
          .map((d) => {
            const ts = Object.values(usage.days[d].models);
            const lead = [...ts].sort((a, b) => value(b, mode) - value(a, mode))[0];
            return { key: d, label: dayLabel(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), cost: ts.reduce((a, t) => a + costOf(t), 0), tokens: ts.reduce((a, t) => a + tokensOf(t), 0), color: COLOR[lead.provider] };
          })
          .reverse();
  if (view === "model") rows.sort((a, b) => (mode === "cost" ? b.cost - a.cost : b.tokens - a.tokens));
  const rowMax = Math.max(0, ...rows.map((r) => (mode === "cost" ? r.cost : r.tokens)));
  const since = new Date(usage.since).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Jakarta" });

  return (
    <dialog
      ref={ref}
      aria-label="My AI usage"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      tabIndex={-1}
      className="m-auto max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl overflow-x-hidden overflow-y-auto rounded-xl outline-none border border-line bg-bg p-0 text-ink shadow-lg backdrop:bg-black/60 sm:w-[calc(100vw-2rem)]"
    >
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-bg px-4 py-2.5 sm:px-6">
        <span className="mr-auto text-sm text-mute">Usage</span>
        <Seg label="Range" options={RANGES} current={range} onChange={setRange} />
        <Seg label="Metric" options={MODES} current={mode} onChange={setMode} />
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-9 cursor-pointer place-items-center rounded-md text-mute transition-colors hover:text-ink">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
            <path d="m3.5 3.5 9 9m0-9-9 9" />
          </svg>
        </button>
      </div>

      <div className="space-y-9 px-5 py-7 sm:px-10 sm:py-9">
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-[17rem_minmax(0,1fr)]">
          <div>
            <p className="text-4xl leading-none font-medium tabular-nums">{mode === "cost" ? usd(totalCost) : tok(totalTokens)}</p>
            <p className="mt-2 text-xs text-mute">{mode === "cost" ? `${plural(sessions, "session")} · API estimate` : plural(sessions, "session")}</p>
            <ul className="mt-7 space-y-5">
              {providers.map((r) => (
                <li key={r.p}>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: COLOR[r.p] }} />
                    <ProviderIcon provider={r.p} />
                    <span className="text-sm">{NAME[r.p]}</span>
                    <span className="text-[11px] text-mute">{plural(r.sessions, "session")}</span>
                    <span className="ml-auto text-sm tabular-nums">{fmt(mode === "cost" ? r.cost : r.tokens)}</span>
                  </div>
                  <p className="mt-1 pl-4 text-xs text-mute tabular-nums">
                    {mode === "cost" ? `${pct(share(r.cost))} of cost · ${tok(r.tokens)} tokens` : `${pct(share(r.tokens))} of tokens · ${usd(r.cost)}`}
                  </p>
                </li>
              ))}
              {providers.length === 0 && <li className="text-xs text-mute">No usage in this range.</li>}
            </ul>
          </div>
          <div className="min-w-0">
            <Heading>{mode === "cost" ? "Daily cost" : "Daily processed tokens"}</Heading>
            <div className="mt-3">
              <Chart days={days} series={series} mode={mode} />
            </div>
          </div>
        </div>

        <section>
          <Heading>Totals</Heading>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 md:grid-cols-6">
            <Stat label="Processed tokens">{tok(totalTokens)}</Stat>
            <Stat label="Cached input">{tok(sum("cacheRead"))}</Stat>
            <Stat label="Uncached input">{tok(sum("input"))}</Stat>
            <Stat label="Output">{tok(sum("output"))}</Stat>
            <Stat label="Cache savings">{usd(sum("saved"))}</Stat>
            <Stat label="Tool calls">{tok(bucket.toolCalls.claude + bucket.toolCalls.codex)}</Stat>
          </div>
        </section>

        <section>
          <Heading>{mode === "cost" ? "Cost by type" : "Tokens by type"}</Heading>
          <div className="mt-4 flex h-2 gap-0.5" role="img" aria-label={types.map((t) => `${t.label} ${fmt(t.v)}`).join(", ")}>
            {types
              .filter((t) => t.v > 0)
              .map((t) => (
                <div key={t.label} className={`min-w-[3px] rounded-full ${t.tone}`} style={{ flexGrow: t.v, flexBasis: 0 }} />
              ))}
            {total === 0 && <div className="flex-1 rounded-full bg-line" />}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            {types.map((t) => (
              <li key={t.label} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-2 rounded-xs ${t.tone}`} />
                <span className="text-mute">{t.label}</span>
                <span className="tabular-nums">{fmt(t.v)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="flex items-center justify-between gap-4">
            <Heading>Breakdown</Heading>
            <Seg label="Group by" options={VIEWS} current={view} onChange={setView} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead className="text-xs text-mute">
                <tr className="border-b border-line">
                  <th className="w-8 py-2 pr-2 text-right font-normal">#</th>
                  <th className="py-2 font-normal">{view === "model" ? "Model" : "Day"}</th>
                  <th className="py-2 text-right font-normal">Cost</th>
                  <th className="w-20 py-2 text-right font-normal">Share</th>
                  <th className="w-24 py-2 text-right font-normal">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const v = mode === "cost" ? r.cost : r.tokens;
                  return (
                    <tr key={r.key} className="border-b border-line">
                      <td className="py-3 pr-2 text-right align-top text-xs text-mute tabular-nums">{i + 1}</td>
                      <td className="py-3 align-top">
                        <span className="flex items-center gap-2">
                          {r.icon && <ProviderIcon provider={r.icon} />}
                          <span className="break-all">{r.label}</span>
                        </span>
                        <span className="mt-1.5 block h-0.5 w-48 max-w-full">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.round((view === "day" ? v / (rowMax || 1) : share(v)) * 100))}%`, background: r.color }} />
                        </span>
                      </td>
                      <td className="py-3 text-right align-top tabular-nums">{usd(r.cost)}</td>
                      <td className="py-3 text-right align-top text-mute tabular-nums">{pct(share(v))}</td>
                      <td className="py-3 text-right align-top text-mute tabular-nums">{tok(r.tokens)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-mute">
                      No usage in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-mute">Estimated at API prices from my local Claude Code and Codex transcripts. Tracking since {since}.</p>
      </div>
    </dialog>
  );
}
