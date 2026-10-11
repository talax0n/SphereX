import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { PROJECTS } from "@/data/projects";

type Project = (typeof PROJECTS)[number];

const linkClass =
  "inline-flex items-center gap-1 rounded-full border border-hq-line px-3 py-1.5 text-[11px] text-hq-accent transition-colors hover:bg-hq-bg";

function ProjectPage({ p }: { p: Project }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative aspect-[2/1] w-full shrink-0 overflow-hidden rounded-2xl border border-hq-line sm:aspect-[16/9]" style={{ background: p.gradient }}>
        <Image key={p.image} src={p.image} alt={p.title} fill sizes="460px" className="object-cover" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <p className="text-[11px] tabular-nums tracking-wider text-hq-mute">
          {p.num} / {String(PROJECTS.length).padStart(2, "0")}
        </p>
        <h3 className="font-display text-xl font-bold text-hq-ink">{p.title}</h3>
        <p className="mt-1 line-clamp-6 text-[12.5px] leading-relaxed text-hq-mute max-sm:line-clamp-4 max-sm:text-xs">
          {p.description}
        </p>
        <ul className="mt-2 flex flex-wrap gap-1">
          {p.techStack.map((t) => (
            <li key={t} className="rounded-full border border-hq-line px-2 py-0.5 text-[10px] text-hq-ink">
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.href && (
          <a href={p.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Live <ArrowUpRight className="size-3" />
          </a>
        )}
        {p.github && (
          <a href={p.github} target="_blank" rel="noopener noreferrer" className={linkClass}>
            GitHub <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

/** one book page per project */
export const PROJECT_PAGES = PROJECTS.map((p) => {
  const Page = () => <ProjectPage p={p} />;
  Page.displayName = `Project(${p.title})`;
  return Page;
});
