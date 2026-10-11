export function LeaveStone({ onLeave }: { onLeave: () => void }) {
  return (
    <button
      type="button"
      onClick={onLeave}
      className="h-8 rounded-full border border-hq-line bg-white/80 px-3 text-[11px] font-medium whitespace-nowrap text-hq-ink backdrop-blur transition-colors hover:bg-white max-sm:h-11 pointer-coarse:h-11"
    >
      Leave a stone here
    </button>
  );
}
