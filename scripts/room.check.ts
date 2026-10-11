import assert from "node:assert/strict";
import { NAME_MAX, PRESETS, ROOM_CAP, cleanName, cleanSay, nameFor, parseClient, parseServer } from "../data/room.ts";

const n = [0, 1, 0];
const h = [0, 0, 1];
const peer = { id: "a1b2c3", look: 4294967295, n, h };
const enc = JSON.stringify;

// the chat filter
assert.equal(cleanSay("check https://evil.io/x?y=1 out"), "check out");
assert.equal(cleanSay("mail me bob@corp.com pls"), "mail me pls");
assert.equal(cleanSay(`key ${"a".repeat(30)} here`), "key here");
assert.equal(cleanSay("  hi \n\t there\u0007​!  "), "hi there !");
assert.equal(cleanSay("what the FUCK, shitty Scunthorpe"), "what the ***, *** Scunthorpe");
assert.equal(cleanSay("x".repeat(500)), null, "a 500-char token is secret-shaped");
assert.equal(cleanSay("ab ".repeat(100)), "ab ".repeat(40).trimEnd());
assert.equal(Array.from(cleanSay("😀".repeat(200)) ?? "").length, 120);
assert.equal(cleanSay("   "), null);
assert.equal(cleanSay("https://a.b"), null);
assert.equal(cleanSay(42), null);
assert.equal(cleanSay("<img src=x onerror=alert(1)>"), "<img src=x onerror=alert(1)>", "text stays text; React never renders it as HTML");
for (const p of PRESETS) assert.equal(cleanSay(p), p, `preset survives its own filter: ${p}`);
for (const s of ["a *** b", "hi 👋", "ok"]) assert.equal(cleanSay(cleanSay(s)), cleanSay(s), "idempotent");

// names
assert.equal(cleanName("Mossy Otter"), "Mossy Otter");
assert.equal(cleanName("  Théo  99 "), "Théo 99", "trimmed, spaces collapsed, letters and digits of any script");
assert.equal(cleanName("a".repeat(16)), "a".repeat(16), "exactly the limit");
assert.equal(cleanName("a".repeat(17)), null, "too long is refused, not cut");
assert.equal(cleanName("abc 😀 def"), "abc def", "emoji stripped");
assert.equal(cleanName("<b>x</b>"), "bxb", "markup characters stripped");
assert.equal(cleanName("fuck"), null, "blocked word");
assert.equal(cleanName("FUCKer"), null, "blocked prefix");
assert.equal(cleanName("Scunthorpe"), "Scunthorpe");
assert.equal(cleanName("https://evil.io"), null, "a link leaves nothing");
assert.equal(cleanName("bob@corp.com"), null, "an address leaves nothing");
assert.equal(cleanName("Bob https://x.io"), "Bob", "link stripped, rest kept");
assert.equal(cleanName(""), null);
assert.equal(cleanName("   \n\t "), null);
assert.equal(cleanName(7), null);
assert.equal(cleanName(cleanName("  Mr.  O'Neil!  ")), cleanName("Mr. O'Neil!"), "idempotent");
assert.equal(nameFor(0), nameFor(0), "deterministic");
assert.notEqual(nameFor(1), nameFor(2));
for (let i = 0; i < 5000; i++) {
  const seed = (i * 2654435761) >>> 0;
  assert.equal(cleanName(nameFor(seed)), nameFor(seed), `generated name is valid: ${nameFor(seed)}`);
  assert.ok(nameFor(seed).length <= NAME_MAX);
}

