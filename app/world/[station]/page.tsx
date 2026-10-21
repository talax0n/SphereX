import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HQ } from "@/components/hq/hq";
import { AWARDS } from "@/data/awards";
import { CHANGELOG } from "@/data/changelog";
import { EXPERIENCE } from "@/data/experience";
import { PROFILE } from "@/data/profile";
import { PROJECTS } from "@/data/projects";
import { SKILLS } from "@/data/skills";
import { STATIONS, STATION_BY_ID, type StationId } from "@/data/stations";

export const dynamicParams = false;

const SUMMARY: Record<StationId, string> = {
  about: `${PROFILE.role} in ${PROFILE.location}. ${PROFILE.summary}`,
  projects: `${PROJECTS.length} shipped projects: ${PROJECTS.map((p) => p.title).join(", ")}.`,
  experience: EXPERIENCE.map((e) => `${e.role} at ${e.company} (${e.years})`).join(". ") + ".",
  skills: `${SKILLS.slice(0, 12).map((s) => s.name).join(", ")} and more.`,
  awards: AWARDS.map((a) => `${a.title}, ${a.issuer}`).join(". ") + ".",
  github: "A year of GitHub contributions, streaks and the repos I work in.",
  contact: `Want to build something together? Write to ${PROFILE.email}.`,
  updates: `What's new on the planet. Latest: v${CHANGELOG[0].version}, ${CHANGELOG[0].title}.`,
  guestbook: "Notes visitors pinned on the board. Leave one of your own.",
};

export function generateStaticParams() {
  return STATIONS.map((s) => ({ station: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ station: string }> }): Promise<Metadata> {
  const { station } = await params;
  const s = STATION_BY_ID[station as StationId];
  if (!s) return {};
  const title = `${s.label} · Theo Niomba`;
  const description = SUMMARY[s.id];
  return {
    title,
    description,
    alternates: { canonical: `/world/${s.id}` },
    openGraph: { title, description, url: `/world/${s.id}`, siteName: "SphereX", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function StationPage({ params }: { params: Promise<{ station: string }> }) {
  const { station } = await params;
  if (!(station in STATION_BY_ID)) notFound();
  return <HQ start={station as StationId} />;
}
