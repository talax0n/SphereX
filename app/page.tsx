import { WipStage } from "@/components/wip/stage";
import { PROFILE } from "@/data/profile";

const LINKS = [{ label: "Email", href: `mailto:${PROFILE.email}` }, ...PROFILE.links];

export default function Home() {
  return (
    <main className="relative h-dvh overflow-hidden bg-hq-bg text-hq-ink">
      <WipStage />
      <div className="pointer-events-none relative z-10 flex h-full max-w-xl flex-col justify-between p-5 pt-8 sm:p-10 lg:justify-center lg:gap-10">
        <header>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-hq-accent uppercase">Under construction</p>
          <h1 className="mt-3 font-display text-[clamp(2.4rem,7vw,4.5rem)] leading-[0.95] font-extrabold tracking-tight text-balance">
            Something new is being built.
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-hq-mute">
            I&apos;m tearing down the old planet and rebuilding this site from scratch. Bolt is on the job. Come back soon.
          </p>
        </header>
        <nav aria-label="Elsewhere" className="flex flex-wrap gap-x-5 gap-y-2 pb-24 text-[13px] font-semibold sm:pb-0 [&_a]:pointer-events-auto">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="hover:text-hq-accent hover:underline" {...(l.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}>
              {l.label} ↗
            </a>
          ))}
        </nav>
      </div>
    </main>
  );
}
