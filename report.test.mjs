import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, runInNewContext } from 'node:vm';
import { careerCategories, careerCategoryNamesDe, classifyCareerTitle, isCareerJobTitle } from './career-categories.mjs';
import { validateStudioResearch } from './studio-research.mjs';

const source = await readFile(new URL('./game_studios_enzyklop_die.md', import.meta.url), 'utf8');
const html = await readFile(new URL('./game-studio-report.html', import.meta.url), 'utf8');
const data = JSON.parse(html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const clean = value => value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, label) => label || name).replace(/\*/g, '').trim();

test('Game Studio Map branding and adjacent GitHub navigation link are present', () => {
  assert.match(html, /<title>Game Studio Map — Game Studios & Careers<\/title>/);
  assert.match(html, /GAME STUDIO MAP <span class="pill">INDUSTRY EXPLORER/);
  assert.match(html, /data-i18n="nav.data">Data & sources<\/a><a href="https:\/\/github.com\/michagrandel\/game-studio-map" target="_blank" rel="noopener noreferrer">GitHub<\/a>/);
  assert.doesNotMatch(html, /Studio Atlas|STUDIO ATLAS/);
  assert.match(html, /'footer.brand':'GAME STUDIO MAP \/ Dokumentbasierter Branchenatlas'/);
});

