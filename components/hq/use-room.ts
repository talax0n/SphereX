import { useCallback, useEffect, useRef, useState } from "react";
import { type Emote, OWNER_KEY, PRESETS, ROOMS_TRIED, type PeerId, type ServerMsg, type Vec, cleanName, nameFor, parseServer } from "@/data/room";
import { ctl, setGesture } from "./game";
import { type Visitor, lookOf } from "./scene/folk";

/** the multiplayer room's address; unset means the site is single-player and opens no socket */
const URL = process.env.NEXT_PUBLIC_ROOM_URL;

const SEND_EVERY = 125;
const HEARTBEAT = 5_000;
/** a tab hidden this long drops its socket, and rejoins on return */
const HIDDEN_FOR = 30_000;
const BACKOFF = [1_000, 2_000, 5_000, 15_000, 30_000];
/** how many lines the log remembers; a bubble above the speaker's head lasts much less, see `speech.tsx` */
const SCROLLBACK = 30;
const NAME_KEY = "hq:name";
const OWNER = "hq:owner";
const EMOTE_FOR = 2_500;

export interface Line {
  key: number;
  id: PeerId;
  text: string;
  /** the speaker's name and shirt colour as they were when the line arrived, so it still reads after they leave */
  name: string;
  color: string | null;
  mine: boolean;
  /** said by the site owner, as the room confirmed */
  king: boolean;
  /** performance.now() when it arrived */
  at: number;
}

/** The name saved on this device, or a fresh friendly one that is saved for next time. */
function savedName(): string {
  try {
    const kept = cleanName(localStorage.getItem(NAME_KEY));
    if (kept) return kept;
    const made = nameFor(crypto.getRandomValues(new Uint32Array(1))[0]);
    localStorage.setItem(NAME_KEY, made);
    return made;
  } catch {
    return nameFor(crypto.getRandomValues(new Uint32Array(1))[0]);
  }
}

