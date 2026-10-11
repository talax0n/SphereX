"use client";

import { type FormEvent, useEffect, useState } from "react";
import { type Note, TEXT_MAX, parseNote, parseNotes } from "@/data/notes";
import { NAME_MAX, cleanName } from "@/data/room";
import { ago } from "@/data/pulse";

const NAME_KEY = "hq:name";
const ERRORS: Record<number, string> = {
  400: "That note can't go up. Check your name and message.",
  429: "You just pinned one. Give it a few minutes.",
};

export function GuestbookPanel() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(Date.now);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
      setName(cleanName(localStorage.getItem(NAME_KEY)) ?? "");
    } catch {}
    fetch("/api/notes")
      .then((r) => r.json())
      .then((x: unknown) => setNotes(parseNotes(x)))
      .catch(() => setNotes([]));
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    const res = await fetch("/api/notes", { method: "POST", body: JSON.stringify({ name: name.trim(), text }) }).catch(() => null);
    const note = res?.ok ? parseNote(await res.json().catch(() => null)) : null;
    setSending(false);
    if (!note) return setError(ERRORS[res?.status ?? 0] ?? "Couldn't pin it just now. Try again in a bit.");
    setNotes((n) => [note, ...(n ?? [])]);
    setText("");
  };

  return (
    <div className="space-y-5">
      <form onSubmit={send} className="space-y-2 rounded-2xl border border-hq-line p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          required
          placeholder="Your name"
          aria-label="Your name"
          className="w-full rounded-lg border border-hq-line bg-white px-2.5 py-1.5 text-[13px] text-hq-ink outline-none focus:border-hq-accent"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={TEXT_MAX}
          required
          rows={3}
          placeholder="Say hi, leave a tip, tell Theo what you liked"
          aria-label="Your note"
          className="w-full resize-none rounded-lg border border-hq-line bg-white px-2.5 py-1.5 text-[13px] text-hq-ink outline-none focus:border-hq-accent"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-hq-mute" role="status">
            {error ?? `${text.length}/${TEXT_MAX}`}
          </p>
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-hq-accent px-3.5 py-1.5 text-[11px] font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {sending ? "Pinning…" : "Pin it up"}
          </button>
        </div>
      </form>

      {notes === null ? (
        <p className="text-[13px] text-hq-mute">Reading the board…</p>
      ) : notes.length ? (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={`${n.at}-${n.name}`} className="border-b border-hq-line pb-3 last:border-0">
              <p className="text-[13px] leading-snug text-hq-ink">{n.text}</p>
              <p className="mt-1 text-[11px] text-hq-mute">
                {n.name} · {ago(Math.max(0, now - n.at))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-hq-mute">The board is empty. Be the first to pin a note.</p>
      )}
    </div>
  );
}
