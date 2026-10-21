"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { PROFILE } from "@/data/profile";

export function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 32 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <section id="top" className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-7xl scroll-mt-16 flex-col justify-between gap-8 px-5 pt-10 pb-8 sm:px-8">
      <div>
        <motion.h1
          {...rise(0)}
          className="font-display text-[clamp(5rem,18vw,17rem)] leading-[0.85] font-extrabold tracking-tighter text-hq-ink"
        >
          {PROFILE.name}
        </motion.h1>
        <motion.p {...rise(0.1)} className="mt-4 text-[11px] tracking-[0.14em] text-hq-mute uppercase">
          {PROFILE.role} · {PROFILE.location}
        </motion.p>
      </div>
      <motion.div {...rise(0.2)}>
        <Link
          href="/world"
          className="group relative block aspect-[4/3] max-h-[45dvh] w-full overflow-hidden rounded-3xl bg-hq-line sm:aspect-[21/9]"
        >
          <Image
            src="/world-preview.webp"
            alt="A tiny clay planet you can walk around"
            fill
            priority
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-4 py-2 text-[13px] font-semibold text-hq-ink backdrop-blur">
            Walk the planet →
          </span>
        </Link>
      </motion.div>
    </section>
  );
}
