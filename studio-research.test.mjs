import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectStudioResearch, officialLinks, pageEvidence, sourceProfiles, studioFields, validateStudioResearch } from './studio-research.mjs';

test('non-AI research covers every profile and every field without changing source values', async () => {
  const source = await readFile(new URL('./game_studios_enzyklop_die.md', import.meta.url), 'utf8');
  const profiles = sourceProfiles(source);
  const before = JSON.stringify(profiles);
  const result = await collectStudioResearch(profiles, async url => ({
    url, body: '<p>Our studio is based in London and developing a new game using Unreal Engine.</p>',
  }));
  validateStudioResearch(result, profiles.map(profile => profile.name));
  assert.equal(result.studios.length, 106);
  assert.equal(JSON.stringify(profiles), before);
  assert.ok(result.studios.every(studio => Object.keys(studio.fields).length === 8));
  assert.equal(result.complete, false);
});

test('only relevant HTTPS same-origin pages are followed, with a bounded crawl', () => {
  const html = ['https://outside.test/about', 'javascript:alert(1)', '/about', '/games', '/news', '/company', '/press', '/about#team', '/image.png']
    .map(url => `<a href="${url}">Link</a>`).join('');
  assert.deepEqual(officialLinks(html, 'https://studio.test'), [
    'https://studio.test/about', 'https://studio.test/games', 'https://studio.test/news', 'https://studio.test/company',
  ]);
});

test('evidence is short, unverified, field-specific and excludes scripts/navigation', () => {
  const evidence = pageEvidence('<script>Unreal Engine announced</script><nav>Our publisher announced projects</nav><p>Our next game uses Unreal Engine.</p>', 'https://studio.test');
  assert.deepEqual(Object.keys(evidence), studioFields);
  assert.equal(evidence.Engine.length, 1);
  assert.equal(evidence.Publisher.length, 0);
  assert.equal(evidence.Engine[0].verification, 'Unverified text match');
});

test('source failures remain explicit, dates and evidence never imply verification', async () => {
  const profiles = [{ name: 'Test', website: 'https://studio.test' }];
  const result = await collectStudioResearch(profiles, async () => { throw new Error('HTTP 403'); }, '2026-11-11T12:00:00Z');
  validateStudioResearch(result, ['Test']);
  assert.equal(result.studios[0].status, 'Source unavailable');
  assert.match(result.studios[0].errors[0], /HTTP 403/);
  assert.ok(Object.values(result.studios[0].fields).every(field => field.status === 'No evidence collected'));
  result.studios[0].fields.Engine.evidence.push({ url: 'javascript:alert(1)', excerpt: 'bad' });
  assert.throws(() => validateStudioResearch(result, ['Test']), /Invalid evidence/);
});

test('shared websites are fetched once and every profile retains separate coverage', async () => {
  let requests = 0;
  const result = await collectStudioResearch([{ name: 'A', website: 'https://studio.test' }, { name: 'B', website: 'https://studio.test' }], async url => {
    requests++;
    return { url, body: '<p>Our studio is based in London and develops games.</p>' };
  });
  assert.equal(requests, 1);
  assert.deepEqual(result.studios.map(studio => studio.name), ['A', 'B']);
});

test('AI full-refresh prompt requests all fields, honest gaps and the tested final command', async () => {
  const prompt = await readFile(new URL('./.github/prompts/update-game-studio-map.prompt.md', import.meta.url), 'utf8');
  assert.match(prompt, /^---\r?\ndescription: ".+"\r?\nagent: "agent"\r?\n---/);
  assert.match(prompt, /EVERY studio/);
  assert.match(prompt, /all eight source fields/);
  assert.match(prompt, /Run `node update-all.mjs`/);
  assert.match(prompt, /rebuilds `index\.html`/);
  assert.match(prompt, /web research is unavailable, stop/);
});
