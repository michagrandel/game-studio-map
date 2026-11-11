---
name: update-studio-atlas
description: 'Update the Studio Atlas project: add, edit, or remove game studio profiles in game_studios_enzyklop_die.md, register resources in studio-resources.mjs, rebuild game-studio-report.html, and run tests. Use when: adding a studio, updating studio data (project, engine, investor, layoffs), fixing locations, refreshing job listings, or regenerating the report.'
---

# Update Studio Atlas

The project builds a self-contained HTML report (`game-studio-report.html`) from
a Markdown source. Never edit the generated HTML or `report-data.json` by hand —
always change inputs and rebuild.

## Data flow

`game_studios_enzyklop_die.md` (source, English) + `studio-resources.mjs`
(editorial resources) → `node build-report.mjs` parses, categorizes, and injects
data into `report-template.html` → `game-studio-report.html`. `report-data.json`
is the research cache (jobs, map, flags, artwork).

## Step 1 — Edit the source document

One profile per studio in `game_studios_enzyklop_die.md`, under a `## N. Group`
section heading (the heading text becomes the studio's `group`):

```markdown
### Studio Name
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

## Step 3 — Rebuild

- Text-only edits (source changed, no new studio): `node build-report.mjs --reparse`
  — offline, carries over cached job research by studio name.
- New studios or stale job data: `node build-report.mjs --refresh` — needs
  network, re-scrapes job portals, map, flags, and artwork (takes minutes).
- `node build-report.mjs` alone only re-renders from cache; it refuses to run
  when the source changed.

## Step 4 — Validate

1. `node --test` must pass (7 tests).
2. When adding/removing studios, update hardcoded counts in `report.test.mjs`
   (profile count, site count, flag count) and in the template's
   `meth.what.p` texts (both languages in `translations`).
3. New category labels (genres, engines, investors, stability, groups) are
   English canonical values from `build-report.mjs`; add their German
   translations to `valueNamesDe` in `report-template.html`, and new UI strings
   to BOTH `translations.en` and `translations.de` there.
4. Spot-check in a browser: open `game-studio-report.html`, toggle EN/DE in the
   top bar, expand the changed studio's profile.

## Do not

- Do not edit `game-studio-report.html` or `report-data.json` directly.
- Do not translate studio data to German — the source is English; German exists
  only as UI translations in the template.
- Do not rename `game_studios_enzyklop_die.md` without updating `sourceFile`
  in `build-report.mjs` and the URL in `report.test.mjs`.
