import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crown, MessageCircle, Pencil, SendHorizontal, X } from "lucide-react";
import { EMOTES, type Emote, NAME_MAX, PRESETS, SAY_MAX, cleanName } from "@/data/room";
import { cn } from "@/lib/utils";
import { ctl } from "../game";
import { CHEAT_COMMAND, openCheat } from "./cheat";
import type { Line, Room } from "../use-room";

const EMOJI: Record<Emote, string> = { wave: "👋", cheer: "🎉", hop: "⬆️", point: "👉" };
const CHIP =
  "rounded-full border border-hq-line bg-white px-3 py-1.5 text-[12px] text-hq-ink transition-colors hover:bg-hq-bg active:bg-hq-bg pointer-coarse:min-h-11 pointer-coarse:px-3.5";
/** how long a new line shows above the closed chat */
const PREVIEW = 5_000;
const PREVIEW_LINES = 2;

/** pastel shirts are too pale to read as text, so the name takes a darker mix and the dot keeps the true colour */
function Who({ line }: { line: Line }) {
  const crown = line.king && <Crown aria-label="King" className="inline size-3 -translate-y-px text-[#d9a21e]" strokeWidth={2.5} />;
  if (line.mine) return <span className="inline-flex items-baseline gap-1 font-semibold text-hq-accent">{crown}You</span>;
  return (
    <span className="inline-flex items-baseline gap-1 font-semibold" style={{ color: `color-mix(in oklab, ${line.color ?? "#6b6b6b"} 45%, #111111)` }}>
      {crown || <span aria-hidden className="size-2 shrink-0 translate-y-px rounded-full" style={{ background: line.color ?? "#6b6b6b" }} />}
      {line.name}
    </span>
  );
}

function Preview({ line }: { line: Line }) {
  const [gone, setGone] = useState(() => performance.now() - line.at > PREVIEW);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), Math.max(0, PREVIEW - (performance.now() - line.at)));
    return () => clearTimeout(t);
  }, [line]);
  if (gone) return null;
  return (
    <li className="max-w-full rounded-2xl border border-hq-line bg-white/95 px-3 py-1.5 text-[12px] leading-snug break-words text-hq-ink shadow-[0_10px_30px_-16px_rgba(0,0,0,0.3)] backdrop-blur">
      <Who line={line} /> {line.text}
    </li>
  );
}

/** Your name, tap to change it. Enter saves, Escape cancels; the name shown is whatever the server echoes back. */
function YourName({ room }: { room: Room }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const next = cleanName(draft);
    if (next && next !== room.myName) room.rename(next);
    setEditing(false);
  };

  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(room.myName ?? "");
          setEditing(true);
        }}
        aria-label={`Your name is ${room.myName}. Edit name`}
        className="group flex min-h-8 max-w-full items-center gap-1.5 rounded-full px-2 text-[12px] text-hq-ink transition-colors hover:bg-hq-bg pointer-coarse:min-h-11"
      >
        <span className="truncate font-semibold text-hq-accent">{room.myName}</span>
        <Pencil className="size-3 shrink-0 text-hq-mute group-hover:text-hq-ink" aria-hidden />
      </button>
    );

  return (
    <form onSubmit={save} className="flex min-w-0 items-center gap-1.5">
      <input
        ref={input}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setEditing(false);
          }
        }}
        maxLength={NAME_MAX}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        aria-label="Your name"
        className="min-w-0 flex-1 rounded-full border border-hq-line bg-white px-3 py-1 text-base text-hq-ink outline-none focus-visible:border-hq-accent sm:text-[12px] pointer-coarse:min-h-11"
      />
      <button type="submit" className="rounded-full bg-hq-accent px-3 py-1.5 text-[12px] font-semibold text-white pointer-coarse:min-h-11">
        Save
      </button>
    </form>
  );
}

