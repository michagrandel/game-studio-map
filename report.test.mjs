import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const source = await readFile(new URL('./game_studios_enzyklop_die.md', import.meta.url), 'utf8');
const html = await readFile(new URL('./game-studio-report.html', import.meta.url), 'utf8');
const data = JSON.parse(html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const clean = value => value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, label) => label || name).replace(/\*/g, '').trim();

test('all source profiles and all original fields are preserved exactly', () => {
  const blocks = [...source.matchAll(/^### (.+)\r?\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)];
  assert.equal(blocks.length, 106);
  assert.equal(data.studios.length, blocks.length);
  for (const [, name, body] of blocks) {
    const studio = data.studios.find(studio => studio.name === name.trim());
    assert.ok(studio, `Missing profile: ${name}`);
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

test('every profile has source-labeled careers, safe links and all four role categories', () => {
  const categories = ['Technical Art', 'Technical Animation', 'Art', 'Tools Engineering'];
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
