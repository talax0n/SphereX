import assert from "node:assert/strict";
import { longestStreak, parseContributions } from "../data/github.ts";

const html = `
<td style="width: 28px">
<td tabindex="-1" data-ix="0" aria-selected="false" aria-describedby="contribution-day-component-0-0" data-date="2026-11-22" id="contribution-day-component-0-0" data-level="0" role="gridcell" class="ContributionCalendar-day"></td>
<td id="contribution-day-component-1-0" data-level="2" data-date="2026-11-23" class="ContributionCalendar-day"></td>
<tool-tip id="tooltip-a" for="contribution-day-component-1-0" popover="manual">3 contributions on November 23rd.</tool-tip>
<tool-tip id="tooltip-b" for="contribution-day-component-0-0" popover="manual">No contributions on November 22nd.</tool-tip>`;

assert.deepEqual(parseContributions(html), [
  { date: "2026-11-22", count: 0, level: 0 },
  { date: "2026-11-23", count: 3, level: 2 },
]);
assert.equal(longestStreak([0, 1, 2, 0, 5, 1, 1, 0].map((count) => ({ count }))), 3);
assert.equal(longestStreak([]), 0);
console.log("ok");
