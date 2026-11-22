export type Link = { label: string; href: string };
export type Role = { org: string; title: string; dates: string; place: string; points: string[] };
export type Project = { name: string; stack: string[]; points: string[]; href?: string };
export type Award = { emoji: string; place: string; project?: string; event: string; by?: string; date: string };

export const CV: {
  name: string;
  tagline: string;
  summary: string;
  links: Link[];
  education: Role[];
  experience: Role[];
  projects: Project[];
  awards: Award[];
  skills: [category: string, items: string[]][];
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
      points: ["Built and maintained employer-facing **admin dashboards** for internal management systems"],
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
      stack: ["Rust", "Anchor", "Next.js", "PostgreSQL", "Telegram Bot"],
      points: ["On-chain vaults with share accounting, 4h NAV epochs, admin dashboard, and manager Telegram bot"],
    },
    {
      name: "SolHedge",
      stack: ["TypeScript", "Node.js", "PostgreSQL", "Kubernetes", "Solana"],
      href: "https://solhedge.xyz/",
      points: ["Delta-hedged LP automation: market watcher, hedge strategy, and execution services over a Postgres job queue"],
    },
    {
      name: "Octora",
      stack: ["TypeScript", "React", "Fastify", "Prisma", "Circom"],
      href: "https://www.octora.xyz/",
      points: [
        "Private execution layer for Meteora LP: routes intents through privacy relays (MagicBlock) to hide origin wallets from copy-trade bots",
      ],
    },
    {
      name: "XFlare",
      stack: ["Next.js", "NestJS", "Turborepo", "Zustand", "Docker"],
      href: "https://xflare.app/",
      points: ["Crypto trading platform with portfolio dashboard, referral tree, and points system"],
    },
  ],
  awards: [
    { emoji: "🥈", place: "Second Winner", project: "Octora", event: "Indonesia National Campus Hackathon", date: "May 2026" },
    { emoji: "🏅", place: "Fourth Winner", project: "Panora", event: "Indonesia National Campus Hackathon", date: "May 2026" },
    { emoji: "🏆", place: "Second Public Favorite", event: "Startup Village 2026", by: "Superteam Indonesia", date: "Apr 2026" },
    { emoji: "🎓", place: "Scholarship Awardee", event: "Mancer Web3 Scholarship", by: "Mancer Work", date: "Apr 2026" },
    { emoji: "⭐", place: "Mentor's Favorite", event: "Kelas Rutin", by: "Blockdev.id", date: "Nov 2025" },
  ],
  skills: [
    ["Languages", ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Solidity", "C#", "Kotlin"]],
    ["Frameworks", ["React", "Next.js", "Tailwind", "Vue.js", "Svelte", "Gin", "Flask", "Laravel", "GraphQL"]],
    ["Data & DevOps", ["PostgreSQL", "MySQL", "Redis", "Firebase", "Docker", "Kubernetes", "Git", "Linux"]],
    ["Web3", ["Solana", "Anchor", "Meteora", "Jupiter", "Phoenix", "Foundry", "OpenZeppelin"]],
  ],
};
