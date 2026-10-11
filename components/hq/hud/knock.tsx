import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Crown } from "lucide-react";
import { Toast } from "./hud";
import type { Room } from "../use-room";

/** matches the room's limit, so the button never offers a knock it would drop */
const COOLDOWN = 60_000;

/**
 * A visitor's way to reach Theo: a knock, offered only while he wears a crown in the room.
 * The owner gets the other side, a toast per knock and a system notification while the tab is hidden.
 */
export function Knock({ room, exploring }: { room: Room; exploring: boolean }) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [cooling, setCooling] = useState(false);
  const king = !!room.me && room.kings.has(room.me);
  const home = [...room.kings].some((k) => k !== room.me);

  useEffect(() => {
    if (!room.knocked) return;
    const text = `${room.knocked.name} knocked · say hi in chat`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a knock is an event from the socket, not derived state
    setToast({ id: room.knocked.key, text });
    if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted")
      new Notification("Knock knock", { body: text });
  }, [room.knocked]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const knock = () => {
    room.knock();
    setCooling(true);
    setTimeout(() => setCooling(false), COOLDOWN);
    setToast({ id: performance.now(), text: "Knocked. Theo's been pinged. Say hi in chat." });
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-32 z-30 flex justify-center px-3 max-sm:top-56">
        <AnimatePresence>{toast && <Toast key={toast.id} text={toast.text} />}</AnimatePresence>
      </div>
      {exploring && !king && home && (
        <div
          data-hud
          className="absolute right-5 bottom-40 z-20 max-sm:right-3 max-sm:bottom-auto max-sm:top-24 pointer-coarse:bottom-auto pointer-coarse:top-24"
        >
          <button
            type="button"
            onClick={knock}
            disabled={cooling}
            className="flex min-h-8 items-center gap-1.5 rounded-full border border-hq-line bg-white/90 px-3 text-[11px] font-semibold text-hq-ink backdrop-blur transition-colors hover:bg-white disabled:opacity-60 disabled:hover:bg-white/90 pointer-coarse:min-h-11"
          >
            <Crown className="size-3.5 text-[#d9a21e]" strokeWidth={2.5} aria-hidden />
            {cooling ? "Knocked" : "Knock on Theo's door"}
          </button>
        </div>
      )}
    </>
  );
}
