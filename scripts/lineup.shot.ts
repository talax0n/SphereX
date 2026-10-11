import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// `node scripts/lineup.shot.ts` screenshots /lineup; `... info` logs draw calls on the main page;
// `... chore` freezes each keeper's chore at a few moments; `... game` plays the real game and shoots it 4 s apart.
// Needs `npx next dev -p 3310` running from this checkout.
const HOST = "http://localhost:3310";

// playwright isn't a dependency: borrow npx's copy
const bin = execSync(`npx -y -p playwright@1 sh -c 'echo $PATH'`, { encoding: "utf8" })
  .split(":")
  .find((p) => p.includes("_npx"));
if (!bin) throw new Error("npx did not put playwright on the PATH");
// just the corner of playwright's API used here, since its types aren't installed either
interface Page {
  on(e: "pageerror", f: (e: Error) => void): void;
  on(e: "response", f: (r: { status(): number; url(): string }) => void): void;
  on(e: "console", f: (m: { text(): string }) => void): void;
  goto(url: string): Promise<unknown>;
  waitForSelector(sel: string, o: { timeout: number }): Promise<unknown>;
  screenshot(o: { path: string }): Promise<unknown>;
  click(sel: string, o: { timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<unknown>;
}
interface Browser {
  newPage(o: { viewport: { width: number; height: number } }): Promise<Page>;
  close(): Promise<void>;
}
const { chromium } = (await import(pathToFileURL(join(dirname(bin), "playwright", "index.mjs")).href)) as {
  chromium: { launch(o: { args: string[] }): Promise<Browser> };
};

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("response", (r) => r.status() >= 500 && console.error("http", r.status(), r.url()));

if (process.argv[2] === "info") {
  const calls = new Promise<string>((ok) => page.on("console", (m) => m.text().startsWith("draw calls") && ok(m.text())));
  await page.goto(`${HOST}/?info`);
  console.log(await calls);
} else if (process.argv[2] === "game") {
  await page.goto(`${HOST}/?hour=11`);
  await page.click("button:visible:has-text('Skip intro')", { timeout: 120_000 });
  await page.waitForTimeout(6000);
  for (const k of [1, 2, 3]) {
    await page.screenshot({ path: `/tmp/game-${k}.png` });
    console.log(`/tmp/game-${k}.png`);
    await page.waitForTimeout(4000);
  }
} else if (process.argv[2] === "chore") {
  // front on, then turned a third of the way round to show how far each prop reaches
  for (const yaw of [0, 0.9]) {
    for (const t of [0.6, 1.4, 2.4, 3.3, 4.2]) {
      await page.goto(`${HOST}/lineup?chore&t=${t}&yaw=${yaw}`);
      await page.waitForSelector("body[data-ready]", { timeout: 60_000 });
      await page.screenshot({ path: `/tmp/chore-${yaw}-${t}.png` });
      console.log(`/tmp/chore-${yaw}-${t}.png`);
    }
  }
} else {
  for (const [query, out] of [
    ["", "/tmp/lineup-front.png"],
    ["?back", "/tmp/lineup-back.png"],
    ["?keepers", "/tmp/lineup-keepers.png"],
    ["?seeds", "/tmp/lineup-seeds.png"],
    ["?seeds&back", "/tmp/lineup-seeds-back.png"],
    ["?wear", "/tmp/lineup-wear.png"],
    ["?wear&back", "/tmp/lineup-wear-back.png"],
  ]) {
    await page.goto(`${HOST}/lineup${query}`);
    await page.waitForSelector("body[data-ready]", { timeout: 60_000 });
    await page.screenshot({ path: out });
    console.log(out);
  }
}
await browser.close();
