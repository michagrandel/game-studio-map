import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { collectStudioResearch, sourceProfiles, validateStudioResearch } from './studio-research.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => !['--help', '--collect-only'].includes(arg))) throw new Error('Usage: node update-all.mjs [--collect-only | --help]');

async function request(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'GameStudioMap/1.0 (public studio research)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Not an HTML page');
  return { body: await response.text(), url: response.url };
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`node ${args.join(' ')} failed (${signal || code})`)));
  });
}

async function update() {
  const source = await readFile(join(root, 'game_studios_enzyklop_die.md'), 'utf8');
  const profiles = sourceProfiles(source);
  if (!profiles.length) throw new Error('No studio profiles found');
  console.log(`Collecting official-site evidence for all ${profiles.length} profiles and all eight fields (no AI).`);
  const research = await collectStudioResearch(profiles, request);
  validateStudioResearch(research, profiles.map(profile => profile.name));
  const target = join(root, 'studio-research.json');
  const temporary = `${target}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(research, null, 2));
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  for (const studio of research.studios) {
    for (const error of studio.errors) console.warn(`${studio.name}: ${error}`);
  }
  const fieldsWithEvidence = research.studios.flatMap(studio => Object.values(studio.fields)).filter(field => field.evidence.length).length;
  console.log(`Collected evidence for ${fieldsWithEvidence}/${profiles.length * 8} fields. All studio facts still require review; source values and collection dates are unchanged.`);
  if (!args.includes('--collect-only')) {
    await runNode(['build-report.mjs', '--refresh']);
    await runNode(['--test']);
    console.log('Career refresh and index.html rebuild complete; Last updated reflects this build. Studio evidence/gaps are shown in profile details.');
  }
}

if (args.includes('--help')) {
  console.log('node update-all.mjs: collect non-AI studio evidence, refresh all careers/assets, rebuild index.html and Last updated, run tests.\nnode update-all.mjs --collect-only: collect evidence without rebuilding.\nAI-assisted full research: run /update-game-studio-map in VS Code Copilot Chat.');
} else {
  await update();
}
