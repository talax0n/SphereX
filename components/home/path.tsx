import { AWARDS } from "@/data/awards";
import { EXPERIENCE } from "@/data/experience";

function Row({ main, sub, end }: { main: string; sub: string; end: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-hq-line py-3 text-sm">
      <span className="min-w-0 truncate text-hq-ink">
        {main} <span className="text-hq-mute">· {sub}</span>
      </span>
      <span className="shrink-0 text-xs text-hq-mute">{end}</span>
    </li>
  );
}

export function Path() {
  return (
    <section id="path" className="mx-auto max-w-7xl scroll-mt-16 px-5 py-24 sm:px-8 sm:py-32">
      <h2 className="text-[11px] tracking-[0.14em] text-hq-mute uppercase">Path</h2>
      <div className="mt-8 grid gap-12 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-bold text-hq-ink">Experience</h3>
          <ul className="mt-4 border-t border-hq-line">
            {EXPERIENCE.map((e) => (
              <Row key={e.company + e.role} main={e.role} sub={e.company} end={e.years} />
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-bold text-hq-ink">Awards</h3>
          <ul className="mt-4 border-t border-hq-line">
            {AWARDS.map((a) => (
              <Row key={a.title} main={a.title} sub={a.issuer} end={a.year} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
