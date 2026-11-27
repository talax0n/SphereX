"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Shot } from "@/data/cv";

const arrowCls = "grid size-7 place-items-center rounded-full border border-line font-mono text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink";

export function Shots({ shots }: { shots: Shot[] }) {
  const strip = useRef<HTMLUListElement>(null);
  // `shown` is the fraction of the strip in view, `at` is how far along it is scrolled, both 0 to 1.
  const [bar, setBar] = useState({ shown: 1, at: 0 });

  useEffect(() => {
    const el = strip.current!;
    const measure = () => {
      const hidden = el.scrollWidth - el.clientWidth;
      setBar({ shown: el.clientWidth / el.scrollWidth, at: hidden > 0 ? el.scrollLeft / hidden : 0 });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      resized.disconnect();
    };
  }, []);

  // Moves one screenshot at a time. Edges past the end clamp to it, so the last press shows the final screenshot whole.
  const step = (dir: 1 | -1) => {
    const el = strip.current!;
    const end = el.scrollWidth - el.clientWidth;
    const edges = [...el.children].map((li) => Math.min((li as HTMLElement).offsetLeft - el.offsetLeft, end));
    const left = dir > 0 ? edges.find((x) => x > el.scrollLeft + 1) : edges.findLast((x) => x < el.scrollLeft - 1);
    if (left !== undefined) el.scrollTo({ left, behavior: "smooth" });
  };

  return (
    <div className="mt-4">
      <ul ref={strip} className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shots.map((shot) => (
          <li key={shot.src} className="shrink-0">
            <a href={shot.src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line transition-opacity hover:opacity-90">
              <Image src={shot.src} alt={shot.alt} width={shot.tall ? 450 : 1280} height={shot.tall ? 1000 : 800} sizes={shot.tall ? "110px" : "390px"} className="h-48 w-auto sm:h-60" />
            </a>
          </li>
        ))}
      </ul>
      {bar.shown < 0.999 && (
        <div className="mt-3 flex items-center gap-3">
          <div aria-hidden className="relative h-px flex-1 bg-line">
            <span className="absolute -top-px h-[3px] rounded-full bg-accent" style={{ width: `${bar.shown * 100}%`, left: `${bar.at * (1 - bar.shown) * 100}%` }} />
          </div>
          <button type="button" aria-label="Previous screenshots" disabled={bar.at < 0.01} onClick={() => step(-1)} className={arrowCls}>←</button>
          <button type="button" aria-label="Next screenshots" disabled={bar.at > 0.99} onClick={() => step(1)} className={arrowCls}>→</button>
        </div>
      )}
    </div>
  );
}
