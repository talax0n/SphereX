import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { type Group, Vector3 } from "three";
import { IntroThread, introScale } from "../hud/intro";
import { ctl } from "../game";
import { R } from "./planet";

const side = new Vector3();
/** from the bubble anchor up past the hat with room for the cheer hop, so the phone thread never covers the head */
const HEAD_TOP = 0.8;

interface IntroBubbleProps {
  step: number;
  onNext: () => void;
  onSkip: () => void;
  /** called once the bubble is on screen, so the HTML placeholder can step aside */
  onShown: () => void;
  appear: boolean;
}

/** The player's speech bubble: beside the head on wide screens, above it on phones. */
export function IntroBubble({ step, onNext, onSkip, onShown, appear }: IntroBubbleProps) {
  const anchor = useRef<Group>(null);

  useFrame(({ size }) => {
    const g = anchor.current;
    if (!g) return;
    const n = ctl.player.n;
    g.position.copy(n).multiplyScalar(R + ctl.alt + 0.45);
    // the close-up looks along the carried north, so screen-right is north × up
    if (size.width < 640) g.position.addScaledVector(n, HEAD_TOP);
    else g.position.addScaledVector(side.crossVectors(ctl.north, n), 0.62);
  });

  const scale = useThree(({ size }) => introScale(size.width, size.height));
  // the placeholder only stands in on phones, so wider screens still see the first line pop in
  const wide = useThree(({ size }) => size.width >= 640);
  useEffect(() => {
    // two frames: one for the Html portal to mount, one for useFrame to place it by the head
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(onShown)));
    return () => cancelAnimationFrame(id);
  }, [onShown]);
  return (
    <group ref={anchor}>
      <Html zIndexRange={[16, 0]}>
        <IntroThread step={step} onNext={onNext} onSkip={onSkip} scale={scale} appear={appear || wide} />
      </Html>
    </group>
  );
}
