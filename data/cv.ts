export type Link = { label: string; href: string };
export type Skill = { name: string; icon: string };
export type Role = { org: string; title: string; dates: string; place: string; points: string[] };
export type Project = { name: string; stack: string[]; points: string[]; href?: string; image?: string };
export type Award = { emoji: string; place: string; project?: string; prize?: number; event: string; by?: string; date: string };

export const CV: {
  name: string;
  tagline: string;
  summary: string;
  links: Link[];
  education: Role[];
  experience: Role[];
  projects: Project[];
  awards: Award[];
  skills: [category: string, items: Skill[]][];
} = {
  name: "Theola Aristo Putra Niomba",
  tagline: "Fullstack & smart contract engineer building production DeFi on Solana.",
  summary:
    "Computer Science student (GPA 3.85) building production DeFi on Solana: two mainnet protocols serving 150+ users with up to $50k AUM. Lab assistant teaching 300+ students per semester. Expanding into AI/ML.",
  links: [
    { label: "Email", href: "mailto:theo.niomba@gmail.com" },
    { label: "LinkedIn", href: "https://linkedin.com/in/theola-aristo-putra-niomba" },
    { label: "GitHub", href: "https://github.com/talax0n" },
  ],
  education: [
    {
      org: "BINUS University",
      title: "BSc Computer Science, GPA 3.85/4.00, Mentor Scholarship (2025)",
      dates: "Sep 2024 – Mar 2028 (expected)",
      place: "Tangerang Selatan",
      points: [],
    },
  ],
  experience: [
    {
      org: "Hedgin",
      title: "Fullstack & Smart Contract Engineer",
      dates: "Sep 2026 – Present",
      place: "Remote",
      points: [
        "Building a Solana fund-management protocol on mainnet: **$50k AUM** from **100 depositors**",
        "Wrote **Anchor** vault program where whitelisted managers trade only via Jupiter, Meteora DLMM, and Phoenix",
        "Built NAV keeper, deposit/withdraw settlement, Manager API, and **TypeScript SDK** published on npm",
      ],
    },
    {
      org: "SolHedge",
      title: "Fullstack & Backend Engineer",
      dates: "Apr 2026 – Present",
      place: "Remote",
      points: [
        "Shipped automated Meteora DLMM liquidity hedged with Phoenix perp shorts: **$18k peak TVL**, **50 active users**",
        "Designed job-queue execution pipeline with **KMS**-custodied signing, rebalancing, and 15m strategy signals",
        "Ran 10+ microservices on **Kubernetes**; 3,400+ commits across API, execution, market data, and dashboards",
      ],
    },
    {
      org: "PT. KRUUU Technology Indonesia",
      title: "Fullstack Developer",
      dates: "Dec 2025 – Mar 2026",
      place: "Jakarta Selatan",
      points: ["Built and maintained employer-facing **internal tools** for the company's management systems"],
    },
    {
      org: "BINUS University",
      title: "Laboratory Assistant & Internal Projects Developer",
      dates: "Jan 2025 – Present",
      place: "Tangerang Selatan",
      points: [
        "Teach 300+ students per semester in OOP, Deep Learning, Penetration Testing, and Big Data",
        "Qualified to teach 83.3% of Computer Science, Cyber Security, and Information Systems subjects",
      ],
    },
  ],
  projects: [
    {
      name: "Hedgin",
      href: "https://hedgin.xyz/",
      image: "/projects/hedgin.png",
      stack: ["Rust", "Anchor", "Next.js", "PostgreSQL", "Telegram Bot"],
      points: ["On-chain vaults with share accounting, 4h NAV epochs, admin dashboard, and manager Telegram bot"],
    },
    {
      name: "SolHedge",
      image: "/projects/solhedge.png",
      stack: ["TypeScript", "Node.js", "PostgreSQL", "Kubernetes", "Solana"],
      href: "https://solhedge.xyz/",
      points: ["Delta-hedged LP automation: market watcher, hedge strategy, and execution services over a Postgres job queue"],
    },
    {
      name: "Octora",
      image: "/projects/octora.png",
      stack: ["TypeScript", "React", "Fastify", "Prisma", "Circom"],
      href: "https://www.octora.xyz/",
      points: [
        "Private execution layer for Meteora LP: routes intents through privacy relays (MagicBlock) to hide origin wallets from copy-trade bots",
      ],
    },
    {
      name: "XFlare",
      image: "/projects/xflare.png",
      stack: ["Next.js", "NestJS", "Turborepo", "Zustand", "Docker"],
      href: "https://xflare.app/",
      points: ["Crypto trading platform with portfolio dashboard, referral tree, and points system"],
    },
    {
      name: "Ether",
      image: "/projects/ether.png",
      stack: ["Kotlin", "Jetpack Compose", "Supabase", "PostgreSQL"],
      href: "https://github.com/talax0n/Ether",
      points: ["Swipe-to-match Android app for forming hackathon teams: per-competition decks, mutual matches auto-form teams, outcome-based XP and badges"],
    },
    {
      name: "Aeron",
      image: "/projects/aeron.png",
      stack: ["TypeScript", "Electron", "React", "Playwright", "Docker"],
      href: "https://github.com/talax0n/aeron-releases",
      points: ["Desktop grading pipeline for lab corrections: sandboxed test runs, two LLMs grade blind and a council settles disputes, then marks autofill the grid after human review"],
    },
    {
      name: "Bilinkers",
      image: "/projects/bilinkers.png",
      stack: ["Rust", "Chrome DevTools Protocol", "Codex CLI"],
      href: "https://github.com/talax0n/bilinkers",
      points: ["Desktop bot that drives a browser through LMS courses, detecting each page type and completing exercises, with an LLM for open questions"],
    },
  ],
  awards: [
    { emoji: "🥈", place: "Second Winner", project: "Octora", prize: 2500, event: "Indonesia National Campus Hackathon", date: "May 2026" },
    { emoji: "🏅", place: "Fourth Winner", project: "Panora", prize: 500, event: "Indonesia National Campus Hackathon", date: "May 2026" },
    { emoji: "🏆", place: "Second Public Favorite", prize: 400, event: "Startup Village 2026", by: "Superteam Indonesia", date: "Apr 2026" },
    { emoji: "🎓", place: "Scholarship Awardee", event: "Mancer Web3 Scholarship", by: "Mancer Work", date: "Apr 2026" },
    { emoji: "⭐", place: "Mentor's Favorite", event: "Kelas Rutin", by: "Blockdev.id", date: "Nov 2025" },
  ],
  skills: [
    ["Languages", [
      { name: "TypeScript", icon: "/skills/typescript.svg" },
      { name: "JavaScript", icon: "/skills/javascript.svg" },
      { name: "Python", icon: "/skills/python.svg" },
      { name: "Go", icon: "/skills/go.svg" },
      { name: "Rust", icon: "/skills/rust.svg" },
      { name: "Solidity", icon: "/skills/solidity.svg" },
      { name: "C#", icon: "/skills/csharp.svg" },
      { name: "Kotlin", icon: "/skills/kotlin.svg" },
    ]],
    ["Frameworks", [
      { name: "React", icon: "/skills/react.svg" },
      { name: "Next.js", icon: "/skills/nextjs.svg" },
      { name: "Tailwind", icon: "/skills/tailwind.svg" },
      { name: "Vue.js", icon: "/skills/vue.svg" },
      { name: "Svelte", icon: "/skills/svelte.svg" },
      { name: "Gin", icon: "/skills/gin.svg" },
      { name: "Flask", icon: "/skills/flask.svg" },
      { name: "Laravel", icon: "/skills/laravel.svg" },
      { name: "GraphQL", icon: "/skills/graphql.svg" },
    ]],
    ["Data & DevOps", [
      { name: "PostgreSQL", icon: "/skills/postgresql.svg" },
      { name: "MySQL", icon: "/skills/mysql.svg" },
      { name: "Redis", icon: "/skills/redis.svg" },
      { name: "Firebase", icon: "/skills/firebase.svg" },
      { name: "Docker", icon: "/skills/docker.svg" },
      { name: "Kubernetes", icon: "/skills/kubernetes.svg" },
      { name: "Git", icon: "/skills/git.svg" },
      { name: "Linux", icon: "/skills/linux.svg" },
    ]],
    ["Web3", [
      { name: "Solana", icon: "/skills/solana.svg" },
      { name: "Anchor", icon: "/skills/anchor.png" },
      { name: "Meteora", icon: "/skills/meteora.svg" },
      { name: "Jupiter", icon: "/skills/jupiter.svg" },
      { name: "Phoenix", icon: "/skills/phoenix.png" },
      { name: "Foundry", icon: "/skills/foundry.png" },
      { name: "OpenZeppelin", icon: "/skills/openzeppelin.svg" },
    ]],
  ],
};