/** The owner key: visiting with `?owner=<key>` saves it on this device and takes it out of the address bar. */
function ownerKey(): string | null {
  try {
    const url = new globalThis.URL(location.href);
    // read raw, since searchParams turns a base64 key's `+` into a space
    const raw = /[?&]owner=([^&#]*)/.exec(url.search)?.[1];
    if (raw !== undefined) {
      url.searchParams.delete("owner");
      history.replaceState(history.state, "", url);
      const given = decodeURIComponent(raw).trim();
      if (OWNER_KEY.test(given)) localStorage.setItem(OWNER, given);
      else {
        localStorage.removeItem(OWNER);
        console.warn("owner key ignored: it must be 16 to 256 printable characters with no spaces");
      }
    }
    return localStorage.getItem(OWNER);
  } catch {
    return null;
  }
}

export interface Room {
  /** people in the room including you, or null while not connected */
  online: number | null;
  me: PeerId | null;
  lines: readonly Line[];
  /** what everyone in the room is called, you included; the name the server echoed, or one made from their look */
  names: Readonly<Record<PeerId, string>>;
  /** who the server crowned as the site owner, you included */
  kings: ReadonlySet<PeerId>;
  /** your own name; changes once the server confirms a rename */
  myName: string | null;
  rename: (name: string) => void;
  say: (text: string) => void;
  preset: (p: number) => void;
  emote: (e: Emote) => void;
  mute: (id: PeerId) => void;
}

const OFF: Room = {
  online: null,
  me: null,
  lines: [],
  names: {},
  kings: new Set(),
  myName: null,
  rename: () => {},
  say: () => {},
  preset: () => {},
  emote: () => {},
  mute: () => {},
};

const q3 = (x: number) => Math.round(x * 1000) / 1000;
const wire = (v: { x: number; y: number; z: number }): Vec => [q3(v.x), q3(v.y), q3(v.z)];

/**
 * Joins the shared room while `active`: other people land in `ctl.visitors` for the frame loop, and
 * only what the DOM shows (the count, spoken lines) goes through React state.
 */
export function useRoom(active: boolean): Room {
  const [online, setOnline] = useState<number | null>(null);
  const [me, setMe] = useState<PeerId | null>(null);
  const [lines, setLines] = useState<readonly Line[]>([]);
  const [names, setNames] = useState<Readonly<Record<PeerId, string>>>({});
  const [myName, setMyName] = useState<string | null>(null);
  const [kings, setKings] = useState<ReadonlySet<PeerId>>(OFF.kings);
  const muted = useRef(new Set<PeerId>());
  const sock = useRef<WebSocket | null>(null);
  const ready = useRef(false);
  const key = useRef(0);

  useEffect(() => {
    if (!active || !URL) return;
    const base = URL.replace(/\/$/, "");

    let ws: WebSocket | null = null;
    let room = 0;
    let attempt = 0;
    let moveOn = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let away: ReturnType<typeof setTimeout> | undefined;
    const seats = new Map<PeerId, Visitor>();
    /** what the server said each person is called; a person it never named gets one made from their look */
    const given = new Map<PeerId, string>();
    let self: PeerId | null = null;
    let mine = savedName();
    const claim = ownerKey();
    const labelOf = (pid: PeerId) => (pid === self ? mine : (given.get(pid) ?? nameFor(seats.get(pid)?.look ?? 0)));
    const publish = () => {
      const all: Record<PeerId, string> = {};
      for (const pid of seats.keys()) all[pid] = labelOf(pid);
      if (self) all[self] = mine;
      setNames(all);
    };
    const sent = { at: 0, n: ctl.player.n.clone(), h: ctl.player.heading.clone() };

    const seat = (p: { id: PeerId; look: number; n: Vec; h: Vec }) => {
      if (seats.has(p.id)) return;
      const v = ctl.visitors.find((x) => !x.peer);
      if (!v) return;
      v.peer = p.id;
      v.look = p.look;
      v.to.set(...p.n);
      v.facing.set(...p.h);
      v.emote = null;
      v.gest = "rest";
      v.shown = v.fresh = true;
      seats.set(p.id, v);
      publish();
    };
    const unseat = (pid: PeerId) => {
      const v = seats.get(pid);
      if (!v) return;
      v.peer = null;
      v.shown = v.fresh = false;
      seats.delete(pid);
      given.delete(pid);
      v.king = false;
      setKings((ks) => (ks.has(pid) ? new Set([...ks].filter((k) => k !== pid)) : ks));
      publish();
    };
    const clear = () => {
      for (const pid of [...seats.keys()]) unseat(pid);
      ready.current = false;
      self = null;
      ctl.king = false;
      setKings(OFF.kings);
      setNames({});
      setMe(null);
      setOnline(null);
    };
    const count = () => setOnline(seats.size + 1);

    const speak = (pid: PeerId, text: string) => {
      if (muted.current.has(pid)) return;
      const v = seats.get(pid);
      const line: Line = {
        key: key.current++,
        id: pid,
        text,
        name: labelOf(pid),
        color: v ? lookOf(v.look).shirt.getStyle() : null,
        mine: pid === self,
        king: !!v?.king || (pid === self && ctl.king),
        at: performance.now(),
      };
      setLines((ls) => [...ls.slice(1 - SCROLLBACK), line]);
    };

    const handle = (m: ServerMsg) => {
      switch (m.t) {
        case "hello":
          ready.current = true;
          attempt = 0;
          self = m.you;
          setMe(m.you);
          setMyName(mine);
          for (const p of m.peers) seat(p);
          // an old worker ignores this and never echoes, so you keep the name you came with
          ws?.send(JSON.stringify({ t: "name", name: mine }));
          if (claim) ws?.send(JSON.stringify({ t: "claim", key: claim }));
          count();
          // announce where we stand, so the others see us the moment we arrive
          sent.at = -Infinity;
          break;
        case "join":
          seat(m.peer);
          count();
          break;
        case "leave":
          unseat(m.id);
          count();
          break;
        case "move": {
          const v = seats.get(m.id);
          if (v) {
            v.to.set(...m.n);
            v.facing.set(...m.h);
          }
          break;
        }
        case "say":
          speak(m.id, m.text);
          break;
        case "emote": {
          const v = seats.get(m.id);
          if (v) v.emote = m.e;
          break;
        }
        case "name":
          if (m.id === self) {
            mine = m.name;
            setMyName(m.name);
            try {
              localStorage.setItem(NAME_KEY, m.name);
            } catch {}
          } else given.set(m.id, m.name);
          publish();
          break;
        case "crown": {
          if (m.id === self) ctl.king = true;
          const v = seats.get(m.id);
          if (v) v.king = v.fresh = true;
          setKings((ks) => new Set(ks).add(m.id));
          break;
        }
        case "full":
          // the server closes right after; onclose then tries the next room
          room++;
          moveOn = true;
          break;
      }
    };

    const connect = () => {
      if (ws || document.visibilityState !== "visible") return;
      const s = new WebSocket(`${base}/room/room-${room}`);
      ws = sock.current = s;
      s.onmessage = (e) => {
        const m = parseServer(e.data);
        if (m) handle(m);
      };
      s.onclose = () => {
        if (ws !== s) return;
        ws = sock.current = null;
        clear();
        const longest = BACKOFF[BACKOFF.length - 1];
        if (moveOn && room >= ROOMS_TRIED) {
          // every room we tried is full; look again from the first one after a while
          room = 0;
          moveOn = false;
          retry = setTimeout(connect, longest);
        } else if (moveOn) {
          // `full` moved us on: the next room needs no wait
          moveOn = false;
          connect();
        } else {
          retry = setTimeout(connect, BACKOFF[Math.min(attempt++, BACKOFF.length - 1)] + Math.random() * 500);
        }
      };
      s.onerror = () => s.close();
    };

    const send = () => {
      if (!ready.current || ws?.readyState !== WebSocket.OPEN) return;
      const p = ctl.player;
      const now = performance.now();
      const moved = p.n.dot(sent.n) < 1 - 1e-6 || p.heading.distanceToSquared(sent.h) > 4e-4;
      if (!moved && now - sent.at < HEARTBEAT) return;
      sent.at = now;
      sent.n.copy(p.n);
      sent.h.copy(p.heading);
      ws.send(JSON.stringify({ t: "move", n: wire(p.n), h: wire(p.heading) }));
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(away);
        if (!ws) {
          clearTimeout(retry);
          attempt = 0;
          room = 0;
          connect();
        }
      } else {
        away = setTimeout(() => {
          clearTimeout(retry);
          ws?.close();
        }, HIDDEN_FOR);
      }
    };

    connect();
    const tick = setInterval(send, SEND_EVERY);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
      clearTimeout(retry);
      clearTimeout(away);
      const s = ws;
      ws = sock.current = null;
      s?.close();
      clear();
      setLines([]);
      setMyName(null);
    };
  }, [active]);

  const post = useCallback((msg: object) => {
    if (ready.current && sock.current?.readyState === WebSocket.OPEN) sock.current.send(JSON.stringify(msg));
  }, []);
  const say = useCallback((text: string) => post({ t: "say", text }), [post]);
  const preset = useCallback((p: number) => p >= 0 && p < PRESETS.length && post({ t: "preset", p }), [post]);
  const rename = useCallback((name: string) => post({ t: "name", name }), [post]);
  const emote = useCallback(
    (e: Emote) => {
      post({ t: "emote", e });
      setGesture(e);
      setTimeout(() => {
        if (ctl.gesture.current === e) setGesture("rest");
      }, EMOTE_FOR);
    },
    [post],
  );
  const mute = useCallback((pid: PeerId) => {
    muted.current.add(pid);
    setLines((ls) => ls.filter((l) => l.id !== pid));
  }, []);

  return URL && active
    ? { online, me, lines, names, kings, myName, rename, say, preset, emote, mute }
    : OFF;
}
