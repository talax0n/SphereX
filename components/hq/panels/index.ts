import type { ComponentType } from "react";
import { STATIONS, type StationId } from "@/data/stations";
import { AboutPanel } from "./about";
import { AwardsPanel } from "./awards";
import { ContactPanel } from "./contact";
import { ExperiencePanel } from "./experience";
import { GithubPanel } from "./github";
import { PROJECT_PAGES } from "./projects";
import { SkillsPanel } from "./skills";
import { UpdatesPanel } from "./updates";

/** each station is a chapter of the book, most of them a single page */
const CHAPTERS: Record<StationId, readonly ComponentType[]> = {
  about: [AboutPanel],
  projects: PROJECT_PAGES,
  experience: [ExperiencePanel],
  skills: [SkillsPanel],
  awards: [AwardsPanel],
  github: [GithubPanel],
  contact: [ContactPanel],
  updates: [UpdatesPanel],
};

export interface Page {
  chapter: StationId;
  Content: ComponentType;
}

/** the chapters in station order, so the book reads the same way the dock counts */
export const BOOK: readonly Page[] = STATIONS.flatMap((s) => CHAPTERS[s.id].map((Content) => ({ chapter: s.id, Content })));

export const firstPage = (id: StationId) => BOOK.findIndex((p) => p.chapter === id);
