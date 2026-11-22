# theola.dev

My personal site: one static, server-rendered page that mirrors my CV. No 3D, no client JS beyond what Next.js ships.

## Run

```bash
npm install
npm run dev
```

## Content

Everything on the page lives in `data/cv.ts`. Wrap text in `**double asterisks**` inside a point to bold it. Visitor-facing changes also get an entry in `data/changelog.ts`.

## Live GitHub data

The hero line, contribution heatmap and recent repos come from GitHub's public contributions page and REST API, fetched on the server with no token. The page revalidates hourly, and those parts simply hide if GitHub is unreachable. Parser check: `node scripts/github.check.ts`.
