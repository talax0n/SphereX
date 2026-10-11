import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { type Group, Vector3 } from "three";
import { type Provider, say } from "@/data/pulse";
import { ctl } from "../game";
import { R, arc } from "./planet";
import { type Activity, TIME_SCALE, reconcile, tend, town } from "./work";
/** brand marks from simple-icons (Claude from v16, OpenAI from v13 before its removal) */
const LOGO: Record<Provider, { name: string; color: string; d: string }> = {
  claude: { name: "Claude", color: "#D97757", d: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" },
  codex: { name: "Codex", color: "currentColor", d: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" },
};
const HEAD = R + 1.1;
/** bubbles only show for villagers within this walking distance of the player */
const NEAR = 3;
/** px between stacked bubbles */
const GAP = 6;
/** px from the head to the bubble's bottom edge, room for its tail */
const LIFT = 12;
const at = new Vector3();
/** screen boxes of this frame's visible bubbles, centre x/y, reused */
const boxes: { el: HTMLDivElement; x: number; y: number; w: number; h: number }[] = [];

function Logo({ provider }: { provider: Provider }) {
  const { name, color, d } = LOGO[provider];
  return (
    <svg role="img" aria-label={name} viewBox="0 0 24 24" className="size-3.5 shrink-0" fill={color}>
      <title>{name}</title>
      <path d={d} />
    </svg>
  );
}

interface Line {
  title: string | null;
  provider: Provider | null;
  status: string;
}

/** What a villager's bubble says, or null for an empty slot. */
function lineOf(a: Activity): Line | null {
  if (a.s === "wander") return null;
  const status = a.s === "asleep" ? "zzz" : a.s === "bedtime" ? "done" : say(a.agent);
  return { title: a.agent.title, provider: a.agent.provider, status };
}

/**
 * One villager per live agent, dropped from the sky into the projects HQ to work a desk or a gym machine;
 * a finished one walks to a bed in its nap corner, sleeps it off, then its slot empties.
 */
export function Agents() {
  // activities are replaced, never mutated, so a shallow copy is a faithful snapshot for rendering
  const [acts, setActs] = useState(() => [...town.acts]);
  const rev = useRef(town.rev);
  const seen = useRef<object | null>(null);
  const heads = useRef<(Group | null)[]>([]);
  const bubbles = useRef<(HTMLDivElement | null)[]>([]);
  const lines = acts.map(lineOf);

  useFrame(({ camera, clock, size }) => {
    if (seen.current !== ctl.pulse) {
      seen.current = ctl.pulse;
      reconcile(ctl.pulse, ctl.villagers);
    }
    tend(ctl.villagers, clock.elapsedTime * TIME_SCALE);
    if (town.rev !== rev.current) {
      rev.current = town.rev;
      setActs([...town.acts]);
    }
    boxes.length = 0;
    ctl.villagers.forEach((v, i) => {
      const head = heads.current[i];
      const bubble = bubbles.current[i];
      if (!head || !bubble) return;
      head.position.copy(v.n).multiplyScalar(HEAD + v.lift + v.alt);
      // Html ignores group.visible and would paint through the planet, so fade the DOM itself
      const shown = v.n.dot(camera.position) > 0 && arc(v.n, ctl.player.n) < NEAR;
      bubble.style.opacity = shown ? "1" : "0";
      if (!shown) return;
      at.copy(head.position).project(camera);
      const x = ((at.x + 1) / 2) * size.width;
      const y = ((1 - at.y) / 2) * size.height;
      const h = bubble.offsetHeight;
      boxes.push({ el: bubble, x, y: y - LIFT - h / 2, w: bubble.offsetWidth, h });
    });
    // the bubble lowest on screen keeps its spot; any that would overlap one already placed climbs above it
    boxes.sort((a, b) => b.y - a.y);
    boxes.forEach((b, k) => {
      const y0 = b.y;
      for (let moved = true; moved; ) {
        moved = false;
        for (let j = 0; j < k; j++) {
          const p = boxes[j];
          if (Math.abs(b.x - p.x) * 2 >= b.w + p.w + GAP * 2 || Math.abs(b.y - p.y) * 2 >= b.h + p.h + GAP * 2) continue;
          b.y = p.y - (b.h + p.h) / 2 - GAP;
          moved = true;
        }
      }
      b.el.style.transform = `translateY(${b.y - y0}px)`;
    });
  });

  useEffect(
    () => () => {
      for (const v of ctl.villagers) v.goal = v.skip = v.pin = null;
    },
    [],
  );

  return lines.map((line, i) => line && (
    <group key={i} ref={(g) => void (heads.current[i] = g)}>
      <Html center zIndexRange={[13, 0]} style={{ pointerEvents: "none" }}>
        <div className="relative h-0 w-0">
          <div
            ref={(d) => void (bubbles.current[i] = d)}
            style={{ opacity: 0, bottom: LIFT }}
            className="hq-bubble absolute left-1/2 w-max max-w-[220px] -translate-x-1/2 rounded-2xl border border-hq-line bg-white px-3 py-2 text-left text-[12px] leading-snug text-hq-ink shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] transition-[opacity,transform] duration-300 max-sm:max-w-[180px] max-sm:text-[11px]"
          >
            {line.title && <div className="font-medium">{line.title}</div>}
            <div className={line.title ? "flex items-center gap-1.5 text-[11px] text-hq-ink/60" : "flex items-center gap-1.5"}>
              {line.provider && <Logo provider={line.provider} />}
              {line.status}
            </div>
            <span aria-hidden className="absolute top-full left-1/2 -mt-[5px] size-2.5 -translate-x-1/2 rotate-45 border-r border-b border-hq-line bg-white" />
          </div>
        </div>
      </Html>
    </group>
  ));
}
