// Drives a running `npm run realtime:dev -- --var OWNER_KEY:<key>` with raw sockets:
// OWNER_KEY=<key> node scripts/room.smoke.ts [ws://127.0.0.1:8787]
import assert from "node:assert/strict";
import { ROOM_CAP } from "../data/room.ts";

const base = process.argv[2] ?? "ws://127.0.0.1:8787";
const room = `room-${Math.floor(Math.random() * 10)}`;
const origin = "http://localhost:3000";
const ownerKey = process.env.OWNER_KEY;
assert.ok(ownerKey, "OWNER_KEY must match the worker's");
type Frame = Record<string, unknown>;

function open(headers: Record<string, string> = { Origin: origin }) {
  // undici's WebSocket takes request headers in its init dictionary, which the DOM typings lack
  const ws = new WebSocket(`${base}/room/${room}`, { headers } as never);
  const got: Frame[] = [];
  ws.onmessage = (e) => got.push(JSON.parse(String(e.data)));
  const ready = new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("socket error"));
  });
  const next = async (t: string, ms = 2000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 20)))
      if (got.some((m) => m.t === t)) return got.splice(0, got.findIndex((m) => m.t === t) + 1).at(-1)!;
    throw new Error(`no ${t}; got ${JSON.stringify(got)}`);
  };
  return { ws, got, ready, next };
}

const a = open();
await a.ready;
const helloA = await a.next("hello");
const b = open();
await b.ready;
const helloB = await b.next("hello");
assert.deepEqual(helloB.peers, [], "A hasn't moved, so B sees nobody");
assert.notEqual(helloA.you, helloB.you);

const n = [0, 1, 0];
const h = [0, 0, 1];
a.ws.send(JSON.stringify({ t: "move", n, h }));
const join = await b.next("join");
assert.deepEqual((join.peer as Frame).n, n);
assert.equal((join.peer as Frame).id, helloA.you, "server stamped A's id");

await new Promise((r) => setTimeout(r, 100));
a.ws.send(JSON.stringify({ t: "move", n: [0.6, 0.8, 0], h }));
assert.deepEqual((await b.next("move")).n, [0.6, 0.8, 0]);

a.ws.send(JSON.stringify({ t: "say", text: "see https://evil.io/x now", id: helloB.you }));
a.ws.send(JSON.stringify({ t: "say", text: "see https://evil.io/x now" }));
assert.equal((await b.next("say")).text, "see now", "URL stripped");
assert.equal((await b.next("say").catch(() => null)), null, "a frame with an id field is dropped");
b.ws.send(JSON.stringify({ t: "move", n, h }));
await a.next("join");
b.ws.send(JSON.stringify({ t: "preset", p: 1 }));
const preset = await a.next("say");
assert.deepEqual([preset.id, preset.text], [helloB.you, "nice portfolio"]);
b.ws.send(JSON.stringify({ t: "emote", e: "wave" }));
assert.equal((await a.next("emote")).e, "wave");

for (let i = 0; i < 10; i++) b.ws.send(JSON.stringify({ t: "say", text: `spam ${i}` }));
await new Promise((r) => setTimeout(r, 400));
assert.ok(a.got.filter((m) => m.t === "say").length <= 3, "token bucket held the flood");

const send = (w: WebSocket, m: Frame) => w.send(JSON.stringify(m));
send(b.ws, { t: "name", name: "Bee https://x.io" });
assert.deepEqual(await a.next("name"), { t: "name", id: helloB.you, name: "Bee" }, "peer sees the cleaned name");
assert.deepEqual(await b.next("name"), { t: "name", id: helloB.you, name: "Bee" }, "sender gets the echo");
send(b.ws, { t: "name", name: "Bee Two" });
assert.equal(await a.next("name", 600).catch(() => null), null, "second rename inside 3s is dropped");
await new Promise((r) => setTimeout(r, 3100));
send(b.ws, { t: "name", name: "fuck" });
assert.equal(await a.next("name", 600).catch(() => null), null, "blocked name ignored");
send(b.ws, { t: "name", name: "Bee Two" });
assert.equal((await a.next("name")).name, "Bee Two");
const late = open();
await late.ready;
await late.next("hello");
const lateName = await late.next("name");
assert.deepEqual([lateName.id, lateName.name], [helloB.you, "Bee Two"], "a late joiner is told the current names");
late.ws.close();

send(b.ws, { t: "knock" });
assert.equal(await a.next("knock", 600).catch(() => null), null, "no owner here, so a knock goes nowhere");
send(b.ws, { t: "claim", key: "x".repeat(32) });
assert.equal(await a.next("crown", 600).catch(() => null), null, "a wrong key crowns nobody");
send(b.ws, { t: "claim", key: ownerKey });
assert.equal(await b.next("crown", 600).catch(() => null), null, "one guess per socket, even with the right key");
const king = open();
await king.ready;
const helloKing = await king.next("hello");
send(king.ws, { t: "claim", key: ownerKey });
assert.equal((await king.next("crown")).id, helloKing.you, "the owner sees their own crown");
assert.equal(await a.next("crown", 600).catch(() => null), null, "nobody else hears of the owner before they appear");
send(king.ws, { t: "move", n, h });
await a.next("join");
assert.equal((await a.next("crown")).id, helloKing.you, "the owner is crowned for the room once they appear");
send(b.ws, { t: "knock" });
assert.deepEqual(await king.next("knock"), { t: "knock", id: helloB.you }, "the owner hears a knock");
assert.equal(await a.next("knock", 600).catch(() => null), null, "a knock is never broadcast");
send(b.ws, { t: "knock" });
assert.equal(await king.next("knock", 600).catch(() => null), null, "one knock a minute per socket");
send(a.ws, { t: "knock" });
assert.equal((await king.next("knock")).id, helloA.you, "the limit is per socket");
send(king.ws, { t: "knock" });
assert.equal(await king.next("knock", 600).catch(() => null), null, "the owner can't knock");
const shy = open();
await shy.ready;
await shy.next("hello");
send(shy.ws, { t: "knock" });
assert.equal(await king.next("knock", 600).catch(() => null), null, "a visitor who hasn't appeared can't knock");
shy.ws.close();
const witness = open();
await witness.ready;
await witness.next("hello");
assert.equal((await witness.next("crown")).id, helloKing.you, "a late joiner is told who the owner is");
witness.ws.close();
king.ws.close();
await a.next("leave");

b.ws.close();
assert.equal((await a.next("leave")).id, helloB.you);

const bad = open({ Origin: "https://evil.example" });
await assert.rejects(bad.ready, "foreign origin refused");
const none = open({});
await assert.rejects(none.ready, "no origin refused");

const rest = Array.from({ length: ROOM_CAP - 1 }, () => open());
await Promise.all(rest.map((r) => r.ready));
for (const r of rest) await r.next("hello");
const over = open();
await over.ready;
await over.next("full");
console.log(`room.smoke ok (${room})`);
for (const s of [a, ...rest, over]) s.ws.close();
process.exit(0);
