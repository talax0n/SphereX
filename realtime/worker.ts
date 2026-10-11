import { DurableObject } from "cloudflare:workers";
import { PRESETS, ROOM_CAP, ROOM_NAME, type Peer, type PeerId, type ServerMsg, type Vec, parseClient } from "../data/room.ts";

interface Env {
  ROOM: DurableObjectNamespace<Room>;
  /** comma separated; a browser's Origin must be one of these */
  ALLOWED_ORIGINS: string;
  /** a secret set with `wrangler secret put OWNER_KEY`; unset means nobody can be crowned */
  OWNER_KEY?: string;
}

/** Survives hibernation on the socket itself. `n` and `h` stay null until the first move, so nobody appears at a default spot. */
type Seat = { id: PeerId; look: number; n: Vec | null; h: Vec | null; name?: string; owner?: true; claimed?: true };

/** speech tokens: a burst of 4, one more every 2s; position updates are held to ~16Hz */
const BURST = 4;
const REFILL = 2000;
const MOVE_GAP = 60;
const RENAME_GAP = 3000;
const KNOCK_GAP = 60_000;

const sha = async (s: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
/** hashing first gives equal lengths, so the comparison takes the same time whatever the guess */
async function isOwner(key: string, env: Env) {
  if (!env.OWNER_KEY) return false;
  // `echo key | wrangler secret put` stores the newline too
  return crypto.subtle.timingSafeEqual(await sha(key), await sha(env.OWNER_KEY.trim()));
}

const same = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const name = url.pathname.match(/^\/room\/([^/]+)$/)?.[1];
    if (!name || !ROOM_NAME.test(name)) return new Response("not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const origin = req.headers.get("Origin");
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    if (!origin || !allowed.includes(origin)) return new Response("forbidden", { status: 403 });
    return env.ROOM.get(env.ROOM.idFromName(name)).fetch(req);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  /** lost when the object hibernates, which only happens once every socket has been idle for a while */
  private limits = new WeakMap<WebSocket, { tokens: number; at: number; move: number; name: number; knock: number }>();

  private seats(except?: WebSocket) {
    const out: { ws: WebSocket; seat: Seat }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const seat = ws.deserializeAttachment() as Seat | null;
      if (seat && ws !== except) out.push({ ws, seat });
    }
    return out;
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  private broadcast(msg: ServerMsg, except?: WebSocket) {
    const text = JSON.stringify(msg);
    for (const { ws } of this.seats(except)) {
      try {
        ws.send(text);
      } catch {}
    }
  }

  async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    const seated = this.seats();
    this.ctx.acceptWebSocket(server);
    if (seated.length >= ROOM_CAP) {
      this.send(server, { t: "full" });
      server.close(1013, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    const taken = new Set(seated.map((s) => s.seat.id));
    let id: PeerId;
    do id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join("");
    while (taken.has(id));
    const seat: Seat = { id, look: crypto.getRandomValues(new Uint32Array(1))[0], n: null, h: null };
    server.serializeAttachment(seat);
    const peers = seated.flatMap(({ seat: s }) => (s.n && s.h ? [{ id: s.id, look: s.look, n: s.n, h: s.h }] : []));
    this.send(server, { t: "hello", you: id, peers });
    // names ride their own message: deployed clients reject a peer with an unknown key
    for (const { seat: s } of seated) {
      if (s.n && s.name) this.send(server, { t: "name", id: s.id, name: s.name });
      if (s.n && s.owner) this.send(server, { t: "crown", id: s.id });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const seat = ws.deserializeAttachment() as Seat | null;
    const msg = typeof data === "string" ? parseClient(data) : null;
    if (!seat || !msg) return;
    const now = Date.now();
    const lim = this.limits.get(ws) ?? { tokens: BURST, at: now, move: 0, name: 0, knock: 0 };
    this.limits.set(ws, lim);

    if (msg.t === "move") {
      if (now - lim.move < MOVE_GAP) return;
      lim.move = now;
      if (seat.n && seat.h && same(seat.n, msg.n) && same(seat.h, msg.h)) return;
      const joining = !seat.n;
      seat.n = msg.n;
      seat.h = msg.h;
      ws.serializeAttachment(seat);
      const peer: Peer = { id: seat.id, look: seat.look, n: msg.n, h: msg.h };
      this.broadcast(joining ? { t: "join", peer } : { t: "move", id: seat.id, n: msg.n, h: msg.h }, ws);
      if (joining && seat.name) this.broadcast({ t: "name", id: seat.id, name: seat.name }, ws);
      if (joining && seat.owner) this.broadcast({ t: "crown", id: seat.id }, ws);
      return;
    }

    if (msg.t === "claim") {
      // one guess per socket
      if (seat.claimed) return;
      seat.claimed = true;
      ws.serializeAttachment(seat);
      if (!(await isOwner(msg.key, this.env))) return;
      const fresh = ws.deserializeAttachment() as Seat | null;
      if (!fresh) return;
      fresh.owner = true;
      ws.serializeAttachment(fresh);
      const crown: ServerMsg = { t: "crown", id: fresh.id };
      this.send(ws, crown);
      if (fresh.n) this.broadcast(crown, ws);
      return;
    }

    if (msg.t === "name") {
      if (now - lim.name < RENAME_GAP) return;
      lim.name = now;
      seat.name = msg.name;
      ws.serializeAttachment(seat);
      const named: ServerMsg = { t: "name", id: seat.id, name: msg.name };
      this.send(ws, named);
      if (seat.n) this.broadcast(named, ws);
      return;
    }

    // a visitor who hasn't appeared yet has no avatar to speak from
    if (!seat.n) return;
    if (msg.t === "knock") {
      const owners = this.seats(ws).filter((s) => s.seat.owner);
      if (seat.owner || !owners.length || now - lim.knock < KNOCK_GAP) return;
      lim.knock = now;
      for (const { ws: o } of owners) this.send(o, { t: "knock", id: seat.id });
      return;
    }
    lim.tokens = Math.min(BURST, lim.tokens + (now - lim.at) / REFILL);
    lim.at = now;
    if (lim.tokens < 1) return;
    lim.tokens -= 1;
    if (msg.t === "emote") this.broadcast({ t: "emote", id: seat.id, e: msg.e });
    else this.broadcast({ t: "say", id: seat.id, text: msg.t === "preset" ? PRESETS[msg.p] : msg.text });
  }

  async webSocketClose(ws: WebSocket) {
    this.leave(ws);
    try {
      ws.close();
    } catch {}
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws);
  }

  private leave(ws: WebSocket) {
    const seat = ws.deserializeAttachment() as Seat | null;
    if (seat?.n) this.broadcast({ t: "leave", id: seat.id }, ws);
  }
}