test('studio dates and collected evidence survive the report build without implying verification', async () => {
  const research = JSON.parse(await readFile(new URL('./studio-research.json', import.meta.url), 'utf8'));
  validateStudioResearch(research, data.studios.map(studio => studio.name));
  for (const [index, studio] of data.studios.entries()) {
    assert.deepEqual(studio.factsResearch, research.studios[index], studio.name);
    const block = source.split(/^### /m).slice(1).find(block => block.split(/\r?\n/)[0].trim() === studio.name);
    assert.equal(studio.collectedAt, block.match(/^> \*\*Data collected:\*\* (.+)$/m)[1].trim());
    assert.ok(Array.isArray(studio.factSources));
    assert.equal(typeof studio.reviewNote, 'string');
  }
  assert.ok(Date.parse(data.updatedAt) >= Date.parse(research.checkedAt));
  assert.match(html, /<\/dl>\$\{renderStudioEvidence\(studio\)\}/);
  assert.match(html, /Non-AI text extraction, not verified facts/);
  assert.match(html, /Textextraktion ohne KI, keine verifizierten Fakten/);
});

test('all source profiles and all original fields are preserved exactly', () => {
  const blocks = [...source.matchAll(/^### (.+)\r?\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)];
  assert.equal(blocks.length, 106);
  assert.equal(data.studios.length, blocks.length);
  for (const [, name, body] of blocks) {
    const studio = data.studios.find(studio => studio.name === name.trim());
    assert.ok(studio, `Missing profile: ${name}`);
    const dates = [...body.matchAll(/^> \*\*Data collected:\*\* (.+)$/gm)];
    assert.equal(dates.length, 1, `${name} must have one data-collected date`);
    assert.match(dates[0][1], /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(dates[0][1]).toISOString().slice(0, 10), dates[0][1], name);
    const fields = Object.fromEntries([...body.matchAll(/^\* \*\*(.+?):\*\* (.+)$/gm)].map(([, key, value]) => [key, clean(value)]));
    assert.equal(Object.keys(fields).length, 8, name);
    assert.deepEqual(studio.fields, fields, name);
  }
  assert.equal(data.sourceText, source);
});

test('every documented location has valid coordinates and an embedded country flag', () => {
  const sites = data.studios.flatMap(studio => studio.sites);
  assert.equal(sites.length, 117);
  for (const site of sites) {
    assert.ok(site.lon >= -180 && site.lon <= 180, site.city);
    assert.ok(site.lat >= -90 && site.lat <= 90, site.city);
    assert.match(data.flags[site.country], /^data:image\/png;base64,/);
    assert.ok(site.continent);
  }
  assert.equal(Object.keys(data.flags).length, 23);
});

test('every profile has source-labeled careers and categories from the shared taxonomy', () => {
  const categories = careerCategories;
  assert.deepEqual(data.careerCategories, categories);
  for (const studio of data.studios) {
    for (const key of ['website', 'linkedin', 'careers']) assert.match(studio[key], /^https:\/\//);
    const research = studio.research;
    assert.ok(Number.isFinite(Date.parse(research.checkedAt)), studio.name);
    assert.match(research.source, /^https:\/\//);
    if (!research.complete && !research.jobs.length) assert.notEqual(research.status, 'No matching portal results');
    if (research.status === 'Positions found') assert.ok(research.jobs.length);
    const jobs = [...research.jobs, ...research.otherJobs];
    for (const job of jobs) {
      assert.match(job.url, /^https:\/\//);
      assert.ok(categories.includes(job.category), job.title);
      assert.ok(job.title.length && job.location.length, studio.name);
      assert.doesNotMatch(job.url, /\/category\/|[{}]/);
      assert.doesNotMatch(job.title, /open application|candidature libre|candidature ouverte/i);
    }
    assert.equal(new Set(research.jobs.map(job => job.url)).size, research.jobs.length, studio.name);
  }
  const larian = data.studios.find(studio => studio.name === 'Larian Studios (Gent)');
  assert.ok(larian.research.jobs.every(job => /gent|ghent/i.test(job.location)), 'Non-Gent vacancies must not be attributed to Gent');
  assert.ok(larian.research.otherJobs.length > 0, 'Other studio locations should remain available in details');
});

test('career title classification covers common studio disciplines', () => {
  assert.ok(careerCategories.length > 30);
  assert.deepEqual(Object.keys(careerCategoryNamesDe).sort(), [...careerCategories].sort());
  const examples = {
    'Gameplay Engineer': 'Gameplay Engineering',
    'Software Engineer': 'Software Engineering',
    'Senior Platform Engineer': 'Software Engineering',
    'Cloud Developer': 'Software Engineering',
    'AI Programmer': 'AI & Machine Learning',
    'Graphics Programmer': 'Graphics & Rendering Engineering',
    'Network Programmer': 'Network & Multiplayer Engineering',
    'Physics Programmer': 'Physics Engineering',
    'Engine Programmer': 'Engine Engineering',
    'Technical Director': 'Technical Direction',
    'Technical Designer': 'Technical Design',
    'Project Manager': 'Project Management',
    'Game Designer': 'Game Design',
    'Systems Designer': 'Systems Design',
    'Game Design Intern': 'Game Design',
    'Level Design Intern': 'Level Design',
    'Release Manager': 'Build & Release Engineering',
    'Programmeur.euse Animation': 'Technical Animation',
    'Environment Artist': 'Environment Art',
    'Character Artist': 'Character Art',
    'VFX Artist': 'VFX Art',
    'Marketing Manager': 'Marketing',
    'Producer': 'Production',
    'QA Tester': 'Quality Assurance & Playtesting',
    'Playtester': 'Quality Assurance & Playtesting',
    'Localization Manager': 'Localization',
    'Community Manager': 'Community Management',
    'Studio Accountant': 'Business Operations',
    'Studio Coordinator': 'Other',
  };
  for (const [title, expected] of Object.entries(examples)) {
    assert.equal(classifyCareerTitle(title), expected, title);
    assert.ok(isCareerJobTitle(title), title);
  }
  for (const title of ['', 'FAQ', 'id Software', 'Career Site Cookie Settings']) assert.equal(isCareerJobTitle(title), false, title);
});

test('map and thumbnails are embedded with no runtime CDN dependencies', () => {
  assert.equal(data.geography.type, 'FeatureCollection');
  assert.ok(data.geography.features.length >= 170);
  const images = Object.values(data.artwork).filter(art => art.src);
  assert.ok(images.length > 60);
  for (const image of images) assert.match(image.src, /^data:image\/[^;]+;base64,/);
  assert.doesNotMatch(html, /<(?:script|img|iframe)\b[^>]*\bsrc=["']https?:/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /@import|url\(["']?https?:/i);
});

test('facets include Open World and explicitly documented minority investors', () => {
  const larian = data.studios.find(studio => studio.name === 'Larian Studios (Gent)');
  const ubisoft = data.studios.find(studio => studio.name === 'Ubisoft Montreal');
  const rockstar = data.studios.find(studio => studio.name === 'Rockstar San Diego');
  assert.ok(larian.investors.includes('Tencent'));
  assert.ok(larian.investors.includes('Independent / private'));
  assert.ok(ubisoft.investors.includes('Tencent'));
  assert.ok(ubisoft.investors.includes('Ubisoft'));
  assert.ok(rockstar.genres.includes('Open World'));
  assert.equal(larian.stability, 'Stable per Document');
  assert.equal(data.studios.find(studio => studio.name === 'Naughty Dog').stability, 'Stable per Document');
});

test('the self-contained application script has valid JavaScript syntax', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  new Script(scripts[1][1]);
  assert.match(html, /AI-collected information — not independently verified/);
  assert.match(html, /Mit KI erfasste Informationen — nicht unabhängig verifiziert/);
  assert.match(html, /AI-collected information; not independently verified/);
  assert.match(html, /Mit KI erfasste Informationen; nicht unabhängig verifiziert/);
  assert.doesNotMatch(html, /Assessments from the source document; no current financial or job guarantee|Einschätzungen aus dem Ausgangsdokument, keine aktuelle Finanz- oder Arbeitsplatzgarantie/);
  assert.doesNotMatch(html, /based on the Game Studios Encyclopedia|basierend auf der Game Studios Enzyklopädie/);
  assert.doesNotMatch(html, /Game development · global overview|Discover studios\.|Find perspectives\.|An interactive guide through publisher networks|snapshot-date/);
  assert.match(html, /<select id="map-career"><option value="" data-i18n="map\.career\.all">All<\/option>/);
  assert.match(html, /const categories = DATA\.careerCategories/);
  assert.match(html, /job-category-options/);
  assert.match(html, /map-career-options/);
  assert.match(html, /'map\.career':'Career'/);
  assert.match(html, /'map\.career':'Berufsfeld'/);
  assert.match(html, /\$\('map-career'\)\.addEventListener\('change'/);
  assert.match(html, /\$\('map-career'\)\.value = categories\.includes\(\$\('jobs'\)\.value\)/);
  assert.match(html, /\.filter\(job=>!categories\.includes\(selectedCareer\) \|\| job\.category===selectedCareer\)/);
  assert.doesNotMatch(html, /Read with a critical eye|Projects, owners, and security assessments come unchanged from an undated document/);
  assert.match(html, /Continent buttons zoom the map and apply the same continent filter to the directory/);
  assert.match(html, /function applyMapView\(view\)/);
  assert.ok(html.includes('lang="en"'));
  assert.ok(html.includes('prefers-reduced-motion'));
});

test('continent views contain every documented site and geographic extremities', () => {
  const views = JSON.parse(html.match(/const views = (\{[^;]+\});/)[1].replace(/(\w+):/g, '"$1":'));
  const names = { Europe: 'europe', Asia: 'asia', 'North America': 'northamerica', Oceania: 'oceania' };
  const inside = (name, lon, lat) => {
    const [x, y, width, height] = views[name];
    const px = (lon + 180) * 1200 / 360, py = (90 - lat) * 600 / 180;
    assert.ok(px >= x && px <= x + width && py >= y && py <= y + height, `${name}: ${lon}, ${lat}`);
  };
  for (const site of data.studios.flatMap(studio => studio.sites)) inside(names[site.continent], site.lon, site.lat);
  inside('europe', -8, 37);
  inside('europe', 25.8, 71.2);
  inside('asia', 103.82, 1.352);
  inside('asia', 115.2, -8.6);
  inside('southamerica', -68, -55);
  inside('africa', 18.4, -33.9);
  inside('oceania', 168.3, -46.4);
  inside('northamerica', -79.5, 9);
});

test('report update metadata and general career controls replace the Technical Art shortcut', () => {
  assert.ok(Number.isFinite(Date.parse(data.updatedAt)));
  assert.ok(Date.parse(data.updatedAt) >= Date.parse(data.generatedAt));
  assert.match(html, /INDUSTRY EXPLORER<\/span><span class="last-updated" id="last-updated">/);
  assert.match(html, /Last updated: \{date\}/);
  assert.match(html, /Intl\.DateTimeFormat\('de-DE',\{day:'2-digit',month:'2-digit',year:'numeric'\}\)/);
  assert.match(html, /id="stat-hiring"/);
  assert.doesNotMatch(html, /tech-preset|stat-tech|stats\.tech|map\.tech/);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /\*\{box-sizing:border-box\}body\{margin:0;background:var\(--bg\)/);
  assert.match(css, /\.app\{display:grid;grid-template-columns:258px minmax\(0,1fr\)/);
});

test('legend toggles retain hidden entries, affect only map studios, and are isolated per color mode', () => {
  const app = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)][1][1];
  const functionText = name => {
    const start = app.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const end = app.indexOf('\nfunction ', start + 1);
    return app.slice(start, end);
  };
  const controls = { 'color-mode': { value: 'genre' }, legend: { innerHTML: '', querySelectorAll: () => [] } };
  const studios = [{ id: 'a', genre: 'RPG', engine: 'Unreal' }, { id: 'b', genre: 'Shooter', engine: 'Unity' }];
  const context = {
    visibleStudios: studios,
    hiddenLegendKeys: new Map(),
    $: id => controls[id],
    colorKey: studio => studio[controls['color-mode'].value],
    colorFor: () => '#fff',
    escapeHtml: value => value,
    tv: value => value,
    t: value => value,
    closeProfile() {},
    updateMap() {},
  };
  runInNewContext([functionText('mapStudios'), functionText('toggleLegend'), functionText('renderLegend')].join('\n'), context);
  const ids = () => Array.from(context.mapStudios(), studio => studio.id);
  assert.deepEqual(ids(), ['a', 'b']);
  context.toggleLegend('RPG');
  assert.deepEqual(ids(), ['b']);
  assert.equal(studios.length, 2, 'Directory selection must not be modified');
  context.renderLegend();
  assert.match(controls.legend.innerHTML, /data-legend-key="RPG" aria-pressed="false"/);
  context.toggleLegend('Shooter');
  assert.deepEqual(ids(), []);
  controls['color-mode'].value = 'engine';
  assert.deepEqual(ids(), ['a', 'b']);
  context.toggleLegend('Unity');
  assert.deepEqual(ids(), ['a']);
  controls['color-mode'].value = 'genre';
  context.toggleLegend('RPG');
  assert.deepEqual(ids(), ['a']);
  context.hiddenLegendKeys.clear();
  assert.deepEqual(ids(), ['a', 'b']);
});
