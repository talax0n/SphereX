import Image from "next/image";
import type { ReactNode } from "react";
import { CV, type Role } from "@/data/cv";
import { CHANGELOG } from "@/data/changelog";
import { AiPulse } from "./ai-pulse";
import { AsciiShape } from "./ascii-shape";
import { Section } from "./section";
import { getGitHub, timeAgo, type Day, type GitHub } from "@/data/github";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Heatmap levels blend the green over the line colour, so both themes follow the vars.
const LEVEL_PCT = [0, 30, 55, 80, 100];
const cell = (level: number) =>
  level ? `color-mix(in srgb, var(--green) ${LEVEL_PCT[level]}%, var(--line))` : "var(--line)";

const linkCls = "underline decoration-mute/50 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent";

// Points mark bold with **text**; odd segments after splitting are bold.
function Rich({ text, cls = "font-bold" }: { text: string; cls?: string }) {
  return text.split("**").map((part, i) => (i % 2 ? <strong key={i} className={cls}>{part}</strong> : part));
}

function Points({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((p) => (
        <li key={p} className="flex gap-2">
          <span className="text-mute" aria-hidden>–</span>
          <span><Rich text={p} /></span>
        </li>
      ))}
    </ul>
  );
}

function Roles({ roles }: { roles: Role[] }) {
  return (
    <div className="space-y-7">
      {roles.map((r) => (
        <article key={`${r.org}-${r.dates}`}>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <h3 className="font-bold">{r.org}</h3>
            <p className="font-mono text-xs text-mute">{r.dates}</p>
          </div>
          <p className="text-mute">{r.title} · {r.place}</p>
          <Points items={r.points} />
        </article>
      ))}
    </div>
  );
}

const A = ({ children }: { children: ReactNode }) => <strong className="font-bold text-accent">{children}</strong>;

