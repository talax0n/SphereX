import { notFound } from "next/navigation";
import { Lineup } from "@/components/hq/lineup";

/** Dev-only: every kind of character in a row, for screenshots. `?back` turns them round, `?spin` turns them slowly, `?keepers` and `?seeds` zoom in on the keepers or the villagers, `?wear` shows each wearable alone, `?chore` plays each keeper's chore (`&t=2.5` freezes it at 2.5 s), and `&yaw=1.2` turns everyone that many radians. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const view = "chore" in q ? "chore" : "keepers" in q ? "keepers" : "seeds" in q ? "seeds" : "wear" in q ? "wear" : "all";
  return <Lineup back={"back" in q} spin={"spin" in q} view={view} at={q.t ? Number(q.t) : null} yaw={Number(q.yaw ?? 0)} />;
}
