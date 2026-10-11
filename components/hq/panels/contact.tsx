"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { PROFILE } from "@/data/profile";

export function ContactPanel() {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(PROFILE.email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  return (
    <div className="flex h-full flex-col gap-4">
      <a
        href={`mailto:${PROFILE.email}`}
        className="font-display text-3xl font-extrabold leading-[0.95] text-hq-accent hover:underline"
      >
        Let&apos;s talk <ArrowUpRight className="inline size-6" />
      </a>
      <div className="flex items-center gap-2 text-[13px] text-hq-ink">
        {PROFILE.email}
        <button type="button" onClick={copy} aria-label="Copy email address" className="rounded-full p-1 hover:bg-hq-bg">
          {copied ? <Check className="size-3.5 text-hq-accent" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <p className="text-xs text-hq-mute">{PROFILE.location}</p>
      <ul className="flex flex-wrap gap-2">
        {PROFILE.links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-hq-line px-3.5 py-1.5 text-[11px] text-hq-accent transition-colors hover:bg-hq-bg"
            >
              {l.label} <ArrowUpRight className="size-3" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-[11px] text-hq-mute">© 2026 Theo Niomba · {PROFILE.role}</p>
    </div>
  );
}
