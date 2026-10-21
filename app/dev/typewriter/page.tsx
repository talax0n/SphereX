import { notFound } from "next/navigation";
import { Typewriter } from "@/components/home/typewriter";

/** Dev-only: the typewriter figure alone, for screenshots. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main style={{ maxWidth: 680, margin: "40px auto", padding: "0 16px", background: "#f3f2ef" }}>
      <Typewriter />
    </main>
  );
}
