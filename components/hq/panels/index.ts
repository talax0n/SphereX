import type { ComponentType } from "react";
import type { StationId } from "@/data/stations";
import { AboutPanel } from "./about";
import { AwardsPanel } from "./awards";
import { ContactPanel } from "./contact";
import { ExperiencePanel } from "./experience";
import { GithubPanel } from "./github";
import { PROJECT_PAGES } from "./projects";
import { SkillsPanel } from "./skills";
import { UpdatesPanel } from "./updates";

/** each station has a book of its own; its pages read in this order, one component per page */
export const BOOKS: Record<StationId, readonly ComponentType[]> = {
  about: [AboutPanel],
  projects: PROJECT_PAGES,
  experience: [ExperiencePanel],
  skills: [SkillsPanel],
  awards: [AwardsPanel],
  github: [GithubPanel],
  contact: [ContactPanel],
  updates: [UpdatesPanel],
};
