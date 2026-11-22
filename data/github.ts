export type Day = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };
export type Repo = {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  pushedAt: string;
};
export type GitHub = {
  user: string;
  total: number;
  weeks: Day[][];
  longest: number;
  best: Day | null;
  repos: Repo[];
  repoCount: number;
};

const USER = "talax0n";
const REVALIDATE = { next: { revalidate: 3600 } };

// Attributes come in any order, so each one is matched on its own inside the tag.
export function parseContributions(html: string): Day[] {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/<tool-tip\b([^>]*)>([^<]*)<\/tool-tip>/g)) {
    const id = /\bfor="([^"]+)"/.exec(m[1])?.[1];
    if (id) counts.set(id, Number(/^(\d+) contribution/.exec(m[2].trim())?.[1] ?? 0));
  }
  const days: Day[] = [];
  for (const [tag] of html.matchAll(/<td\b[^>]*\bdata-date="[^"]*"[^>]*>/g)) {
    const date = /\bdata-date="([^"]+)"/.exec(tag)?.[1];
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const level = Number(/\bdata-level="(\d)"/.exec(tag)?.[1] ?? 0);
    if (date) days.push({ date, count: (id && counts.get(id)) || 0, level: level as Day["level"] });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

export function groupWeeks(days: Day[]): Day[][] {
  const weeks: Day[][] = [];
  for (const d of days) {
    // UTC so the weekday never shifts with the server timezone.
    if (!weeks.length || new Date(`${d.date}T00:00:00Z`).getUTCDay() === 0) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  }
  return weeks;
}

export function longestStreak(days: { count: number }[]): number {
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (mins < 60) return mins < 2 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months === 1 ? "" : "s"} ago` : `${Math.floor(months / 12)}y ago`;
}

const api = (path: string) =>
  fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "portfolio-site" },
    ...REVALIDATE,
  });

export async function getGitHub(): Promise<GitHub | null> {
  try {
    const [pageRes, reposRes] = await Promise.all([
      fetch(`https://github.com/users/${USER}/contributions`, REVALIDATE),
      api(`/users/${USER}/repos?sort=pushed&per_page=100`),
    ]);
    if (!pageRes.ok || !reposRes.ok) return null;
    const days = parseContributions(await pageRes.text());
    if (!days.length) return null;

    const raw: {
      name: string;
      html_url: string;
      description: string | null;
      language: string | null;
      stargazers_count: number;
      pushed_at: string;
      fork: boolean;
    }[] = await reposRes.json();
    const own = raw.filter((r) => !r.fork && r.name !== USER);

    let best: Day | null = null;
    for (const d of days) if (d.count > 0 && (!best || d.count > best.count)) best = d;

    return {
      user: USER,
      total: days.reduce((n, d) => n + d.count, 0),
      weeks: groupWeeks(days),
      longest: longestStreak(days),
      best,
      // ponytail: one page of 100 repos; paginate if the account outgrows it
      repoCount: own.length,
      repos: own.slice(0, 5).map((r) => ({
        name: r.name,
        url: r.html_url,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        pushedAt: r.pushed_at,
      })),
    };
  } catch {
    return null;
  }
}