/** The online count, a card with the recent chat, your name, presets and emotes, and a text box. Enter opens it. */
export function Chat({ room }: { room: Room }) {
  const still = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLUListElement>(null);
  const atEnd = useRef(true);

  const show = (withKeyboard: boolean) => {
    ctl.keys.clear();
    atEnd.current = true;
    setOpen(true);
    if (withKeyboard) setFocus((f) => f + 1);
  };
  const close = () => {
    setOpen(false);
    setDraft("");
  };

  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  // newest line at the bottom, unless the reader scrolled up to look at older ones
  useEffect(() => {
    const el = log.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [room.lines, open]);

  // capture phase, so Enter opens the chat before the game's own Enter shortcut sees it
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement) return;
      e.preventDefault();
      e.stopPropagation();
      show(true);
    };
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", down, true);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", down, true);
      document.removeEventListener("pointerdown", away);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  if (room.online === null) return null;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim().toLowerCase() === CHEAT_COMMAND) {
      close();
      return openCheat();
    }
    if (draft.trim()) room.say(draft);
    setDraft("");
    input.current?.focus();
  };
  const people = `${room.online} ${room.online === 1 ? "person" : "people"}`;

  return (
    <div
      ref={box}
      className={cn(
        "pointer-events-none absolute left-1/2 z-30 flex w-[min(92vw,21rem)] -translate-x-1/2 flex-col items-center gap-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] sm:bottom-[4.75rem]",
        // on phones the open card sits above the joystick instead of over it
        open && "max-sm:bottom-[calc(11.75rem+env(safe-area-inset-bottom))]",
      )}
    >
      {!open && (
        <ul aria-hidden className="pointer-events-none flex w-full max-w-[min(72vw,16rem)] flex-col items-center gap-1 max-sm:mb-[4.5rem] sm:max-w-full">
          {room.lines.slice(-PREVIEW_LINES).map((l) => (
            <Preview key={l.key} line={l} />
          ))}
        </ul>
      )}
      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="Chat"
            initial={{ opacity: 0, y: still ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: still ? 0 : 8 }}
            transition={{ duration: still ? 0 : 0.18 }}
            className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-hq-line bg-white/95 p-2.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur"
          >
            <header className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-hq-mute">
                <span className="shrink-0 tracking-[0.12em] uppercase">
                  Chat · <span className="tabular-nums text-hq-ink">{room.online}</span>
                </span>
                <span aria-hidden>·</span>
                <YourName room={room} />
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close chat"
                className="grid size-8 shrink-0 place-items-center rounded-full text-hq-mute transition-colors hover:bg-hq-bg hover:text-hq-ink pointer-coarse:size-11"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>
            <ul
              ref={log}
              aria-live="polite"
              aria-label="Recent chat"
              onScroll={(e) => {
                const el = e.currentTarget;
                atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
              }}
              className="flex max-h-[min(10rem,24dvh)] min-h-16 flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl border border-hq-line bg-hq-bg/60 px-2.5 py-2"
            >
              {room.lines.length === 0 && <li className="m-auto text-[12px] text-hq-mute">No messages yet. Say hi!</li>}
              {room.lines.map((l) => (
                <li key={l.key} className="text-[12px] leading-snug break-words text-hq-ink">
                  <Who line={l} /> {l.text}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, i) => (
                <button key={p} type="button" className={CHIP} onClick={() => room.preset(i)}>
                  {p}
                </button>
              ))}
              {EMOTES.map((e) => (
                <button key={e} type="button" aria-label={`Emote: ${e}`} title={e} className={CHIP} onClick={() => room.emote(e)}>
                  {EMOJI[e]}
                </button>
              ))}
            </div>
            <form onSubmit={send} className="flex items-center gap-1.5">
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={SAY_MAX}
                enterKeyHint="send"
                autoComplete="off"
                aria-label="Say something"
                placeholder="Say something…"
                className="min-w-0 flex-1 rounded-full border border-hq-line bg-white px-3 py-1.5 text-base text-hq-ink outline-none placeholder:text-hq-mute focus-visible:border-hq-accent sm:text-[12px] pointer-coarse:min-h-11"
              />
              <button
                type="submit"
                aria-label="Send"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-hq-accent text-white pointer-coarse:size-11"
              >
                <SendHorizontal className="size-4" aria-hidden />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
      <button
        data-hud
        type="button"
        onClick={() => (open ? close() : show(false))}
        aria-expanded={open}
        aria-label={`Chat, ${people} here`}
        className={cn(
          "pointer-events-auto flex min-h-8 items-center gap-1.5 rounded-full border border-hq-line bg-white/90 px-3 text-[11px] font-semibold text-hq-ink backdrop-blur transition-colors hover:bg-white pointer-coarse:min-h-11",
          open && "max-sm:hidden",
        )}
      >
        <MessageCircle className="size-3.5" aria-hidden />
        <span className="tabular-nums">{room.online}</span> here
      </button>
    </div>
  );
}
