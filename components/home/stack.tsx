import { Logo } from "@/components/home/logo";
import { SKILLS } from "@/data/skills";

export function Stack() {
  return (
    <section id="stack" className="mx-auto max-w-7xl scroll-mt-16 px-5 py-24 sm:px-8 sm:py-32">
      <h2 className="text-[11px] tracking-[0.14em] text-hq-mute uppercase">Stack</h2>
      <ul className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-3xl bg-hq-line sm:grid-cols-5 lg:grid-cols-9">
        {SKILLS.map((s) => (
          <li key={s.name} className="flex aspect-square flex-col items-center justify-center gap-3 bg-hq-bg p-3">
            <Logo name={s.name} icon={s.icon} />
            <span className="text-center text-[10px] text-hq-mute">{s.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
