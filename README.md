# theola.dev

My personal site: one static, server-rendered page that mirrors my CV. No 3D; the only client-side code is the small live "AI at work" poller.

## Run

```bash
npm install
npm run dev
```

## Content

Everything on the page lives in `data/cv.ts`. Wrap text in `**double asterisks**` inside a point to bold it. Visitor-facing changes also get an entry in `data/changelog.ts`.

## Live GitHub data

The hero line, contribution heatmap and recent repos come from GitHub's public contributions page and REST API, fetched on the server with no token. The page revalidates hourly, and those parts simply hide if GitHub is unreachable. Parser check: `node scripts/github.check.ts`.

## AI at work

The "AI at work" section shows which Claude Code and Codex sessions are running on my machine. A watcher reads the local transcripts, reduces them to enums and a short session title, and POSTs that to `/api/pulse`; the page polls it every 15s and hides the section if nothing has ever reported.

- Watcher: `npm run pulse` on the machine running the agents. Needs `PULSE_URL` (the site's `/api/pulse`) and `PULSE_SECRET`, e.g. in `.env.local`.
- Server: needs `PULSE_SECRET` plus `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. Without Redis it keeps the data in memory, per process, for local dev only.
