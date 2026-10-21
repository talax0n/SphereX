import { PROFILE } from "@/data/profile";
import { boxCorners, fitProjection, iso, type Flat, type Plan, type Point3 } from "@/components/iso/iso-kit";

export const WIDTH = 600;
export const HEIGHT = 440;
export const AZIMUTH = 45;

export const EMAIL = PROFILE.email;

// Type: one column is one escapement step of the carriage.
export const PITCH = 6;
export const LINE = 16;
export const PRINT_BASELINE = 3;
export const FONT = 9.4;
export const X0 = (EMAIL.length * PITCH) / 2;
export const LAST_COL = EMAIL.length + 2;
export const shiftOf = (col: number) => X0 - col * PITCH;

// Base, body shell and keyboard deck (x right, y toward the typist, z up).
export const BASE: Plan = { x: -128, y: -106, w: 256, d: 256, r: 12 };
export const BASE_TOP = 10;
export const FOOT_H = 6;
export const REAR: Plan = { x: -122, y: -100, w: 244, d: 54, r: 10 };
export const REAR_TOP = 46;
export const CHEEK_TOP = 44;
export const CHEEKS: Plan[] = [
  { x: -122, y: -46, w: 39, d: 102, r: 8 },
  { x: 83, y: -46, w: 39, d: 102, r: 8 },
];
export const WELL: Plan = { x: -83, y: -46, w: 166, d: 102, r: 0 };
export const WELL_TOP = 12;
export const NOSE: Plan = { x: -83, y: 47, w: 166, d: 9, r: 1.5 };
export const NOSE_TOP = 26;
export const DECK: Plan = { x: -118, y: 56, w: 236, d: 84, r: 8 };
export const DECK_TOP = 14;

// Platen and the strike point S where the paper leaves it, tangent, leaning back BETA.
export const PLATEN_R = 12;
export const PLATEN_HALF = 92;
export const AXIS: Point3 = [0, -40, 62];
export const BETA = (20 * Math.PI) / 180;
export const NORMAL: Point3 = [0, Math.cos(BETA), Math.sin(BETA)];
export const UP: Point3 = [0, -Math.sin(BETA), Math.cos(BETA)];
export const S: Point3 = [0, AXIS[1] + PLATEN_R * NORMAL[1], AXIS[2] + PLATEN_R * NORMAL[2]];
export const onPaper = (u: number, v: number, out = 0): Point3 => [S[0] + u, S[1] + UP[1] * v + NORMAL[1] * out, S[2] + UP[2] * v + NORMAL[2] * out];

export const PAPER_HALF = X0 + 18;
export const PAPER_TOP = 72;

// Typebar basket: pivots on an arc of radius R round C, bars of length L; S sits straight above C.
export const BAR_R = 30;
export const BAR_L = 46;
export const BAR_H = Math.sqrt(BAR_L * BAR_L - BAR_R * BAR_R);
export const C: Point3 = [S[0], S[1], S[2] - BAR_H];
export const REST_DROP = (16 * Math.PI) / 180;
export const HIT = Math.atan2(BAR_H, -BAR_R) - 0.004;
export const SPREAD = (78 * Math.PI) / 180;

// Keyboard: four stepped rows of round keys, the space bar in front.
export const ROWS = ["1234567890-", "qwertyuiop", "asdfghjkl;", "zxcvbnm,./"];
export const KEY_PITCH = 17;
export const ROW_Y = [68, 83, 98, 113];
export const ROW_X = [-85, -79, -75, -69];
export const ROW_TOP = [36, 31, 26, 21];
export const KEY_R = 6.2;
export const SPACE_Y = 128;
export const SPACE_TOP = 18;
export const SPACE_HALF = 52;

export interface Key {
  code: string;
  x: number;
  y: number;
  top: number;
  r: number;
  bar: number;
}

const charKeys = ROWS.flatMap((row, r) => [...row].map((code, i) => ({ code, x: ROW_X[r]! + i * KEY_PITCH, y: ROW_Y[r]!, top: ROW_TOP[r]!, r: KEY_R, bar: -1 })));
// The segment holds the bars in the order of their keys across the keyboard, rows interleaved, as on a real basket.
[...charKeys]
  .sort((a, b) => a.x - b.x || a.y - b.y)
  .forEach((key, index) => {
    key.bar = index;
  });
export const BARS = charKeys.length;

export const KEYS: Key[] = [
  ...charKeys,
  { code: "Backspace", x: ROW_X[0]! + 11 * KEY_PITCH + 1, y: ROW_Y[0]!, top: ROW_TOP[0]!, r: KEY_R, bar: -1 },
  { code: "Shift", x: ROW_X[3]! - KEY_PITCH - 2, y: ROW_Y[3]!, top: ROW_TOP[3]!, r: KEY_R + 0.8, bar: -1 },
  { code: "ShiftRight", x: ROW_X[3]! + 10 * KEY_PITCH + 2, y: ROW_Y[3]!, top: ROW_TOP[3]!, r: KEY_R + 0.8, bar: -1 },
];
export const SPACE = KEYS.length;

const SHIFTED: Record<string, string> = { "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", _: "-", ":": ";", "<": ",", ">": ".", "?": "/" };

/** The key a character is typed with, and whether it needs Shift. */
export function keyOf(char: string): { key: number; shift: boolean } | null {
  if (char === " ") return { key: SPACE, shift: false };
  const lower = char.toLowerCase();
  const code = SHIFTED[char] ?? lower;
  const key = KEYS.findIndex((k) => k.code === code);
  if (key < 0) return null;
  return { key, shift: Boolean(SHIFTED[char]) || char !== lower };
}

export const readoutOf = (typed: number, col: number) => `${typed} typed · col ${col}`;

// Carriage parts are built at shift 0; the live code moves them along x.
export const CARRIAGE_HALF = 102;
export const KNOB_OUT = 113;

export const P = fitProjection(
  [
    ...boxCorners(BASE, -FOOT_H, BASE_TOP),
    ...[shiftOf(0), shiftOf(LAST_COL)].flatMap((dx) => [
      [AXIS[0] + dx + KNOB_OUT, AXIS[1], AXIS[2] + 9] as Point3,
      [AXIS[0] + dx - KNOB_OUT, AXIS[1], AXIS[2] - 9] as Point3,
      onPaper(dx - PAPER_HALF, PAPER_TOP),
      onPaper(dx + PAPER_HALF, PAPER_TOP),
    ]),
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZIMUTH },
);

export const at = (point: Point3): Flat => iso(point, P);
const ORIGIN = at([0, 0, 0]);
export const screenOf = ([x, y, z]: Point3): Flat => {
  const p = at([x, y, z]);
  return [p[0] - ORIGIN[0], p[1] - ORIGIN[1]];
};
const fine = (value: number) => Math.round(value * 100) / 100;
export const moveBy = (by: Point3) => {
  const [x, y] = screenOf(by);
  return `translate(${fine(x)} ${fine(y)})`;
};

/** Maps paper coordinates (u right, -v up) onto the sheet's plane, for text and clips. */
export const PAPER_MATRIX = (() => {
  const o = at(onPaper(0, 0, 0.3));
  const ex = screenOf([1, 0, 0]);
  const ev = screenOf(UP);
  const f = (value: number) => Math.round(value * 1e4) / 1e4;
  return `matrix(${f(ex[0])} ${f(ex[1])} ${f(-ev[0])} ${f(-ev[1])} ${fine(o[0])} ${fine(o[1])})`;
})();
