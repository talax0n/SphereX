import * as React from "react";
import { Dots, FaceText, Line, Solid } from "@/components/iso/react/draw";
import {
  BASE_ART,
  BASKET_ART,
  BODY_ART,
  CARRIAGE_ART,
  CHEEK_ART,
  DECK_ART,
  GUIDE_ART,
  KEY_ART,
  LEVER_BOSS,
  NOSE_ART,
  RIBBON_ART,
  SPACE_ART,
  SPOOL_ART,
  SPOOL_WELLS,
  VIBRATOR_ART,
  type Faded,
} from "./geometry";
import { TypewriterLive } from "./live";
import { SPACE } from "./view";

function Ribs({ list, tone = "lo" }: { list: Faded[]; tone?: "lo" | "mid" | "faint" }) {
  return (
    <g>
      {list.map((rib, index) => (
        <path key={index} className="iso-line" data-tone={tone} d={rib.d} opacity={rib.alpha < 1 ? Math.round(rib.alpha * 100) / 100 : undefined} />
      ))}
    </g>
  );
}

const BASE = (
  <g key="base">
    <path className="iso-halo" d={BASE_ART.halo} />
    {BASE_ART.feet.map(([flange, foot], index) => (
      <g key={index}>
        <Solid paths={flange!} tone="lo" />
        <Solid paths={foot!} tone="mid" />
      </g>
    ))}
    <Solid paths={BASE_ART.slab} tone="mid" inner={<Line d={BASE_ART.seam} tone="faint" />} />
    <Line d={BASE_ART.screwRings} tone="lo" />
    <Dots points={BASE_ART.screws} size={0.55} tone="mid" />
    <Solid paths={NOSE_ART.badge} tone="lo" crease="none" />
    <FaceText transform={NOSE_ART.badgeText} size={4.6} tone="hi" anchor="middle">
      THEO
    </FaceText>
    <Dots points={NOSE_ART.badgeRivets} size={0.45} tone="mid" />
  </g>
);

const [LEFT_CHEEK, RIGHT_CHEEK] = [0, 1].map((side) => (
  <g key={`cheek-${side}`}>
    <Solid paths={BODY_ART.cheeks[side]!} tone="mid" inner={<Line d={BODY_ART.cheekSeams[side]!} tone="faint" />} />
    <Dots points={BODY_ART.cheekScrews.slice(side * 2, side * 2 + 2)} size={0.5} tone="mid" />
    <Line d={SPOOL_WELLS[side]!} tone="faint" />
  </g>
));

const BODY = (
  <g key="body">
    <Solid paths={BODY_ART.rear} tone="mid" inner={<Line d={BODY_ART.rearSeam} tone="faint" />} />
    <Line d={BODY_ART.rearScrewRings} tone="lo" />
    <Dots points={BODY_ART.rearScrews} size={0.5} tone="mid" />
    <Solid paths={BODY_ART.rack} tone="lo" crease="none" />
    <Line d={BODY_ART.rackTeeth} tone="faint" />
    {BODY_ART.bearings.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
    <Dots points={BODY_ART.bearingBalls} size={0.6} tone="hi" />
    {LEFT_CHEEK}
    <Solid paths={BODY_ART.well} tone="lo" crease="none" />
    {RIGHT_CHEEK}
    <Solid paths={CHEEK_ART.plate} tone="lo" crease="none" />
    <Line d={CHEEK_ART.plateLine} tone="faint" />
    <Line d={CHEEK_ART.plateRule} tone="lo" free />
    <Dots points={CHEEK_ART.plateScrews} size={0.45} tone="mid" />
    <Line d={CHEEK_ART.slot} tone="lo" />
    <Line d={CHEEK_ART.slotInner} tone="faint" />
    <Dots points={CHEEK_ART.marks} size={0.55} tone="hi" />
    <Solid paths={CHEEK_ART.knobStem} tone="mid" crease="none" />
    <Solid paths={CHEEK_ART.knob} tone="mid" />
  </g>
);

const C = CARRIAGE_ART;
const knob = (side: 0 | 1) => {
  const k = C.knobs[side]!;
  const parts = [
    <Solid key="cap" paths={k.cap} tone="mid" inner={<Line d={k.capRing} tone="faint" />} />,
    <Solid key="body" paths={k.body} tone="mid" inner={<Ribs list={k.knurl} />} />,
    <Solid key="neck" paths={k.neck} tone="mid" crease="none" />,
  ];
  return <g key={`knob-${side}`}>{side ? parts.reverse() : parts}</g>;
};

const CARRIAGE = (
  <g key="carriage">
    <Solid paths={C.rail} tone="mid" inner={<Line d={C.railGroove} tone="faint" />} />
    <Solid paths={C.wall} tone="mid" />
    <Dots points={C.wallScrews} size={0.5} tone="mid" />
    <Solid paths={C.release.arm} tone="mid" crease="none" />
    <Solid paths={C.release.ball} tone="mid" />
    <Solid paths={C.table} tone="lo" inner={<Line d={C.tableRib} tone="faint" />} />
    {knob(0)}
    <Solid paths={C.ends[0]!} tone="mid" />
    <Dots points={C.endScrews[0]!} size={0.5} tone="mid" />
    <Solid paths={C.ratchet} tone="mid" inner={<Ribs list={C.ratchetTeeth} />} />
    <Solid paths={C.shafts[0]!} tone="mid" crease="none" />
    <Solid paths={C.hubs[0]!} tone="mid" />
    <Solid paths={C.platen} tone="hi" crease="none" className="tw-rubber" inner={<Line d={C.platenSeams} tone="mid" />} />
    <Solid paths={C.hubs[1]!} tone="mid" />
    <Solid paths={C.shafts[1]!} tone="mid" crease="none" />
    <Solid paths={C.ends[1]!} tone="mid" />
    <Dots points={C.endScrews[1]!} size={0.5} tone="mid" />
    {knob(1)}
  </g>
);

const SHEET = (
  <g key="sheet">
    <path className="tw-paper" d={C.sheet.fill} />
    <path className="tw-paper-band" d={C.sheet.band} />
    <path className="iso-line" data-tone="mid" d={C.sheet.fill} />
  </g>
);

const CARRIAGE_FRONT = (
  <g key="carriage-front">
    {C.bailArms.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" crease="none" />
    ))}
    <Dots points={C.bailPins} size={0.7} tone="hi" />
    <Solid paths={C.bail} tone="mid" crease="none" />
    {C.rollers.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
    <Solid paths={C.tie} tone="mid" />
    <Line d={C.scaleMinor} tone="lo" />
    <Line d={C.scaleMajor} tone="mid" />
  </g>
);

