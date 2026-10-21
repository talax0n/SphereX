import { Globe } from "lucide-react";
import Link from "next/link";
import { PROFILE } from "@/data/profile";

export function Contact() {
  const [user, domain] = PROFILE.email.split("@");
  return (
    <section id="contact" className="mx-auto max-w-7xl scroll-mt-16 px-5 pt-24 pb-8 sm:px-8 sm:pt-32">
      <h2 className="text-[11px] tracking-[0.14em] text-hq-mute uppercase">Contact</h2>
      <a
        href={`mailto:${PROFILE.email}`}
        className="mt-6 block font-display text-[clamp(1.75rem,7vw,6.5rem)] leading-none font-extrabold tracking-tighter break-words text-hq-ink transition-colors hover:text-hq-accent"
      >
        {user}
        <wbr />@{domain}
      </a>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {PROFILE.links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-hq-line px-4 py-2 text-[13px] text-hq-ink transition-colors hover:border-hq-ink"
          >
            {l.label}
          </a>
        ))}
        <Link href="/world" className="inline-flex items-center gap-1.5 rounded-full bg-hq-accent px-4 py-2 text-[13px] font-semibold text-white">
          <Globe size={14} aria-hidden="true" />
          Open world
        </Link>
      </div>
      <footer className="mt-24 border-t border-hq-line pt-4 text-xs text-hq-mute">
        © {new Date().getFullYear()} {PROFILE.name}
      </footer>
    </section>
  );
}
