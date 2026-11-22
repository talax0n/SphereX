import type { ReactNode } from "react";

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-6">
      <h2 className="mb-5 text-base font-bold">
        <span className="text-accent">## </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