const GUIDE = (
  <g key="guide">
    <Solid paths={GUIDE_ART.post} tone="mid" />
    <Solid paths={GUIDE_ART.carrier} tone="mid" />
    <Dots points={GUIDE_ART.carrierScrews} size={0.45} tone="mid" />
    {GUIDE_ART.guides.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
    <Solid paths={GUIDE_ART.stem} tone="mid" crease="none" />
    <Solid paths={GUIDE_ART.pointerArm} tone="mid" crease="none" />
    <Solid paths={GUIDE_ART.pointer} tone="hi" />
  </g>
);

const B = BASKET_ART;
const BASKET = (
  <g key="basket">
    <Solid paths={B.segment} tone="mid" />
    <Line d={B.pivotWire} tone="lo" />
    <Dots points={B.segmentScrews} size={0.5} tone="mid" />
    <Solid paths={B.restFrame} tone="mid" />
    <Solid paths={B.felt} tone="lo" crease="none" className="tw-felt" />
    {B.bars.map(({ id, paths }) => (
      <g key={id} data-bar={id}>
        <Solid paths={paths.bar} tone="mid" crease="none" />
        <Solid paths={paths.slug} tone="mid" />
      </g>
    ))}
  </g>
);

const RIBBONS = (
  <g key="ribbons">
    {RIBBON_ART.map((d, index) => (
      <path key={index} className="tw-ribbon" d={d} />
    ))}
  </g>
);

const VIBRATOR = (
  <g key="vibrator">
    <Solid paths={VIBRATOR_ART.plate} tone="mid" inner={<Line d={VIBRATOR_ART.window} tone="lo" />} />
    <Dots points={VIBRATOR_ART.rivets} size={0.45} tone="mid" />
  </g>
);

const SPOOLS = (
  <g key="spools">
    {SPOOL_ART.map((spool, index) => (
      <g key={index}>
        <Solid paths={spool.cup} tone="mid" />
        <Solid paths={spool.roll} tone="hi" crease="none" className="tw-ink" />
        <Solid paths={spool.flange} tone="mid" inner={<Line d={spool.holes} tone="lo" />} />
        <Solid paths={spool.hub} tone="mid" />
        <Dots points={[spool.pin]} size={0.6} tone="hi" />
      </g>
    ))}
  </g>
);

const LEVER_FOOT = <Solid key="lever-foot" paths={LEVER_BOSS} tone="mid" />;

const NOSE = (
  <g key="nose">
    <Solid paths={NOSE_ART.nose} tone="mid" />
    <Dots points={NOSE_ART.noseScrews} size={0.5} tone="mid" />
  </g>
);

const KEYBOARD = (
  <g key="keyboard">
    <Solid paths={DECK_ART.deck} tone="mid" />
    <Line d={DECK_ART.groove} tone="faint" />
    <Line d={DECK_ART.slots} tone="lo" />
    <Line d={DECK_ART.spaceSlots} tone="lo" />
    {KEY_ART.map((key) => (
      <g key={key.index}>
        <Solid paths={key.stem} tone="mid" crease="none" />
        <g data-key={key.index}>
          <Solid paths={key.rim} tone="mid" />
          <Solid paths={key.cap} tone="mid" className="tw-cap" inner={<Line d={key.dish} tone="faint" />} />
        </g>
      </g>
    ))}
    {SPACE_ART.stems.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" crease="none" />
    ))}
    <g data-key={SPACE}>
      <Solid paths={SPACE_ART.bar} tone="mid" className="tw-cap" inner={<Line d={SPACE_ART.groove} tone="faint" />} />
    </g>
  </g>
);

const LABEL =
  "A small desk typewriter on rubber feet: a round-keyed keyboard in four stepped rows, a basket of typebars fanned round the segment, two ribbon spools, and a carriage with a knurled platen, paper bail and return lever. A sheet of paper stands in the platen; the typed line on it spells the email address.";

export function TypewriterArt() {
  return (
    <TypewriterLive
      label={LABEL}
      base={BASE}
      body={BODY}
      carriage={CARRIAGE}
      sheet={SHEET}
      carriageFront={CARRIAGE_FRONT}
      guide={GUIDE}
      basket={BASKET}
      ribbons={RIBBONS}
      vibrator={VIBRATOR}
      spools={SPOOLS}
      leverFoot={LEVER_FOOT}
      nose={NOSE}
      keyboard={KEYBOARD}
    />
  );
}