// client -> server
assert.deepEqual(parseClient(enc({ t: "move", n, h })), { t: "move", n, h });
assert.deepEqual(parseClient(enc({ t: "move", n: [0.00049, 0.99999, 0], h })), { t: "move", n: [0, 1, 0], h }, "rounded to 3 decimals");
assert.equal(parseClient(enc({ t: "move", n, h, id: "zzzzzz" })), null, "no id: the server stamps it");
assert.equal(parseClient(enc({ t: "move", n: [0, 2, 0], h })), null, "not a unit vector");
assert.equal(parseClient(enc({ t: "move", n: [0, 1], h })), null, "two components");
assert.equal(parseClient(enc({ t: "move", n: [0, "1", 0], h })), null, "string component");
assert.equal(parseClient('{"t":"move","n":[0,1,0],"h":[0,0,1e999]}'), null, "infinite component");
assert.deepEqual(parseClient(enc({ t: "say", text: "go to https://x.io now" })), { t: "say", text: "go to now" });
assert.equal(parseClient(enc({ t: "say", text: "https://x.io" })), null, "nothing left to say");
assert.equal(parseClient(enc({ t: "say", text: "hi", id: "a1b2c3" })), null, "cannot speak as another id");
assert.deepEqual(parseClient(enc({ t: "emote", e: "wave" })), { t: "emote", e: "wave" });
assert.equal(parseClient(enc({ t: "emote", e: "sleep" })), null, "unknown emote");
assert.deepEqual(parseClient(enc({ t: "preset", p: 4 })), { t: "preset", p: 4 });
for (const p of [5, -1, 1.5, "0"]) assert.equal(parseClient(enc({ t: "preset", p })), null, `bad preset ${p}`);
assert.deepEqual(parseClient(enc({ t: "name", name: "  Mossy   Otter " })), { t: "name", name: "Mossy Otter" });
assert.equal(parseClient(enc({ t: "name", name: "a".repeat(17) })), null, "name too long");
assert.equal(parseClient(enc({ t: "name", name: "shit" })), null, "blocked name");
assert.equal(parseClient(enc({ t: "name", name: "" })), null, "empty name");
const key = "k".repeat(16);
assert.deepEqual(parseClient(enc({ t: "claim", key })), { t: "claim", key });
assert.equal(parseClient(enc({ t: "claim", key: "k".repeat(3) })), null, "owner key too short");
assert.equal(parseClient(enc({ t: "claim", key: "k".repeat(257) })), null, "owner key too long");
assert.equal(parseClient(enc({ t: "claim", key: `${key} x` })), null, "owner key with a space");
const b64 = "Zm9vYmFy+YmF6cXV4/cXV1eA==";
assert.deepEqual(parseClient(enc({ t: "claim", key: b64 })), { t: "claim", key: b64 }, "a base64 key is accepted");
assert.equal(parseClient(enc({ t: "claim", key, extra: 1 })), null, "claim with an extra key");
assert.deepEqual(parseServer(enc({ t: "crown", id: "a1b2c3" })), { t: "crown", id: "a1b2c3" });
assert.equal(parseServer(enc({ t: "crown", id: "nope" })), null, "crown for a bad id");
assert.equal(parseServer(enc({ t: "crown", id: "a1b2c3", name: "King" })), null, "crown with an extra key");
assert.deepEqual(parseClient(enc({ t: "knock" })), { t: "knock" });
assert.equal(parseClient(enc({ t: "knock", id: "a1b2c3" })), null, "cannot knock as another id");
assert.equal(parseClient(enc({ t: "knock", to: "a1b2c3" })), null, "knock with an extra key");
assert.deepEqual(parseServer(enc({ t: "knock", id: "a1b2c3" })), { t: "knock", id: "a1b2c3" });
assert.equal(parseServer(enc({ t: "knock" })), null, "knock without who");
assert.equal(parseServer(enc({ t: "knock", id: "A1B2C3" })), null, "knock with an uppercase id");
assert.equal(parseServer(enc({ t: "knock", id: 7 })), null, "knock with a numeric id");
assert.equal(parseServer(enc({ t: "knock", id: "a1b2c3", name: "Bee" })), null, "knock with an extra key");
assert.equal(parseClient(enc({ t: "name", name: "Bob", id: "a1b2c3" })), null, "cannot rename another id");
assert.equal(parseClient(enc({ t: "name" })), null, "missing name");
assert.equal(parseClient("not json"), null);
assert.equal(parseClient("[1]"), null);
assert.equal(parseClient(enc({ t: "kick", id: "a1b2c3" })), null);
assert.equal(parseClient(enc({ t: "say", text: "a".repeat(5000) })), null, "oversized frame");
assert.equal(parseClient(new ArrayBuffer(4)), null, "binary frame");

// server -> client
assert.deepEqual(parseServer(enc({ t: "hello", you: "q1w2e3", peers: [peer] })), { t: "hello", you: "q1w2e3", peers: [peer] });
assert.equal(parseServer(enc({ t: "hello", you: "q1w2e3", peers: Array(ROOM_CAP + 1).fill(peer) })), null, "over the cap");
assert.notEqual(parseServer(enc({ t: "hello", you: "q1w2e3", peers: Array(ROOM_CAP).fill(peer) })), null, "at the cap");
assert.equal(parseServer(enc({ t: "hello", you: "Q1W2E3", peers: [] })), null, "uppercase id");
assert.equal(parseServer(enc({ t: "join", peer: { ...peer, look: -1 } })), null, "negative look");
assert.equal(parseServer(enc({ t: "join", peer: { ...peer, look: 2 ** 32 } })), null, "look past uint32");
assert.equal(parseServer(enc({ t: "join", peer: { ...peer, name: "x" } })), null, "extra peer field");
assert.deepEqual(parseServer(enc({ t: "join", peer })), { t: "join", peer });
assert.deepEqual(parseServer(enc({ t: "leave", id: "a1b2c3" })), { t: "leave", id: "a1b2c3" });
assert.deepEqual(parseServer(enc({ t: "move", id: "a1b2c3", n, h })), { t: "move", id: "a1b2c3", n, h });
assert.deepEqual(parseServer(enc({ t: "say", id: "a1b2c3", text: "hi!" })), { t: "say", id: "a1b2c3", text: "hi!" });
assert.equal(parseServer(enc({ t: "say", id: "a1b2c3", text: "see https://x.io" })), null, "server text must already be clean");
assert.deepEqual(parseServer(enc({ t: "emote", id: "a1b2c3", e: "cheer" })), { t: "emote", id: "a1b2c3", e: "cheer" });
assert.deepEqual(parseServer(enc({ t: "name", id: "a1b2c3", name: "Mossy Otter" })), { t: "name", id: "a1b2c3", name: "Mossy Otter" });
assert.equal(parseServer(enc({ t: "name", id: "a1b2c3", name: " Mossy Otter" })), null, "server names must already be clean");
assert.equal(parseServer(enc({ t: "name", id: "A1B2C3", name: "x" })), null, "uppercase id");
assert.equal(parseServer(enc({ t: "name", id: "a1b2c3", name: "x", extra: 1 })), null, "extra key");
assert.deepEqual(parseServer(enc({ t: "full" })), { t: "full" });
assert.equal(parseServer(enc({ t: "full", why: "x" })), null);
assert.equal(parseServer(undefined), null);
console.log("room.check ok");
