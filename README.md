# Game Studio Map

An interactive, offline-capable atlas of the world's major game studios. The
English Markdown encyclopedia [game_studios_enzyklop_die.md](game_studios_enzyklop_die.md)
is compiled into a self-contained HTML page ([game-studio-report.html](game-studio-report.html))
— with a world map, filter panel, studio profiles, researched job listings, and
Steam artwork, all without a server or external runtime resources.

<p style="text-align:center"><img src="./preview/screenshot.png" width="650"></p>

## Report contents

- **106 studio profiles** across 20+ publisher groups (PlayStation, Xbox, EA,
  Ubisoft, Embracer, THQ Nordic, Tencent, Rockstar, Take-Two, Nintendo, Valve,
  CD Projekt Red, Larian, Kojima, Remedy, and many more) plus indie studios
- **117 locations** with coordinates, country flags, and an interactive world
  map (Natural Earth data, zoomable and pannable)
- Per studio: engine, current project, franchise, genre, publisher,
  investor/parent company, and an assessment of future outlook & layoffs
- **Career research:** open positions from public job portals (Greenhouse,
  Lever, SmartRecruiters, Jobylon, careers pages), categorized into Technical
  Art, Technical Animation, Art, and Tools Engineering
- Filters by group, continent, engine, genre, investor, and stability
- **Language switch (EN/DE)** in the top bar; the UI language is persisted in
  `localStorage`. Studio profile data itself is in English (the source
  document's language)

## Quick start

Open the finished report by double-clicking `game-studio-report.html`.

## Project structure

| File | Purpose |
|---|---|
| `game_studios_enzyklop_die.md` | Source data: Obsidian-style Markdown with one `###` profile and 8 fields per studio |
| `studio-resources.mjs` | Editorial resources: websites, career links, LinkedIn slugs, job boards, city coordinates, location overrides, Steam app IDs |
| `build-report.mjs` | Build script: parses the source, researches job listings, downloads map/flags/artwork, and generates the report |
| `report-template.html` | HTML template (dark mode, EN/DE switch); the data is injected into the `/*__REPORT_DATA__*/` placeholder |
| `report-data.json` | Cache of the research results (jobs, map, flags, artwork) |
| `game-studio-report.html` | Generated, self-contained report — open directly in a browser |
| `report.test.mjs` | Tests (node:test) validating the report's fidelity to the source, coordinates, and links |
| `studios.md` | Original task brief for the encyclopedia (German) |
| `.agents/skills/update-studio-atlas/` | Agent skill guiding the data-maintenance workflow (see below) |

## Requirements

- Node.js ≥ 18 (ESM, top-level await, `fetch`)
- No npm dependencies — no `npm install` needed
- Network access only for the refresh step (job portals, Natural Earth,
  flagcdn.com, Steam artwork)

## Rebuild and Tests

Rebuild the report from the cache (fast, offline):

```powershell
node build-report.mjs
```

Rebuild after text-only changes to the source (re-parses profiles, keeps the
cached job research — no network needed):

```powershell
node build-report.mjs --reparse
```

Full re-research including job listings, map, flags, and artwork (takes a few
minutes, requires network):

```powershell
node build-report.mjs --refresh
```

Run the tests:

```powershell
node --test
```

## Maintaining the data

> **Tip for agent users:** this repository ships the agent skill
> [`update-studio-atlas`](.agents/skills/update-studio-atlas/SKILL.md)
> (`.agents/skills/`). It guides an AI agent through the whole maintenance
> workflow — profile format, resource registration, rebuild mode selection,
> and validation. Invoke it as `/update-studio-atlas` or just ask to add or
> update a studio; the skill loads automatically.

- **New studio / changed data:** edit the profile in
  `game_studios_enzyklop_die.md` (maintain all 8 fields: Location, Engine,
  Current Project, Franchise, Genre, Publisher, Investor/Parent Company,
  Future Outlook & Layoffs), add a `resources` entry with website, careers
  link, and LinkedIn slug in `studio-resources.mjs`, and register new cities
  in `cities` with coordinates. Then run `--reparse` (text changes) or
  `--refresh` (new studios needing job research).
- **Source/cache mismatch:** the build script detects divergence between
  source and cache and asks for `--reparse` or `--refresh`.
- Studios with multiple sites are listed as one profile per site; deviations
  from the default location detection are controlled via `locationOverrides`.
