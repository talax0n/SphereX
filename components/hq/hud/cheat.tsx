import { type FormEvent, useEffect, useRef, useState } from "react";
import { Crown } from "lucide-react";
import { OWNER_KEY } from "@/data/room";
import type { Room } from "../use-room";

/** Shift + Option/Alt + O; uses the key's position, since Option on a Mac turns O into Ø */
const opens = (e: KeyboardEvent) => e.code === "KeyO" && e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey;
/** typed into the chat instead of sent, for phones and tablets that have no keyboard chord */
export const CHEAT_COMMAND = "/cheat";
const OPEN = "hq:cheat";
export const openCheat = () => window.dispatchEvent(new Event(OPEN));
/** the room answers a good key with a crown and a bad one with silence, so silence this long means no */
const VERDICT = 6_000;

type Status = "idle" | "checking" | "wrong" | "offline";

const SAYS: Record<Status, string> = {
  idle: "Enter a cheat code.",
  checking: "Checking…",
  wrong: "Nothing happened. Wrong code?",
  offline: "The room is offline, so nobody can check it right now.",
};

/** A hidden console for the site owner: their key, checked by the room, puts a crown on their head. */
export function Cheat({ room }: { room: Room }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const king = !!room.me && room.kings.has(room.me);

  useEffect(() => {
    const show = () => {
      if (dialog.current?.open) return;
      setStatus("idle");
      dialog.current?.showModal();
    };
    const down = (e: KeyboardEvent) => {
      if (!opens(e)) return;
      e.preventDefault();
      show();
    };
    window.addEventListener("keydown", down);
    window.addEventListener(OPEN, show);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener(OPEN, show);
    };
  }, []);

  useEffect(() => {
    if (status !== "checking") return;
    const t = setTimeout(() => setStatus("wrong"), VERDICT);
    return () => clearTimeout(t);
  }, [status]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const field = e.currentTarget.elements.namedItem("code") as HTMLInputElement;
    const code = field.value.trim();
    field.value = "";
    if (room.online === null) return setStatus("offline");
    if (!OWNER_KEY.test(code)) return setStatus("wrong");
    setStatus("checking");
    room.claim(code);
  };

  return (
    <dialog
      ref={dialog}
      aria-label="Cheats"
      className="m-auto w-[min(360px,calc(100vw-2rem))] rounded-3xl border border-hq-line bg-white p-5 text-hq-ink shadow-[0_24px_60px_-24px_rgba(0,0,0,0.3)] backdrop:bg-black/40"
    >
      {king ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <Crown className="size-8 text-[#d9a21e]" strokeWidth={2.5} />
          <p className="font-display text-xl font-extrabold">Welcome back, boss.</p>
          <p className="text-[12px] text-hq-mute">Everyone in the room sees your crown.</p>
          <form method="dialog">
            <button className="mt-2 rounded-full bg-hq-accent px-4 py-1.5 text-[12px] font-semibold text-white">Nice</button>
          </form>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="cheat-code" className="font-display text-xl font-extrabold">
            Cheats
          </label>
          <input
            id="cheat-code"
            name="code"
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="rounded-xl border border-hq-line px-3 py-2 font-mono text-[13px] outline-none focus:border-hq-accent"
          />
          <p role="status" className="text-[12px] text-hq-mute">
            {SAYS[status]}
          </p>
        </form>
      )}
    </dialog>
  );
}
