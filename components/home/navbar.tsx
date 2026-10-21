import { Globe } from "lucide-react";
import Link from "next/link";
import { PROFILE } from "@/data/profile";

const ANCHORS = [
  { label: "Work", href: "#work" },
  { label: "Stack", href: "#stack" },
  { label: "Path", href: "#path" },
  { label: "Contact", href: "#contact" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-hq-line/60 bg-hq-bg/70 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3 sm:px-8">
        <a href="#top" className="font-display text-xl font-extrabold tracking-tight text-hq-ink">
          {PROFILE.name}
        </a>
        <div className="ml-auto hidden gap-6 text-[13px] text-hq-mute sm:flex">
          {ANCHORS.map((a) => (
            <a key={a.href} href={a.href} className="transition-colors hover:text-hq-ink">
              {a.label}
            </a>
          ))}
        </div>
        <Link
          href="/world"
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-hq-accent px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-105 sm:ml-0"
        >
          <Globe size={14} aria-hidden="true" />
          Open world
        </Link>
      </nav>
    </header>
  );
}
