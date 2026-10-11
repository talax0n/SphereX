import assert from "node:assert/strict";
import { parseDraft, parseStone, parseStones } from "../data/stones.ts";

const ok = { n: [0, 1, 0], name: "Mossy Otter", at: 1760000000000 };

assert.deepEqual(parseStone(ok), ok);
assert.deepEqual(parseStone({ ...ok, n: [0.6, 0.8, 0.0004] })?.n, [0.6, 0.8, 0], "rounded to 3 decimals");
assert.equal(parseStone({ ...ok, extra: 1 }), null, "extra key");
assert.equal(parseStone({ n: ok.n, name: ok.name }), null, "missing at");
assert.equal(parseStone({ ...ok, n: [1, 1, 1] }), null, "not a unit vector");
assert.equal(parseStone({ ...ok, n: [0, 1] }), null, "wrong length");
assert.equal(parseStone({ ...ok, n: [0, "1", 0] }), null, "string coordinate");
assert.equal(parseStone({ ...ok, n: [NaN, 1, 0] }), null, "NaN");
assert.equal(parseStone({ ...ok, name: "fuck" }), null, "blocked name");
assert.equal(parseStone({ ...ok, name: "a".repeat(17) }), null, "name too long");
assert.equal(parseStone({ ...ok, name: 7 }), null, "name not a string");
assert.equal(parseStone({ ...ok, at: 0 }), null, "at must be positive");
assert.equal(parseStone({ ...ok, at: 1.5 }), null, "at must be an integer");
assert.equal(parseStone({ ...ok, at: "1" }), null, "at must be a number");
assert.equal(parseStone(null), null);
assert.equal(parseStone([]), null);

assert.deepEqual(parseDraft({ n: ok.n, name: ok.name }), { n: ok.n, name: ok.name });
assert.equal(parseDraft(ok), null, "a client may not set at");
assert.equal(parseDraft({ n: ok.n }), null);

assert.deepEqual(parseStones([ok, { bad: 1 }, ok]), [ok, ok], "bad entries dropped");
assert.deepEqual(parseStones("nope"), []);
assert.equal(parseStones(Array(500).fill(ok)).length, 200, "capped");
console.log("stones ok");
