import type { ReactNode } from "react";

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-6 border-t border-line pt-6 lg:grid lg:grid-cols-[9rem_1fr] lg:gap-8">
      <h2 className="mb-5 font-mono text-xs font-bold uppercase tracking-[0.16em] text-mute lg:mb-0 lg:pt-1">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
