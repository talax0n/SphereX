import type { Metadata } from "next";
import Link from "next/link";
import { BOOKS } from "@/components/hq/panels";
import { PROFILE } from "@/data/profile";
import { STATIONS } from "@/data/stations";

const description = `${PROFILE.name}, ${PROFILE.role} in ${PROFILE.location}. Projects, experience, skills, awards and how to reach me, on one plain page.`;

export const metadata: Metadata = {
  title: "Theo Niomba · Read it all",
  description,
  alternates: { canonical: "/read" },
  openGraph: { title: "Theo Niomba · Read it all", description, url: "/read", siteName: "SphereX", type: "profile" },
};

export default function Read() {
  return (
    // the planet locks the body's scroll, so this page scrolls itself
    <div className="h-dvh overflow-y-auto">
      <main className="mx-auto max-w-2xl px-5 py-10 text-hq-ink sm:py-16">
        <Link href="/" className="text-[13px] font-semibold text-hq-accent hover:underline">
          Walk the planet instead →
        </Link>
        <header className="mt-10">
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">{PROFILE.name}</h1>
          <p className="mt-2 text-[11px] tracking-[0.12em] text-hq-mute uppercase">{PROFILE.role}</p>
          <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-hq-mute">
            {STATIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="hover:text-hq-accent">
                {s.label}
              </a>
            ))}
          </nav>
        </header>
        {/* the panels clamp text to fit a book page; here there's room for all of it */}
        {STATIONS.map((s) => (
          <section key={s.id} id={s.id} className="mt-12 scroll-mt-6 border-t border-hq-line pt-8 [&_p]:[-webkit-line-clamp:unset]">
            <h2 className="font-display text-2xl font-bold">{s.label}</h2>
            <div className="mt-5 flex flex-col gap-12">
              {BOOKS[s.id].map((Page, i) => (
                <Page key={i} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
