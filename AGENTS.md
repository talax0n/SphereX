<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Changelog

Every change a visitor can notice ships with an entry in `data/changelog.ts`, in the same commit. The latest version shows in the page footer.

- Add the entry at the top of `CHANGELOG`. The list is newest first.
- Bump the version with semver against the current top entry:
  - **Major** (`2.0.0`): the site is reworked or a core interaction changes, such as how you move or navigate.
  - **Minor** (`1.4.0`): a new feature, station, panel, or visible behavior.
  - **Patch** (`1.3.1`): a fix or polish to something that already exists.
- Several changes made on the same day can share one release. Bump that release up a level if a later change calls for it, such as a patch release that later gains a feature.
- Set `date` to the release day in Asia/Jakarta time, formatted `yyyy-mm-dd`.
- Write `title` and `notes` for visitors, in first person and plain words. Use one short sentence per note, and leave out file names and jargon.
- Internal-only changes do not get an entry. These include refactors, dev tooling, tests, and docs.
