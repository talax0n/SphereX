import Image from "next/image";
import { PROJECTS } from "@/data/projects";

export function Work() {
  return (
    <section id="work" className="mx-auto max-w-7xl scroll-mt-16 px-5 py-24 sm:px-8 sm:py-32">
      <h2 className="text-[11px] tracking-[0.14em] text-hq-mute uppercase">Selected work</h2>
      <ul className="mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2">
        {PROJECTS.map((p) => (
          <li key={p.num}>
            <a href={p.href} target="_blank" rel="noopener noreferrer" className="group block rounded-3xl">
              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl" style={{ background: p.gradient }}>
                {p.image && (
                  <Image
                    src={p.image}
                    alt={`${p.title} screenshot`}
                    fill
                    sizes="(min-width: 1280px) 600px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                )}
                <ul className="absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {p.techStack.map((t) => (
                    <li key={t} className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-hq-ink backdrop-blur">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <h3 className="mt-4 flex items-baseline gap-3 font-display text-3xl font-bold tracking-tight text-hq-ink sm:text-4xl">
                <span className="text-sm font-normal text-hq-mute">{p.num}</span>
                {p.title}
              </h3>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