function Stats({ items }: { items: [value: string, label: string][] }) {
  return (
    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
      {items.map(([value, label]) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-xs text-mute">{label}</dt>
          <dd className="font-mono text-2xl font-bold tracking-tight">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Live({ gh }: { gh: GitHub }) {
  const shipping = gh.repos.slice(0, 3);
  return (
    <p className="mt-4 text-sm text-mute">
      {shipping.length > 0 && (
        <>
          Recently shipping{" "}
          {shipping.map((r, i) => (
            <span key={r.name}>
              {i > 0 && (i === shipping.length - 1 ? " and " : ", ")}
              <a href={r.url} className={`text-ink ${linkCls}`}>{r.name}</a>
            </span>
          ))}{" "}
          (latest: {timeAgo(gh.repos[0].pushedAt)}).
        </>
      )}
    </p>
  );
}

function Heatmap({ weeks }: { weeks: Day[][] }) {
  const lead = new Date(`${weeks[0][0].date}T00:00:00Z`).getUTCDay();
  const monthOf = (w: Day[]) => new Date(`${w[0].date}T00:00:00Z`).getUTCMonth();
  return (
    <div>
      {/* row-reverse starts the scroll at the right edge, so the newest weeks show first on phones, no JS. */}
      <div className="flex flex-row-reverse overflow-x-auto pb-2">
        <div className="flex shrink-0 gap-[3px]" role="img" aria-label="Contribution heatmap for the past year">
          {weeks.map((w, i) => {
            // A partial first month would collide with the next label, so it only gets one if it spans 3+ weeks.
            const starts = i === 0 ? monthOf(weeks[Math.min(2, weeks.length - 1)]) === monthOf(w) : monthOf(w) !== monthOf(weeks[i - 1]);
            const label = starts ? MONTHS[monthOf(w)] : "";
            return (
              <div key={w[0].date} className="flex w-[10px] flex-col gap-[3px]">
                <span className="h-[14px] whitespace-nowrap text-[10px] leading-[14px] text-mute">{label}</span>
                {i === 0 && Array.from({ length: lead }, (_, k) => <span key={k} className="h-[10px]" />)}
                {w.map((d) => (
                  <span
                    key={d.date}
                    data-level={d.level}
                    title={`${d.count} on ${d.date}`}
                    className="h-[10px] w-[10px] rounded-[2px]"
                    style={{ background: cell(d.level) }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-mute">
        Less
        {LEVEL_PCT.map((_, l) => (
          <span key={l} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: cell(l) }} />
        ))}
        More
      </div>
    </div>
  );
}

function Activity({ gh }: { gh: GitHub }) {
  const best = gh.best && new Date(`${gh.best.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <Section id="activity" title="Building in public">
      <Heatmap weeks={gh.weeks} />
      <p className="mt-3 font-mono text-xs text-mute">
        Longest streak: <A>{gh.longest}</A> days
        {gh.best && <> · Best day: <A>{gh.best.count}</A> on {best}</>}
      </p>
      {gh.repos.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 font-bold">Recent repos</h3>
          <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {gh.repos.map((r) => (
              <li key={r.name}>
                <a href={r.url} className="font-bold transition-colors hover:text-accent">{r.name}</a>
                {r.description && <p className="text-mute">{r.description}</p>}
                <p className="font-mono text-xs text-mute">
                  {[r.language, `★ ${r.stars}`, `pushed ${timeAgo(r.pushedAt)}`].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

export default async function Home() {
  const { version, date } = CHANGELOG[0];
  const gh = await getGitHub();
  const years = [...new Set(CV.awards.map((a) => a.date.slice(-4)))].sort();
  const prizes = CV.awards.reduce((sum, a) => sum + (a.prize ?? 0), 0);
  const span = years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : years[0];
  return (
    <main className="mx-auto max-w-[46rem] px-5 py-14 text-[15px] leading-relaxed sm:py-20 sm:text-base lg:max-w-[59rem]">
      <header>
        <div className="flex flex-col-reverse gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Hi, I&apos;m Theo.</h1>
            <p className="mt-4 max-w-[36rem] text-xl leading-snug text-mute">{CV.tagline}</p>
          </div>
          <AsciiShape className="w-56 shrink-0 lg:-my-8 lg:w-80" />
        </div>
        <Stats
          items={[
            ...(gh ? ([[gh.total.toLocaleString("en-US"), "contributions this year"], [String(gh.repoCount), "public repos"]] as [string, string][]) : []),
            [String(CV.awards.length), "hackathon and scholarship wins"],
            [`$${prizes.toLocaleString("en-US")}`, "in prizes"],
          ]}
        />
        {gh && <Live gh={gh} />}
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {CV.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkCls}>{l.label}</a>
              </li>
            ))}
          </ul>
          <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-mute">
            {["experience", "projects", "achievements", ...(gh ? ["activity"] : [])].map((id) => (
              <a key={id} href={`#${id}`} className="transition-colors hover:text-accent">{id}</a>
            ))}
          </nav>
        </div>
      </header>


      <Section id="experience" title="Experience">
        <Roles roles={CV.experience} />
      </Section>

      <Section id="projects" title="Projects">
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
          {CV.projects.map((p, i) => (
            // With an odd count the first project spans the row, so no card is left alone at the end.
            <article key={p.name} className={i === 0 && CV.projects.length % 2 ? "sm:col-span-2 sm:grid sm:grid-cols-2 sm:items-center sm:gap-6" : ""}>
              {p.image && (
                <a href={p.href} className="mb-3 block overflow-hidden rounded-lg border border-line transition-opacity hover:opacity-90">
                  <Image src={p.image} alt={`${p.name} homepage`} width={1280} height={800} sizes="(min-width: 640px) 360px, 100vw" className="h-auto w-full" />
                </a>
              )}
              <div>
              <h3 className="font-bold">
                {p.href ? <a href={p.href} className="transition-colors hover:text-accent">{p.name} <span aria-hidden className="font-normal text-mute">↗</span></a> : p.name}
              </h3>
              <p className="font-mono text-xs text-mute">{p.stack.join(" · ")}</p>
              {p.points.map((pt) => (
                <p key={pt} className="mt-2 text-mute"><Rich text={pt} cls="font-bold text-ink" /></p>
              ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section id="achievements" title="Achievements">
        <p className="mb-5 text-mute">
          <Rich text={`**${CV.awards.length}** wins and **$${prizes.toLocaleString("en-US")}** in prizes across hackathons and scholarships in ${span}.`} cls="font-bold text-accent" />
        </p>
        <ul className="space-y-4">
          {CV.awards.map((a) => (
            <li key={a.place + a.event} className="flex gap-3">
              <span aria-hidden>{a.emoji}</span>
              <div className="flex-1 sm:flex sm:justify-between sm:gap-4">
                <div>
                  <span className="font-bold">{a.place}</span>
                  {a.project && <> · {a.project}</>}
                  {a.prize && <span className="font-bold text-accent"> · ${a.prize.toLocaleString("en-US")}</span>}
                  <p className="text-mute">{a.event}{a.by ? ` · ${a.by}` : ""}</p>
                </div>
                <p className="font-mono text-xs text-mute sm:pt-1">{a.date}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {gh && <Activity gh={gh} />}

      <Section title="Education">
        <Roles roles={CV.education} />
      </Section>

      <Section title="Skills">
        <dl className="space-y-4">
          {CV.skills.map(([cat, items]) => (
            <div key={cat} className="sm:flex sm:items-start sm:gap-4">
              <dt className="mb-2 font-bold sm:mb-0 sm:w-32 sm:shrink-0 sm:pt-1">{cat}</dt>
              <dd>
                <ul className="flex flex-wrap gap-2">
                  {items.map((s) => (
                    // Light tile in both themes, so dark logos (Next.js, Rust, Flask) stay visible in dark mode.
                    <li key={s.name} className="flex items-center gap-2 rounded-md border border-line py-1 pr-2.5 pl-1 font-mono text-xs">
                      <span className="grid size-6 place-items-center rounded bg-tile">
                        <Image src={s.icon} alt="" width={16} height={16} className="size-4 object-contain" />
                      </span>
                      {s.name}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <footer className="mt-12 border-t border-line pt-4 font-mono text-xs text-mute">
        v{version} · updated {date}
      </footer>
      <AiPulse />
    </main>
  );
}
