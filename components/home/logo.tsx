"use client";

import { useState } from "react";

export function Logo({ name, icon }: { name: string; icon?: string }) {
  const [broken, setBroken] = useState(!icon);
  if (broken) {
    return (
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-hq-ink font-display text-sm font-bold text-hq-bg">
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external devicon CDN, not an optimizable local asset
    <img
      src={`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${icon}/${icon}-original.svg`}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      onError={() => setBroken(true)}
      // a 404 can land before hydration attaches onError
      ref={(el) => {
        if (el?.complete && !el.naturalWidth) setBroken(true);
      }}
      className="size-10"
    />
  );
}
