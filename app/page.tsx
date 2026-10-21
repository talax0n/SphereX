import { Contact } from "@/components/home/contact";
import { Hero } from "@/components/home/hero";
import { Navbar } from "@/components/home/navbar";
import { Path } from "@/components/home/path";
import { Stack } from "@/components/home/stack";
import { Work } from "@/components/home/work";

export default function Home() {
  return (
    // the planet locks the body's scroll, so this page scrolls itself
    <div className="h-dvh scroll-smooth overflow-y-auto bg-hq-bg text-hq-ink">
      <Navbar />
      <main>
        <Hero />
        <Work />
        <Stack />
        <Path />
        <Contact />
      </main>
    </div>
  );
}
