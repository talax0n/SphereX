export interface Release {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

/** newest first */
export const CHANGELOG: Release[] = [
  {
    version: "1.10.0",
    date: "2026-10-11",
    title: "Read it like a book",
    notes: [
      "Every station now keeps its own old leather-bound book, with a gold-stamped cover and yellowed pages.",
      "The cover swings open on a title page and shuts when you close it.",
      "Pages turn over on the spine, two at a time on a big screen.",
      "Turn pages with the arrows under the book, the arrow keys, or a swipe on a phone.",
      "Every project gets a page of its own.",
    ],
  },
  {
    version: "1.9.3",
    date: "2026-10-11",
    title: "No ghosts at work",
    notes: ["People who finished their work no longer pop back into HQ for a minute."],
  },
  {
    version: "1.9.2",
    date: "2026-10-11",
    title: "Speech bubbles",
    notes: ["The bubbles over people at work now float above their heads, with a little tail."],
  },
  {
    version: "1.9.1",
    date: "2026-10-11",
    title: "Names over heads",
    notes: ["More of the people at work in HQ now show what they are working on."],
  },
  {
    version: "1.9.0",
    date: "2026-10-11",
    title: "Everyone is someone",
    notes: [
      "People now have faces that smile, grin, gasp or beam.",
      "Everyone wears real outfits, with sleeves, hands, and trousers, skirts or dresses.",
      "Some wear hoodies, jackets, overalls or stripes.",
      "Most people have hair, from curls and buns to pigtails and long hair.",
      "Each keeper dresses for their station and holds a tool of their job, like a trophy or a wrench.",
      "The station keepers get on with their jobs, take little walks and wave when you come over.",
      "Kids now walk around too, and grown-ups come in different heights and builds.",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-10-11",
    title: "Step inside",
    notes: [
      "Every station has a flight of stone steps up to its floor.",
      "Climb the steps to walk around inside, between the furniture.",
      "The camera leans in and looks over the walls while you're inside.",
      "You can climb the Experience steps and the Awards podium one step at a time.",
      "Click somewhere outside and you find your own way back down the steps.",
      "Press E anywhere inside a station to open it.",
    ],
  },
  {
    version: "1.7.1",
    date: "2026-10-11",
    title: "A smoother planet",
    notes: ["The planet draws faster, so it runs smoother, especially on phones and older laptops."],
  },
  {
    version: "1.7.0",
    date: "2026-10-11",
    title: "Jump and swim",
    notes: [
      "Press Space to jump. On a phone, tap the Jump button.",
      "Walk into the sea to swim. You splash in and paddle around.",
      "Other visitors see you swimming too.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-10-11",
    title: "A tiny Earth",
    notes: [
      "The planet now has an ocean, sandy beaches, lakes and foamy waves.",
      "A soft blue sky glows around the globe, and clouds drift past.",
      "The grass, paths and plaza have real texture now.",
      "Pines, palms, bushes and rocks grow across the land.",
      "Every station is rebuilt with tiled roofs, brick and plaster walls, wood floors and little details.",
      "Windows and lanterns glow warm at night.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-10",
    title: "A greener GitHub panel",
    notes: [
      "The contribution graph is green now, like on GitHub.",
      "You can see my all-time contributions, my current streak, and my longest streak.",
      "A breakdown shows how my year splits across commits, pull requests, reviews, and issues.",
      "The panel lists a few repositories I worked on this year.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-10-10",
    title: "Names and a better chat",
    notes: [
      "Everyone now has a name floating over their head, and so do I, so you know what others see.",
      "You get a friendly random name the first time you visit, and you can change it from the chat.",
      "The chat is now a proper card with names, a short history, and a send button.",
      "With the chat closed, new messages show as a small preview that fades away.",
      "When I'm on the planet, I wear a gold crown and a King badge, so you know it's really me.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-10",
    title: "Company and a board",
    notes: [
      "Visitors now share the planet: you can see each other walk around and chat.",
      "Agents gather in one HQ on the Projects plinth with desks, a gym, and a nap corner.",
      "This Updates board, so you can see what changed.",
      "Stations moved closer together, so nothing hides on the far side of the planet anymore.",
      "Street lamps light up at night, and you can click one to switch it on or off.",
      "The welcome chat grows with your screen, so it's easier to read on big displays.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-10-10",
    title: "Day and night",
    notes: [
      "The sky follows the Jakarta clock, from sunrise to a starry night.",
      "Agent bubbles stack instead of overlapping when villagers crowd together.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-09",
    title: "Live agents",
    notes: [
      "Villagers now mirror my live Claude and Codex sessions, one per agent.",
      "Each agent drops in from the sky, works at a desk or the gym, and heads to bed when done.",
      "Project monitors scroll code while an agent works at them.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-09",
    title: "HQ, a tiny clay planet",
    notes: [
      "The portfolio is now a walkable clay planet with a station per section.",
      "A first-visit intro, a minimap, and a spinnable globe map you can travel from.",
      "Three daily quests with a streak, and a touch joystick on phones.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-09-13",
    title: "Static and fast",
    notes: ["Content is hardcoded, the admin and database are gone.", "Added a GitHub commit graph."],
  },
  {
    version: "0.3.0",
    date: "2026-08-25",
    title: "UI rework",
    notes: ["Reworked the whole portfolio UI."],
  },
  {
    version: "0.2.0",
    date: "2026-04-25",
    title: "Project details",
    notes: ["Project detail pages and a downloadable CV."],
  },
  {
    version: "0.1.0",
    date: "2026-04-23",
    title: "First version",
    notes: ["A scrolling portfolio with projects, about, and contact sections, plus a theme toggle."],
  },
];
