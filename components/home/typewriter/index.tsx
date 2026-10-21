import "@/components/iso/iso.css";
import "./typewriter.css";
import { Plate } from "@/components/iso/react/draw";
import { TypewriterArt } from "./art";
import { EMAIL, readoutOf } from "./view";

export function Typewriter() {
  return (
    <div className="iso" data-theme="light">
      <Plate
        fig="Fig 1"
        title="Write to me"
        hint="Type, or watch"
        readout={readoutOf(EMAIL.length, EMAIL.length)}
      >
        <TypewriterArt />
      </Plate>
    </div>
  );
}
