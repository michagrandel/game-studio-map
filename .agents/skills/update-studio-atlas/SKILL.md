---
name: update-studio-atlas
description: 'Update the Game Studio Map project: add, edit, or remove game studio profiles in game_studios_enzyklop_die.md, register resources in studio-resources.mjs, rebuild index.html, and run tests. Use when: adding a studio, updating studio data (project, engine, investor, layoffs), fixing locations, refreshing job listings, or regenerating the report.'
---

# Update Game Studio Map

The project builds a self-contained HTML report (`index.html`) from
a Markdown source. Never edit the generated HTML or `report-data.json` by hand —
always change inputs and rebuild.

## Data flow

`game_studios_enzyklop_die.md` (source, English) + `studio-resources.mjs`
(editorial resources) → `node build-report.mjs` parses, categorizes, and injects
data into `report-template.html` → `index.html`. `report-data.json`
is the research cache (jobs, map, flags, artwork).

## Step 1 — Edit the source document

Every data-maintenance run must review **all studio profiles**, not only the
requested studio: research locations, engines, projects, ownership, franchises,
genres, and outlook/layoffs, then update the source with supported findings.
Update collection dates only for profiles actually researched. Report unavailable
or uncertain sources explicitly; never advance dates to imply research that was
not performed. A career scrape alone does not update studio facts.

One profile per studio in `game_studios_enzyklop_die.md`, under a `## N. Group`
section heading (the heading text becomes the studio's `group`):

```markdown
### Studio Name
> **Data collected:** YYYY-MM-DD
* **Location:** City, Country 🇺🇳
* **Engine:** ...
* **Current Project:** ...
* **Franchise:** [[Wiki Link]], ...
* **Genre:** 🗡️ ...
* **Publisher:** ...
* **Investor/Parent Company:** ...
* **Future Outlook & Layoffs:** ...
```

Hard rules:
- Exactly these 8 field keys, in this order, format `* **Key:** value`.
- Keep `> **Data collected:** YYYY-MM-DD` directly under every studio heading.
  Use the date the studio information was researched or verified, and update it
  whenever factual information is changed or re-verified; formatting-only edits
  do not change the date. Existing profiles carry a `2026-11-11` baseline date,
  which is not confirmation that every profile was re-verified on that date.
- English prose. Standard English city/country names (Warsaw, Kyiv, Ghent,
  Quebec City, …) — the Location value must start with a key of `cities` in
  `studio-resources.mjs`, or the studio name must have a `locationOverrides`
  entry there.
- `###` studio names are database keys — never rename casually (job-research
  cache is carried over by name; renaming loses it until the next `--refresh`).
- Keep `[[...]]` wiki links and flag/genre emojis.
- Studios with multiple sites: one `###` profile per site; use
  `locationOverrides` for multi-city profiles.
- Stability text drives keyword classification (`stabilityCategory` in
  `build-report.mjs`): positive words (stable, safe, profitable, self-funded…)
  → *Stable per Document*; risk words (layoff, restructuring, pressure,
  transition…) → *In Transition / Mixed*; severe cases → *Elevated Risk*.
  Write "No major layoffs" for the negation — it is stripped before matching.

## Step 2 — Register resources (only for new studios)

In `studio-resources.mjs`:
- `resources`: `['NamePrefix', website, careersUrl, linkedinSlug, optionalBoard]`
  where board is e.g. `greenhouse:<name>`, `lever:<name>`, `smart:<name>`,
  `jobylon:<id>`. The prefix must match the start of the studio name; every
  studio needs an entry or the build fails with `Missing resources`.
- `cities`: `City: [lon, lat, 'CC', 'Continent']` — continent must be one of
  Europe, Asia, North America, South America, Africa, Oceania. The map view
  boxes in `report-template.html` (`const views`) must contain every city's
  projected point; the test `continent views contain every documented site`
  fails otherwise.
- `games` (optional): Steam app IDs for representative released games.

Career posting categories and title-matching rules are maintained in
`career-categories.mjs`. When changing them, use `--refresh` to recollect and
reclassify public listings; `--reparse` reuses cached job research.

## Step 3 — Rebuild

All build modes and update commands generate `index.html` in the project root,
the GitHub Pages entry point. Never introduce a differently named report copy.

- **One-command AI-assisted maintenance:** run `/update-game-studio-map` in
  VS Code Copilot Chat. The workspace prompt requires research of every profile
  and all eight fields, citations, honest unknowns, career taxonomy review,
  full refresh and validation. Web research must be available.
- **One-command non-AI collection:** `node update-all.mjs` crawls public official
  pages for all profiles, saves short unverified evidence and explicit per-field
  gaps to `studio-research.json`, refreshes careers/assets, rebuilds the report
  date, and runs tests. It does NOT verify or replace Markdown studio facts or
  advance their collection dates. Never describe this as complete factual
  maintenance. `--collect-only` gathers evidence without changing the report.
- After AI/human research, add `> **Research sources:**` with raw HTTPS URLs and
  publication dates, and `> **Review note:**` with unresolved fields, below each
  profile's eight fields. The report displays these separately from the
  non-AI evidence. Do not edit the generated evidence cache manually.

- **Every data-maintenance run:** after reviewing all studio facts, run
  `node build-report.mjs --refresh`. This re-parses every profile and refreshes
  all career listings, career categories, map, flags, and artwork. Do not use
  `--reparse` or the cache-only build as a substitute for a full data update.
- **UI-only changes:** `node build-report.mjs` re-renders from the existing
  cache. `--reparse` remains an offline development utility, not the maintenance
  workflow.
- Each successful build records `updatedAt` for the header's
  `Last updated: DD.MM.YYYY`. It is the report update date, not proof of new
  research. Career research keeps its own timestamps; studio collection dates
  remain in the source.

## Step 4 — Validate

1. `node --test` must pass.
2. When adding/removing studios, update hardcoded counts in `report.test.mjs`
   (profile count, site count, flag count) and in the template's
   `meth.what.p` texts (both languages in `translations`).
3. New category labels (genres, engines, investors, stability, groups) are
   English canonical values from `build-report.mjs`; add their German
   translations to `valueNamesDe` in `report-template.html`, and new UI strings
   to BOTH `translations.en` and `translations.de` there.
4. Spot-check in a browser: open `index.html`, toggle EN/DE in the
   top bar, expand the changed studio's profile, verify the update date and
   career selectors, and toggle legend entries off and on. Legend toggles affect
   the map only; the directory and statistic cards retain the shared filters.

## Do not

- Do not edit `index.html` or `report-data.json` directly.
- Do not translate studio data to German — the source is English; German exists
  only as UI translations in the template.
- Do not rename `game_studios_enzyklop_die.md` without updating `sourceFile`
  in `build-report.mjs` and the URL in `report.test.mjs`.
