import assert from "node:assert/strict";
import { TEXT_MAX, parseDraft, parseNote, parseNotes } from "../data/notes.ts";

const ok = { name: "Mossy Otter", text: "Lovely planet!", at: 1760000000000 };

assert.deepEqual(parseNote(ok), ok);
assert.equal(parseNote({ ...ok, extra: 1 }), null, "extra key");
assert.equal(parseNote({ name: ok.name, text: ok.text }), null, "missing at");
assert.equal(parseNote({ ...ok, name: "fuck" }), null, "blocked name");
assert.equal(parseNote({ ...ok, name: "a".repeat(17) }), null, "name too long");
assert.equal(parseNote({ ...ok, text: "" }), null, "empty text");
assert.equal(parseNote({ ...ok, text: "   \n\t " }), null, "blank text");
assert.ok(parseNote({ ...ok, text: "hi ".repeat(TEXT_MAX) })!.text.length <= TEXT_MAX, "a poisoned store is trimmed on the way out");
assert.equal(parseNote({ ...ok, text: "you shit" })?.text, "you ***", "and starred");
assert.equal(parseNote({ ...ok, text: 7 }), null, "text not a string");
assert.equal(parseNote({ ...ok, at: 0 }), null, "at must be positive");
assert.equal(parseNote({ ...ok, at: 1.5 }), null, "at must be an integer");
assert.equal(parseNote(null), null);

assert.equal(parseDraft({ name: "Mossy Otter", text: "  hi\n\nthere " })?.text, "hi there");
assert.ok(parseDraft({ name: "Mossy Otter", text: "hi ".repeat(TEXT_MAX) })!.text.length <= TEXT_MAX, "a draft is trimmed to fit");


assert.deepEqual(parseDraft({ name: ok.name, text: ok.text }), { name: ok.name, text: ok.text });
assert.equal(parseDraft(ok), null, "a client may not set at");

assert.deepEqual(parseNotes([ok, { bad: 1 }, ok]), [ok, ok], "bad entries dropped");
assert.deepEqual(parseNotes("nope"), []);
assert.equal(parseNotes(Array(500).fill(ok)).length, 200, "capped");
console.log("notes ok");
