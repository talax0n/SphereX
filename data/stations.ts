import { AWARDS } from "./awards";
import { CHANGELOG } from "./changelog";
import { PROJECTS } from "./projects";

export type StationId =
  | "about"
  | "projects"
  | "experience"
  | "skills"
  | "awards"
  | "github"
  | "contact"
  | "updates"
  | "guestbook";

export interface Station {
  id: StationId;
  /** name tag and dock text */
  label: string;
  hotkey: string;
  /** landmark spot on the planet in degrees: polar angle from the hub at the north pole, then azimuth */
  at: [number, number];
  /** what the keeper at the door says when you walk up */
  line: string;
}

export const STATIONS: readonly Station[] = [
  { id: "about", label: "About", hotkey: "1", at: [36, 110], line: "Hi! This is Theo's house. He plans the architecture before the code." },
  { id: "projects", label: "Projects", hotkey: "2", at: [38, 290], line: `Psst. Theo shipped ${PROJECTS.length} projects. SolHedge is my favourite.` },
  { id: "experience", label: "Experience", hotkey: "3", at: [38, 200], line: "Two years of fintech, e-commerce and healthcare. Climb the steps." },
  { id: "skills", label: "Skills", hotkey: "4", at: [40, 155], line: "React, Next.js, Unity, Docker. Theo keeps them all in here." },
  { id: "awards", label: "Awards", hotkey: "5", at: [70, 65], line: `${AWARDS.length} awards on the podium. Go on, have a look.` },
  { id: "github", label: "GitHub", hotkey: "6", at: [72, 245], line: "Every cube is a day of commits. It's getting tall." },
  { id: "contact", label: "Contact", hotkey: "7", at: [70, 345], line: "Want to build something together? Leave Theo a letter." },
  { id: "updates", label: "Updates", hotkey: "8", at: [26, 20], line: `Fresh off the press: v${CHANGELOG[0].version}. Read the board.` },
  { id: "guestbook", label: "Guestbook", hotkey: "9", at: [42, 62], line: "Say something nice and pin it up. Theo reads every note." },
];

export const STATION_BY_ID = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
) as Record<StationId, Station>;
