"use client";

import * as React from "react";
import type { SolidPaths } from "@/components/iso/iso-kit";
import { IsoFigure } from "@/components/iso/react/draw";
import { asksForStillness, follow, useInView, useLoop, useReadout } from "@/components/iso/react/live";
import { LIFT, REST_PHI, leverOf, ribbonAcross, typebarOf } from "./frame";
import { EMAIL, FONT, HEIGHT, HIT, KEYS, LAST_COL, LINE, PAPER_HALF, PAPER_MATRIX, PAPER_TOP, PITCH, PRINT_BASELINE, SPACE, UP, WIDTH, X0, keyOf, moveBy, readoutOf, shiftOf } from "./view";

type Ev = { kind: "char"; char: string } | { kind: "return" } | { kind: "back" } | { kind: "key"; key: number };

const SWING_UP = 0.06;
const SWING_DOWN = 0.12;
const RETURN_FEED = 0.1;
const RETURN_END = 0.64;
const LEVER_SWING = 0.36;
const KEY_DROP = 3;
const TOUR_FIRST = 1.4;
const TOUR_BACK = 3600;
const KEEP_LINES = 9;
const NS = "http://www.w3.org/2000/svg";

const BACKSPACE = KEYS.findIndex((key) => key.code === "Backspace");
const SHIFT = KEYS.findIndex((key) => key.code === "Shift");

const smooth = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};
const noise = (a: number, b: number) => {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h);
};
const round = (value: number) => Math.round(value * 100) / 100;

// Each strike lands a little differently: a slightly uneven baseline and ink.
function glyphOf(char: string, col: number, line: number) {
  return {
    x: round(-X0 + col * PITCH - (FONT * 0.6) / 2),
    y: round(line * LINE - PRINT_BASELINE + (noise(col, line) - 0.5) * 0.5),
    opacity: round(0.74 + noise(line + 3.1, col) * 0.26),
    char,
  };
}

function tourDelay(index: number) {
  const char = EMAIL[index - 1] ?? "";
  return 0.1 + noise(index, 7) * 0.09 + (char === "." || char === "@" ? 0.14 : 0);
}

interface SolidRefs {
  g: SVGGElement | null;
  fill: SVGPathElement | null;
  shades: (SVGPathElement | null)[];
  top: SVGPathElement | null;
  crease: SVGPathElement | null;
  edge: SVGPathElement | null;
}

const solidRefs = (): SolidRefs => ({ g: null, fill: null, shades: [null, null, null, null], top: null, crease: null, edge: null });

function writeSolid(refs: SolidRefs, paths: SolidPaths) {
  refs.fill?.setAttribute("d", paths.fill);
  paths.shades.forEach((d, index) => refs.shades[index]?.setAttribute("d", d));
  refs.top?.setAttribute("d", paths.top);
  refs.crease?.setAttribute("d", paths.crease);
  refs.edge?.setAttribute("d", paths.outline);
}

function LiveSolid({ solidRef, paths, tone = "mid", lit = false }: { solidRef: React.RefObject<SolidRefs>; paths: SolidPaths; tone?: "hi" | "mid"; lit?: boolean }) {
  return (
    <g
      ref={(node) => {
        solidRef.current = {
          g: node,
          fill: node?.querySelector(".iso-fill") ?? null,
          shades: [0, 1, 2, 3].map((index) => node?.querySelector<SVGPathElement>(`[data-shade="${index}"]`) ?? null),
          top: node?.querySelector(".iso-top") ?? null,
          crease: node?.querySelector(".iso-crease") ?? null,
          edge: node?.querySelector(".iso-edge") ?? null,
        };
      }}
      className="iso-solid"
      data-lit={lit ? "" : undefined}
      data-seamless={paths.seamless ? "" : undefined}
    >
      <path className="iso-fill" d={paths.fill} />
      {[0, 1, 2, 3].map((index) => (
        <path key={index} className="iso-shade" data-shade={index} d={paths.shades[index] ?? ""} />
      ))}
      <path className="iso-top" d={paths.top} />
      <path className="iso-line iso-crease" data-tone="faint" d={paths.crease} />
      <path className="iso-line iso-edge" data-tone={tone} d={paths.outline} />
    </g>
  );
}

interface Model {
  col: number;
  line: number;
  typed: number;
  car: number;
  feed: number;
  lift: number;
  swing: number;
  queue: Ev[];
  wait: number;
  strike: { bar: number; key: number; age: number; char: string; inked: boolean } | null;
  ret: number;
  fed: boolean;
  press: Map<number, { at: number; held: number }>;
  touring: boolean;
  tour: { step: number; wait: number };
}

