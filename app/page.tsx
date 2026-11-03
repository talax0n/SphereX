import { WipStage } from "@/components/wip/stage";
import { PROFILE } from "@/data/profile";

const LINKS = [{ label: "Email", href: `mailto:${PROFILE.email}` }, ...PROFILE.links];

export default function Home() {
  return (
    <main className="h-dvh overflow-y-auto bg-wip-bg text-wip-ink">
      <div className="mx-auto grid min-h-full max-w-6xl content-center gap-8 px-4 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
        <div className="flex flex-col gap-6 lg:gap-10">
          <header>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-wip-ink bg-[#ffc83d] px-3 py-1 text-[11px] font-bold tracking-[0.12em] uppercase">
              <span className="size-1.5 rounded-full bg-wip-ink" />
              Under construction
            </p>
            <h1 className="mt-4 font-display text-[clamp(2.2rem,9vw,3.4rem)] lg:text-[clamp(2.4rem,3.6vw,3.6rem)] leading-[0.98] font-extrabold tracking-tight text-balance">
              Something <span className="bg-[linear-gradient(transparent_62%,#ffc83d_62%,#ffc83d_92%,transparent_92%)]">new</span> is being built.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-wip-mute">
              I&apos;m tearing down the old planet and rebuilding this site from scratch. Pim, my little builder, is on the job. Come back soon.
            </p>
          </header>
          <nav aria-label="Elsewhere" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold">
            {LINKS.map((l) => (
              <a key={l.label} href={l.href} className="underline-offset-4 hover:underline" {...(l.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}>
                {l.label} ↗
              </a>
            ))}
          </nav>
        </div>
        <WipStage />
      </div>
    </main>
  );
}
