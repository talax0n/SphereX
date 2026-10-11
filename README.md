# SphereX

SphereX is Theo's portfolio, built as a tiny clay planet you can walk around. It lives at [theola.dev](https://theola.dev).

Instead of scrolling a page, you land on a small Earth with oceans, beaches, forests and drifting clouds. Each part of the portfolio is a little building on the planet. Walk up to one and open it to read that section.

## What's on the planet

| Station | What you find |
|---|---|
| About | Theo's cottage, with a short bio and links |
| Projects | A studio showing the projects Theo shipped |
| Experience | Stone steps that climb through past roles |
| Skills | A workshop holding the languages and tools Theo uses |
| Awards | A podium with trophies |
| GitHub | A garden whose blocks grow from the live contribution graph |
| Contact | A small post office where you can reach Theo |
| Updates | A board listing every change to the site |

## Things to do

- **Explore.** Walk, jump and swim in the sea. The sky follows the Jakarta clock, so you might visit at sunrise or under the stars, when windows and lanterns glow.
- **Travel.** Open the globe map to see the whole planet and jump straight to any station.
- **Meet people.** Other visitors walk around with you in real time. Everyone gets a floating name and can chat. When Theo is online he wears a gold crown.
- **Watch the agents.** Little villagers mirror Theo's live Claude and Codex coding sessions. They drop in, work at desks or the gym, and go to bed when the session ends.
- **Do quests.** Three daily quests, with a streak for coming back.

## Controls

| Keyboard and mouse | Action |
|---|---|
| WASD | Walk |
| Space | Jump |
| Click | Walk to a spot |
| Drag | Look around |
| E | Open the nearby station |
| 1–8 | Travel to a station |
| M | Map |
| Esc | Close |

On phones, use the on-screen joystick and the Jump button.

## How it's built

- **Site:** Next.js 16, React 19 and Tailwind CSS.
- **Planet:** three.js through react-three-fiber. Every model is built in code from simple shapes. One shared material paints wood, brick, tile, stone, grass, sand and water with procedural textures, so there are no image or model files to download.
- **Multiplayer:** a Cloudflare Worker with a Durable Object (`realtime/`) holds the shared room.
- **Live agents:** `scripts/pulse.ts` watches local agent sessions and posts a small summary to `/api/pulse`, which keeps it in Upstash Redis. Only counts and states leave the machine, never transcript text.
- **Content:** everything shown on the site lives in `data/`, as plain TypeScript files.

## Running it

```bash
git clone https://github.com/talax0n/SphereX.git
cd SphereX
npm install
npm run dev          # the site, on http://localhost:3000
npm run realtime:dev # the multiplayer room, optional
npm run pulse        # the live agent feed, optional
```

The planet works without the optional services. Multiplayer and live agents only appear when they're configured.

Environment variables, set in `.env.local`:

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_ROOM_URL` | Address of the multiplayer worker |
| `GITHUB_TOKEN`, `GITHUB_USERNAME` | The GitHub station's contribution data |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Storage for the agent feed (or the `UPSTASH_REDIS_REST_*` names) |
| `PULSE_URL`, `PULSE_SECRET` | Where `npm run pulse` posts, and its shared secret |
The owner key lives only in the worker, set with `wrangler secret put OWNER_KEY`. Visiting with `?owner=<key>` once saves it on that device, which gives you the crown.

## Changelog

Every change a visitor can notice gets an entry at the top of `data/changelog.ts`, and those entries appear on the Updates board on the planet.