const START: Pick<Model, "col" | "line" | "typed"> = { col: EMAIL.length, line: 0, typed: EMAIL.length };
const FIRST_LINE = [...EMAIL].map((char, col) => glyphOf(char, col, 0));
const REST_BAR = typebarOf(0, REST_PHI);
const REST_LEVER = leverOf(0);

interface Props {
  label: string;
  base: React.ReactNode;
  body: React.ReactNode;
  carriage: React.ReactNode;
  sheet: React.ReactNode;
  carriageFront: React.ReactNode;
  guide: React.ReactNode;
  basket: React.ReactNode;
  ribbons: React.ReactNode;
  vibrator: React.ReactNode;
  spools: React.ReactNode;
  leverFoot: React.ReactNode;
  nose: React.ReactNode;
  keyboard: React.ReactNode;
}

export function TypewriterLive(props: Props) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const visible = useInView(anchor);
  const clip = `tw-paper-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const carriage = React.useRef<SVGGElement>(null);
  const lever = React.useRef<SVGGElement>(null);
  const block = React.useRef<SVGGElement>(null);
  const firstLine = React.useRef<SVGTextElement>(null);
  const vibrator = React.useRef<SVGGElement>(null);
  const ribbon = React.useRef<SVGPathElement>(null);
  const bar = React.useRef(solidRefs());
  const slug = React.useRef(solidRefs());
  const struck = React.useRef<SVGGElement>(null);
  const arm = React.useRef(solidRefs());
  const elbow = React.useRef(solidRefs());
  const reach = React.useRef(solidRefs());
  const paddle = React.useRef(solidRefs());
  const lines = React.useRef(new Map<number, SVGTextElement>());
  const resume = React.useRef(0);

  const model = React.useRef<Model>({
    ...START,
    car: shiftOf(START.col),
    feed: 0,
    lift: 0,
    swing: 0,
    queue: [],
    wait: 0,
    strike: null,
    ret: -1,
    fed: false,
    press: new Map(),
    touring: false,
    tour: { step: 0, wait: TOUR_FIRST },
  });

  const svg = () => anchor.current?.querySelector("svg") ?? null;
  const staticBar = (index: number) => svg()?.querySelector<SVGGElement>(`[data-bar="${index}"]`) ?? null;
  const keyGroup = (index: number) => svg()?.querySelector<SVGGElement>(`[data-key="${index}"]`) ?? null;

  const lineEl = (line: number) => {
    const known = lines.current.get(line);
    if (known) return known;
    const text = document.createElementNS(NS, "text");
    text.setAttribute("class", "tw-type");
    text.setAttribute("font-size", `${FONT}`);
    block.current?.appendChild(text);
    lines.current.set(line, text);
    for (const [index, old] of lines.current) {
      if (index < line - KEEP_LINES) {
        old.remove();
        lines.current.delete(index);
      }
    }
    return text;
  };

  const ink = (char: string, col: number, line: number) => {
    const glyph = glyphOf(char, col, line);
    const span = document.createElementNS(NS, "tspan");
    span.setAttribute("x", `${glyph.x}`);
    span.setAttribute("y", `${glyph.y}`);
    span.setAttribute("fill-opacity", `${glyph.opacity}`);
    span.textContent = char;
    lineEl(line).appendChild(span);
  };

  const pressKey = (key: number, held = 0.08) => {
    const was = model.current.press.get(key);
    model.current.press.set(key, { at: was?.at ?? 0, held });
  };

  const endStrike = () => {
    const strike = model.current.strike;
    if (!strike) return;
    staticBar(strike.bar)?.style.removeProperty("display");
    if (struck.current) struck.current.style.display = "none";
    model.current.strike = null;
  };

  const handle = (ev: Ev, calm: boolean) => {
    const m = model.current;
    if (ev.kind === "return") {
      endStrike();
      if (calm) {
        m.line += 1;
        m.col = 0;
        m.ret = -1;
        m.wait = 0;
        return;
      }
      m.ret = 0;
      m.fed = false;
      m.wait = calm ? 0 : RETURN_END + 0.1;
      return;
    }
    if (ev.kind === "back") {
      pressKey(BACKSPACE);
      m.col = Math.max(0, m.col - 1);
      m.wait = calm ? 0 : 0.09;
      return;
    }
    if (ev.kind === "key") {
      pressKey(ev.key, 0.16);
      return;
    }
    const found = keyOf(ev.char);
    if (!found) return;
    if (found.key === SPACE) {
      pressKey(SPACE);
      if (m.col < LAST_COL) m.col += 1;
      m.wait = calm ? 0 : 0.09;
      return;
    }
    pressKey(found.key);
    if (found.shift) pressKey(SHIFT, 0.22);
    m.wait = calm ? 0 : found.shift ? 0.16 : 0.1;
    // Past the right margin the keys lock, as on the real machine.
    if (m.col >= LAST_COL) return;
    if (calm) {
      ink(ev.char, m.col, m.line);
      m.col += 1;
      m.typed += 1;
      return;
    }
    endStrike();
    m.strike = { bar: KEYS[found.key]!.bar, key: found.key, age: 0, char: ev.char, inked: false };
    staticBar(m.strike.bar)?.style.setProperty("display", "none");
    if (struck.current) struck.current.style.display = "";
  };

  const kick = useLoop((dt, calm) => {
    const m = model.current;

    if (m.touring && !calm) {
      m.tour.wait -= dt;
      if (m.tour.wait <= 0 && !m.queue.length) {
        const step = m.tour.step;
        if (step === 0) {
          m.queue.push({ kind: "return" });
          m.tour = { step: 1, wait: RETURN_END + 0.7 };
        } else if (step <= EMAIL.length) {
          m.queue.push({ kind: "char", char: EMAIL[step - 1]! });
          m.tour = { step: step + 1, wait: step === EMAIL.length ? 2.6 : tourDelay(step + 1) };
        } else m.tour = { step: 0, wait: 0 };
      }
    }

    m.wait = Math.max(0, m.wait - dt);
    while (m.queue.length && ((m.wait === 0 && !m.strike && m.ret < 0) || calm)) {
      handle(m.queue.shift()!, calm);
      if (!calm) break;
    }

    // The struck typebar swings up to the platen, inks the ribbon onto the paper, falls back; the carriage steps on.
    let lift = 0;
    if (m.strike) {
      const s = m.strike;
      s.age += dt;
      if (calm) s.age = SWING_UP + SWING_DOWN;
      if (!s.inked && s.age >= SWING_UP) {
        s.inked = true;
        ink(s.char, m.col, m.line);
        m.col += 1;
        m.typed += 1;
      }
      const phi = s.age < SWING_UP ? REST_PHI + (HIT - REST_PHI) * (s.age / SWING_UP) ** 2 : HIT - (HIT - REST_PHI) * smooth((s.age - SWING_UP) / SWING_DOWN);
      lift = smooth(s.age / 0.045) * (1 - smooth((s.age - 0.1) / 0.07));
      if (s.age >= SWING_UP + SWING_DOWN) endStrike();
      else {
        const paths = typebarOf(s.bar, phi);
        writeSolid(bar.current, paths.bar);
        writeSolid(slug.current, paths.slug);
      }
    }
    if (lift !== m.lift) {
      m.lift = lift;
      vibrator.current?.setAttribute("transform", lift ? moveBy([UP[0] * LIFT * lift, UP[1] * LIFT * lift, UP[2] * LIFT * lift]) : "");
      ribbon.current?.setAttribute("d", ribbonAcross(LIFT * lift));
    }

    // Carriage return: the lever swings, the platen feeds a line, the carriage runs back to the margin.
    let swing = 0;
    if (m.ret >= 0) {
      m.ret = calm ? RETURN_END : m.ret + dt;
      const r = m.ret;
      swing = r < 0.12 ? smooth(r / 0.12) : r < 0.42 ? 1 : 1 - smooth((r - 0.42) / 0.2);
      if (!m.fed && r >= RETURN_FEED) {
        m.fed = true;
        m.line += 1;
        m.col = 0;
      }
      if (r >= RETURN_END) {
        m.ret = -1;
        swing = 0;
      }
    }
    if (swing !== m.swing) {
      m.swing = swing;
      const paths = leverOf(LEVER_SWING * swing);
      writeSolid(arm.current, paths.arm);
      writeSolid(elbow.current, paths.elbow);
      writeSolid(reach.current, paths.reach);
      writeSolid(paddle.current, paths.paddle);
    }

    const target = shiftOf(m.col);
    m.car = follow(m.car, target, dt, m.ret >= 0 ? 0.1 : 0.028, calm);
    m.feed = follow(m.feed, m.line, dt, 0.08, calm);
    const move = moveBy([m.car, 0, 0]);
    carriage.current?.setAttribute("transform", move);
    lever.current?.setAttribute("transform", move);
    block.current?.setAttribute("transform", `translate(0 ${round(-m.feed * LINE)})`);

    for (const [key, state] of m.press) {
      state.held -= dt;
      const down = state.held > 0 ? 1 : 0;
      state.at = follow(state.at, down, dt, down ? 0.016 : 0.05, calm);
      const group = keyGroup(key);
      if (group) {
        group.setAttribute("transform", state.at ? moveBy([0, 0, -KEY_DROP * state.at]) : "");
        const cap = group.querySelector(".tw-cap");
        if (down) cap?.setAttribute("data-lit", "");
        else cap?.removeAttribute("data-lit");
      }
      if (!down && state.at === 0) m.press.delete(key);
    }

    say(readoutOf(m.typed, Math.round((X0 - m.car) / PITCH)));
    return m.touring || m.queue.length > 0 || m.wait > 0 || m.strike !== null || m.ret >= 0 || m.press.size > 0 || m.car !== target || m.feed !== m.line;
  }, visible);

  React.useEffect(() => {
    if (firstLine.current) lines.current.set(0, firstLine.current);
    if (!asksForStillness()) {
      model.current.touring = true;
      kick();
    }
    return () => window.clearTimeout(resume.current);
  }, [kick]);

  const act = (ev: Ev) => {
    const m = model.current;
    if (m.touring) {
      m.touring = false;
      m.queue = [];
    }
    m.queue.push(ev);
    window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => {
      if (asksForStillness()) return;
      model.current.touring = true;
      model.current.tour = { step: 0, wait: 0.4 };
      kick();
    }, TOUR_BACK);
    kick();
  };

  return (
    <div
      ref={anchor}
      className="tw"
      role="group"
      tabIndex={0}
      aria-label="Typewriter. Focus it and type: each key strikes its typebar and the carriage steps one character. Enter returns the carriage, Backspace steps back."
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "Enter") {
          event.preventDefault();
          act({ kind: "return" });
        } else if (event.key === "Backspace") {
          event.preventDefault();
          act({ kind: "back" });
        } else if (event.key === "Shift") {
          act({ kind: "key", key: event.code === "ShiftRight" ? SHIFT + 1 : SHIFT });
        } else if (event.key.length === 1 && keyOf(event.key)) {
          event.preventDefault();
          act({ kind: "char", char: event.key });
        }
      }}
      onClick={(event) => {
        const target = event.target as Element;
        if (target.closest("[data-lever]")) {
          act({ kind: "return" });
          return;
        }
        const hit = target.closest<SVGGElement>("[data-key]");
        if (!hit) return;
        const index = Number(hit.dataset.key);
        const code = index === SPACE ? " " : KEYS[index]!.code;
        if (code === "Backspace") act({ kind: "back" });
        else if (code.startsWith("Shift")) act({ kind: "key", key: index });
        else act({ kind: "char", char: code });
        anchor.current?.focus({ preventScroll: true });
      }}
    >
      <IsoFigure width={WIDTH} height={HEIGHT} label={props.label}>
        {props.base}
        {props.body}
        <g ref={carriage} transform={moveBy([shiftOf(START.col), 0, 0])}>
          {props.carriage}
          {props.sheet}
          <g transform={PAPER_MATRIX}>
            <clipPath id={clip}>
              <rect x={-PAPER_HALF} y={-PAPER_TOP} width={PAPER_HALF * 2} height={PAPER_TOP} />
            </clipPath>
            <g clipPath={`url(#${clip})`}>
              <g ref={block}>
                <text ref={firstLine} className="tw-type" fontSize={FONT}>
                  {FIRST_LINE.map((glyph, index) => (
                    <tspan key={index} x={glyph.x} y={glyph.y} fillOpacity={glyph.opacity}>
                      {glyph.char}
                    </tspan>
                  ))}
                </text>
              </g>
            </g>
          </g>
          {props.carriageFront}
        </g>
        {props.guide}
        {props.basket}
        {props.ribbons}
        <g ref={vibrator}>{props.vibrator}</g>
        <path ref={ribbon} className="tw-ribbon" d={ribbonAcross(0)} />
        <g ref={struck} style={{ display: "none" }}>
          <LiveSolid solidRef={bar} paths={REST_BAR.bar} lit />
          <LiveSolid solidRef={slug} paths={REST_BAR.slug} lit />
        </g>
        {props.spools}
        <g ref={lever} transform={moveBy([shiftOf(START.col), 0, 0])} data-lever="">
          {props.leverFoot}
          <LiveSolid solidRef={arm} paths={REST_LEVER.arm} />
          <LiveSolid solidRef={elbow} paths={REST_LEVER.elbow} />
          <LiveSolid solidRef={reach} paths={REST_LEVER.reach} />
          <LiveSolid solidRef={paddle} paths={REST_LEVER.paddle} tone="hi" />
        </g>
        {props.nose}
        {props.keyboard}
      </IsoFigure>
    </div>
  );
}
