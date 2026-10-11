"use client";

import { ArrowUpRight } from "lucide-react";
import type { Span } from "@/data/github";
import { useContributions } from "../contributions";

const RAMP = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

const date = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", opts);
const fmt = (iso: string) => date(iso, { day: "numeric", month: "short", year: "numeric" });
const short = (iso: string) => date(iso, { day: "numeric", month: "short" });
const span = (s: Span | null) => (s ? `${short(s.start)} – ${short(s.end)}` : "No streak yet");

function Stat({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="rounded-2xl border border-hq-line px-3 py-2.5">
      <p className="text-lg font-semibold tabular-nums text-hq-ink">{value}</p>
      <p className="text-[11px] text-hq-ink">{label}</p>
      <p className="text-[10px] text-hq-mute">{note}</p>
    </div>
  );
}

export function GithubPanel() {
  const load = useContributions();

  if (load.status !== "ok") {
    return (
      <div className="space-y-3 text-[13px] text-hq-mute">
        <p>{load.status === "loading" ? "Fetching contributions…" : "Contribution graph is unavailable right now."}</p>
        <a href="https://github.com/talax0n" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-hq-accent">
          @talax0n on GitHub <ArrowUpRight className="size-3" />
        </a>
      </div>
    );
  }

  const { data } = load;
  const { commits, pullRequests, issues, reviews } = data.activity;
  const activity = [
    ["Commits", commits],
    ["Pull requests", pullRequests],
    ["Code review", reviews],
    ["Issues", issues],
  ] as const;
  const sum = commits + pullRequests + issues + reviews || 1;
  const others = data.repos.count - data.repos.top.length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat value={data.allTime.toLocaleString("en-US")} label="Total contributions" note={`Since ${date(data.since, { month: "short", year: "numeric" })}`} />
        <Stat value={String(data.streak.current?.days ?? 0)} label="Current streak" note={span(data.streak.current)} />
        <Stat value={String(data.streak.longest?.days ?? 0)} label="Longest streak" note={span(data.streak.longest)} />
      </div>
      <p className="text-sm font-light text-hq-mute">
        <strong className="font-semibold text-hq-ink">{data.total.toLocaleString("en-US")} contributions</strong> in the last year.
      </p>
      <div
        className="grid gap-[2px] rounded-2xl border border-hq-line p-2.5"
        style={{ gridTemplateColumns: `repeat(${data.weeks.length}, minmax(0, 1fr))` }}
      >
        {data.weeks.map((week, wi) => (
          <div key={wi} className="grid gap-[2px]">
            {week.map((d) => (
              <span
                key={d.date}
                title={`${d.count} contribution${d.count === 1 ? "" : "s"} on ${fmt(d.date)}`}
                className="aspect-square rounded-[1px]"
                style={{ background: RAMP[d.level] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[9px] uppercase text-hq-mute">
        Less
        {RAMP.map((c) => (
          <span key={c} className="size-2.5 rounded-[1px]" style={{ background: c }} />
        ))}
        More
        <a href={`https://github.com/${data.username}`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-hq-accent">
          @{data.username} <ArrowUpRight className="size-3" />
        </a>
      </div>
      <div className="space-y-1.5 rounded-2xl border border-hq-line p-3">
        {activity.map(([label, n]) => (
          <div key={label} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 text-hq-mute">{label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ebedf0]">
              <span className="block h-full rounded-full bg-[#40c463]" style={{ width: `${(n / sum) * 100}%` }} />
            </span>
            <span className="w-8 text-right tabular-nums text-hq-ink">{Math.round((n / sum) * 100)}%</span>
          </div>
        ))}
      </div>
      {data.repos.count > 0 && (
        <p className="text-xs font-light text-hq-mute">
          Contributed to{" "}
          {data.repos.top.map((name, i) => (
            <span key={name}>
              <a href={`https://github.com/${name}`} target="_blank" rel="noopener noreferrer" className="text-hq-accent">
                {name}
              </a>
              {i < data.repos.top.length - 1 ? ", " : ""}
            </span>
          ))}
          {others > 0 && ` and ${others} other ${others === 1 ? "repository" : "repositories"}`} in the last year.
        </p>
      )}
    </div>
  );
}
