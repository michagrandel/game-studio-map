import { readFile, writeFile } from 'node:fs/promises';
import { resources, cities, locationOverrides, games } from './studio-resources.mjs';
import { careerCategories, careerCategoryNamesDe, classifyCareerTitle, isCareerJobTitle } from './career-categories.mjs';
import { assertStudioAllowed, validateStudioResearch } from './studio-research.mjs';

const sourceFile = 'game_studios_enzyklop_die.md';
const cacheFile = 'report-data.json';
const refresh = process.argv.includes('--refresh');
const reparse = process.argv.includes('--reparse');
const clean = text => text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, name, label) => label || name).replace(/\*/g, '').trim();
const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const source = await readFile(sourceFile, 'utf8');

function parseStudios() {
  let group = '';
  const studios = [];
  for (const section of source.split(/(?=^## )/m)) {
    group = section.match(/^## (.+)/m)?.[1] || group;
    for (const block of section.split(/^### /m).slice(1)) {
      const [name] = block.split(/\r?\n/);
      const fields = Object.fromEntries([...block.matchAll(/^\* \*\*(.+?):\*\* (.+)$/gm)].map(([, key, value]) => [key, clean(value)]));
      const studio = createStudio(name.trim(), group, fields, studios.length);
      studio.collectedAt = block.match(/^> \*\*Data collected:\*\* (\d{4}-\d{2}-\d{2})/m)?.[1];
      studio.factSources = [...block.matchAll(/^> \*\*Research sources:\*\* (.+)$/gm)]
        .flatMap(([, text]) => [...text.matchAll(/https:\/\/[^\s<>")\]]+/g)].map(match => match[0]));
      studio.reviewNote = block.match(/^> \*\*Review note:\*\* (.+)$/m)?.[1] || '';
      studios.push(studio);
    }
  }
  return studios;
}

function createStudio(name, group, fields, index) {
  assertStudioAllowed(name);
  const resource = resources.find(([prefix]) => name.startsWith(prefix));
  if (!resource) throw new Error(`Missing resources: ${name}`);
  const location = fields.Location;
  const names = locationOverrides[name] || [Object.keys(cities).find(city => location.startsWith(city)) || ''];
  if (names.some(city => !cities[city])) throw new Error(`Unmapped location: ${name}: ${location}`);
  const sites = names.map(city => {
    const [lon, lat, country, continent] = cities[city];
    return { city, lon, lat, country, continent, approximate: city === 'Indiana' };
  });
  return {
    id: `studio-${index + 1}`, name, group: group.replace(/^\d+\.\s*/, ''), fields, sites,
    engine: engineCategories(fields.Engine), genres: genreCategories(fields.Genre),
    investor: investorCategory(fields['Investor/Parent Company']),
    stability: stabilityCategory(name, fields['Future Outlook & Layoffs']),
    website: resource[1], careers: resource[2], linkedin: `https://www.linkedin.com/company/${resource[3]}/`,
    board: resource[4] || '', linkedinVerified: false,
    artwork: games.filter(([title]) => normalize(`${fields.Franchise} ${fields['Current Project']}`).includes(normalize(title))).slice(0, 3).map(([title, app, label]) => ({ title: label || title, app })),
  };
}

function engineCategories(text) {
  const families = [
    [/unreal/i, 'Unreal Engine'], [/unity/i, 'Unity'], [/frostbite/i, 'Frostbite'],
    [/decima/i, 'Decima'], [/rage engine/i, 'RAGE'], [/anvil/i, 'Anvil'],
    [/snowdrop/i, 'Snowdrop'], [/source/i, 'Source'], [/id tech/i, 'id Tech'],
    [/creation/i, 'Creation'], [/northlight/i, 'Northlight'], [/RE Engine/i, 'RE Engine'],
    [/forzatech/i, 'ForzaTech'], [/divinity/i, 'Divinity'], [/stingray/i, 'Stingray'],
    [/luminous/i, 'Luminous'],
  ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return families.length ? families : [/diverse|various|unknown/i.test(text) ? 'Various / unknown' : 'Proprietary / in-house'];
}

function genreCategories(text) {
  const categories = [
    [/open[- ]world/i, 'Open World'],
    [/shooter|battle royale|ego-|first-person/i, 'Shooter'],
    [/rpg|role.?playing/i, 'RPG'], [/action|adventure|stealth|thriller|cinematic/i, 'Action / Adventure'],
    [/strateg|tactic|build|aufbau/i, 'Strategy / Building'], [/racing/i, 'Racing'],
    [/sport|skateboarding/i, 'Sport'], [/simulation/i, 'Simulation'],
    [/sandbox|survival/i, 'Sandbox / Survival'], [/rogue/i, 'Roguelike'],
    [/jump|platform|metroidvania/i, 'Platformer / Metroidvania'],
    [/moba/i, 'MOBA'], [/mobile|match-3/i, 'Mobile / Puzzle'],
    [/technolog|porting|engine development|middleware|network/i, 'Technology / Tools'],
    [/horror/i, 'Horror'], [/fighting|beat.?em.?up/i, 'Fighting'], [/music|rhythm/i, 'Music'],
  ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return categories.length ? categories : ['Various'];
}

function investorCategory(text) {
  for (const [pattern, category] of [
    [/sony/i, 'Sony'], [/microsoft/i, 'Microsoft'], [/^ea\b/i, 'Electronic Arts'],
    [/ubisoft/i, 'Ubisoft'], [/embracer/i, 'Embracer'], [/take-two/i, 'Take-Two'],
    [/independent|private/i, 'Independent / private'], [/tencent/i, 'Tencent'],
  ]) if (pattern.test(text)) return category;
  return text.replace(/\s*\(.*\)/, '');
}

function stabilityCategory(name, text) {
  const riskText = text.replace(/no(?:\s+\S+){0,3}\s+layoffs|without\s+layoff/gi, '').replace(/\bindependent\b/gi, 'standalone');
  if (/Bungie|Ubisoft Kyiv/.test(name) || /massive layoffs|under severe pressure|future.*uncertain|(severely|significantly|massively)\s+(downsized|reduced)|extreme conditions|flops/i.test(text)) return 'Elevated Risk';
  if (/layoff|restructur|overhaul|upheaval|pressure|risk|burden of proof|dependent|downsized|reduced|moderate|medium|streamlined|observation|project halts|strained|project cancellation|uncertain|job cuts|burden|transition/i.test(riskText)) return 'In Transition / Mixed';
  if (/stable|secur|safe|solid|profitable|healthy|successful|crisis-pro|reliable|crisis|strong|self-fund|self-fina|excellent|financially.*independent/i.test(text)) return 'Stable per Document';
  return 'Unclear';
}

function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function textContent(html) {
  return decode(html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function request(url, binary = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'GameStudioMapReport/1.0 (public career research)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return { body: binary ? Buffer.from(await response.arrayBuffer()) : await response.text(), url: response.url, type: response.headers.get('content-type') };
}

const requests = new Map();
function cachedRequest(url) {
  if (!requests.has(url)) requests.set(url, request(url));
  return requests.get(url);
}

async function pool(items, action, concurrency = 6) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) await action(items[index++]);
  }));
}

function isGeneralApplication(title) {
  return /open application|spontaneous|expression of interest|talent pool|initiativbewerbung|candidature (libre|ouverte)|unsolicited/i.test(title);
}

function isCareerNavigation(title) {
  return /^(?:(?:all|view|see|browse|explore|our)\s+)?(?:jobs?|careers?|open positions|career opportunities|job openings|join our team|meet the team)$/i.test(title.trim());
}

function extractJobs(html, base) {
  const jobs = [];
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const title = textContent(match[4]) || decode(`${match[1]} ${match[3]}`.match(/(?:aria-label|title)=["']([^"']+)/i)?.[1] || '');
    if (title.length > 180 || !isCareerJobTitle(title) || isCareerNavigation(title) || isGeneralApplication(title) || !/job|career|position|vacanc|recruit|lever\.co|greenhouse|workday|teamtailor/i.test(match[2])) continue;
    const url = new URL(decode(match[2]), base).href;
    if (/\/category\/|\/departments\/|[{}]|#/.test(url) || url.replace(/\/$/,'') === base.replace(/\/$/,'')) continue;
    if (/^https?:/.test(url) && !/^(view|see|explore|all|our|meet|learn|read)\b/i.test(title)) {
      jobs.push({ title: title.replace(/\s+View details$/i,''), url, location: 'Check posting for location', category: classifyCareerTitle(title) });
    }
  }
  return jobs;
}

async function boardJobs(board) {
  const [kind, name] = board.split(':');
  if (kind === 'greenhouse') {
    const { body } = await cachedRequest(`https://boards-api.greenhouse.io/v1/boards/${name}/jobs`);
    const data = JSON.parse(body);
    if (!Array.isArray(data.jobs)) throw new Error(`Invalid Greenhouse response: ${name}`);
    return data.jobs.map(job => ({ title: job.title, url: job.absolute_url, location: job.location.name, studio: (job.metadata || []).filter(item => /Career Page - (Department|Studio Project)/.test(item.name)).map(item => item.value).filter(Boolean).join(' ') }));
  }
  if (kind === 'lever') {
    const { body } = await cachedRequest(`https://api.lever.co/v0/postings/${name}?mode=json`);
    const data = JSON.parse(body);
    if (!Array.isArray(data)) throw new Error(`Invalid Lever response: ${name}`);
    return data.map(job => ({ title: job.text, url: job.hostedUrl, location: job.categories.location || '' }));
  }
  if (kind === 'smart') {
    const jobs = [];
    for (let offset = 0; ; offset += 100) {
      const { body } = await cachedRequest(`https://api.smartrecruiters.com/v1/companies/${name}/postings?limit=100&offset=${offset}`);
      const data = JSON.parse(body);
      if (!Array.isArray(data.content)) throw new Error(`Invalid SmartRecruiters response: ${name}`);
      jobs.push(...data.content.map(job => ({ title: job.name, url: `https://jobs.smartrecruiters.com/${name}/${job.id}`, location: [job.location?.city, job.location?.country].filter(Boolean).join(', ') })));
      if (jobs.length >= data.totalFound || data.content.length === 0) return jobs;
      if (offset > 10000) throw new Error(`Pagination limit: ${name}`);
    }
  }
  if (kind === 'jobylon') {
    const { body } = await cachedRequest(`https://cdn.jobylon.com/jobs/companies/${name}/embed/v2/?page_size=1000`);
    const jobsBlock = body.split("JBL.embed_v2['jobs'] = [")[1]?.split('</script>')[0];
    if (!jobsBlock) throw new Error(`Missing Jobylon listing: ${name}`);
    const unescape = value => decode(value.replace(/\\u([a-f0-9]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/\\'/g, "'"));
    const jobs = [...jobsBlock.matchAll(/id: '(\d+)'[\s\S]*?url: '((?:\\.|[^'])*)'[\s\S]*?title: '((?:\\.|[^'])*)'[\s\S]*?locations_text: '((?:\\.|[^'])*)'/g)].map(([, , path, title, location]) => ({ title: unescape(title), url: `https://emp.jobylon.com${unescape(path)}`, location: unescape(location) }));
    if (jobs.length !== [...jobsBlock.matchAll(/^\s+id: '\d+'/gm)].length) throw new Error(`Incomplete Jobylon parsing: ${name}`);
    return jobs;
  }
  if (kind === 'guerrilla') {
    const jobs = [];
    for (let from = 0; ; from += 100) {
      const { body } = await cachedRequest(`https://www.guerrilla-games.com/api/greenhouse/jobs?query=GreenhousePostingsSearch&size=100&from=${from}`);
      const data = JSON.parse(body);
      if (!Array.isArray(data.items)) throw new Error('Invalid Guerrilla job feed');
      jobs.push(...data.items.flatMap(html => extractJobs(html, 'https://www.guerrilla-games.com')).map(job => ({ ...job, location: 'Amsterdam' })));
      if (from + data.size >= data.totalItems) return jobs;
      if (!data.size || from > 10000) throw new Error('Invalid Guerrilla pagination');
    }
  }
  throw new Error(`Unsupported board: ${board}`);
}

const cityAliases = {
  Warsaw: ['warsaw', 'warszawa'], Ghent: ['ghent', 'gent'], Kyiv: ['kyiv', 'kiev'],
  Copenhagen: ['copenhagen'], Milan: ['milan'], Vienna: ['vienna'], Brno: ['brno'],
  Singapore: ['singapore'], 'Quebec City': ['quebec', 'québec'], 'Tokyo': ['tokyo', 'tokio'],
};

function matchesSite(job, studio) {
  const location = normalize(job.location);
  return studio.sites.some(site => [site.city, ...(cityAliases[site.city] || [])].some(city => location.includes(normalize(city))));
}

function discoverBoard(html) {
  const jobylon = html.match(/jbl_company_id\s*=\s*(\d+)/);
  if (jobylon) return `jobylon:${jobylon[1]}`;
  if (/GreenhousePostingsSearch/.test(html)) return 'guerrilla:guerrilla';
  const greenhouse = html.match(/(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i);
  if (greenhouse && !['embed', 'embedv2'].includes(greenhouse[1])) return `greenhouse:${greenhouse[1]}`;
  const lever = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  return lever ? `lever:${lever[1]}` : '';
}

function findCareerLink(html, base) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/career|join us|jobs|vacanc|karriere|recruit|採用/i.test(`${match[1]} ${textContent(match[2])}`)) continue;
    const url = new URL(decode(match[1]), base).href;
    if (/^https?:/.test(url) && !/linkedin|facebook|twitter/.test(url)) return url;
  }
  return '';
}

async function researchStudio(studio) {
  const checkedAt = new Date().toISOString();
  const errors = [];
  let page;
  try {
    page = await cachedRequest(studio.careers);
    if (new URL(page.url).pathname === '/' && new URL(studio.careers).pathname !== '/') {
      const discovered = findCareerLink(page.body, page.url);
      if (discovered && discovered !== studio.careers) page = await cachedRequest(discovered);
    }
  } catch (error) {
    errors.push(error.message);
    try {
      const home = await cachedRequest(studio.website);
      const discovered = findCareerLink(home.body, home.url);
      if (discovered) page = await cachedRequest(discovered);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (page) {
    if (/teamtailor-cdn/.test(page.body) && !new URL(page.url).pathname.startsWith('/jobs')) {
      try {
        page = await cachedRequest(new URL('/jobs', page.url).href);
      } catch (error) {
        errors.push(error.message);
      }
    }
    studio.careers = page.url;
    const linkedin = page.body.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/[a-z0-9_%.-]+\/?/i)?.[0];
    if (linkedin) { studio.linkedin = linkedin.replace(/^http:/, 'https:'); studio.linkedinVerified = true; }
  }
  const discoveredBoard = page ? discoverBoard(page.body) : '';
  const boards = [...new Set([discoveredBoard, studio.board].filter(Boolean))];
  let jobs = [];
  let otherJobs = [];
  let complete = false;
  let boardSource = '';
  for (const board of boards) {
    try {
      const listings = await boardJobs(board);
      const sharedSony = board === 'greenhouse:sonyinteractiveentertainmentglobal';
      const ownListings = sharedSony ? listings.filter(job => job.studio && normalize(job.studio).includes(normalize(studio.name.replace(/ \(.*\)/,'')))) : listings;
      if (sharedSony && !ownListings.length) throw new Error('Shared PlayStation portal: no unambiguous studio assignment available.');
      const relevant = ownListings.filter(job => isCareerJobTitle(job.title) && !isGeneralApplication(job.title));
      const shared = /Ubisoft|Rockstar|CD Projekt|Mojang|Insomniac|Cloud Chamber|Hangar 13|Larian/.test(studio.name);
      jobs = relevant.filter(job => matchesSite(job, studio) || (!shared && /\bremote\b/i.test(job.location)));
      if (!/Ubisoft/.test(studio.name) && !sharedSony) otherJobs = relevant.filter(job => !jobs.includes(job));
      complete = true;
      const sources = {
        greenhouse: `https://job-boards.greenhouse.io/${board.split(':')[1]}`,
        smart: `https://careers.smartrecruiters.com/${board.split(':')[1]}`,
        lever: `https://jobs.lever.co/${board.split(':')[1]}`,
        jobylon: `https://cdn.jobylon.com/jobs/companies/${board.split(':')[1]}/embed/v2/?page_size=1000`,
        guerrilla: studio.careers,
      };
      boardSource = sources[board.split(':')[0]];
      if (relevant.length && !jobs.length) errors.push('The portal lists positions, but none can be unambiguously assigned to the documented cities.');
      break;
    } catch (error) {
      errors.push(error.message);
    }
  }
  const corporate = /jobs\.zenimax|jobs\.ea|careers\.activision|ubisoft\.com|careers\.playstation/.test(studio.careers);
  if (!complete && page && !corporate) {
    const candidates = extractJobs(page.body, page.url);
    for (const candidate of candidates) {
      try {
        const detail = await cachedRequest(candidate.url);
        const detailUrl = new URL(detail.url);
        if (detailUrl.pathname.replace(/\/$/,'') === new URL(page.url).pathname.replace(/\/$/,'') && !detailUrl.search) {
          errors.push(`Posting led back to the overview: ${candidate.title}`);
          continue;
        }
        let posting;
        for (const match of detail.body.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
          let schema;
          try { schema = JSON.parse(match[1]); } catch (error) { errors.push(`Invalid job metadata at ${candidate.url}: ${error.message}`); continue; }
          const nodes = Array.isArray(schema) ? schema : schema['@graph'] || [schema];
          posting = nodes.find(node => node['@type'] === 'JobPosting') || posting;
        }
        if (posting?.validThrough && new Date(posting.validThrough).getTime() < Date.now()) {
          errors.push(`Expired posting excluded: ${candidate.title}`);
          continue;
        }
        if (posting) {
          const locations = Array.isArray(posting.jobLocation) ? posting.jobLocation : posting.jobLocation ? [posting.jobLocation] : [];
          const location = locations.map(place => place.address?.addressLocality).filter(Boolean).join(', ');
          if (location) candidate.location = location;
        }
        candidate.url = detail.url;
        candidate.verification = posting ? 'Job metadata found' : 'Linked from careers page; posting reachable';
        if (candidate.location !== 'Check posting for location' && !matchesSite(candidate, studio)) otherJobs.push(candidate);
        else jobs.push(candidate);
      } catch (error) {
        errors.push(`Posting not confirmed (${candidate.title}): ${error.message}`);
      }
    }
  }
  const unique = [...new Map(jobs.filter(job => /^https?:/.test(job.url)).map(job => [job.url, { ...job, category: classifyCareerTitle(job.title) }])).values()];
  studio.research = {
    checkedAt, source: boardSource || studio.careers, jobs: unique,
    otherJobs: otherJobs.map(job => ({ ...job, category: classifyCareerTitle(job.title) })),
    status: unique.length ? 'Positions found' : complete ? 'No matching portal results' : page ? 'Not fully verifiable' : 'Source unavailable',
    complete, reachable: Boolean(page || complete), errors,
    scope: complete ? 'Public job portal; assignment based on the documented cities. Remote roles may span locations. No guarantee of complete location coverage.' : 'Public careers page checked; dynamic, protected, or external portals may not be fully captured. Location assignment unconfirmed for directly listed HTML postings. No statement about the absence of open positions.',
  };
  console.log(`${studio.id} ${studio.name}: ${studio.research.status} (${unique.length})`);
}

async function loadArtwork(studios) {
  const artwork = {};
  const apps = [...new Set(studios.flatMap(studio => studio.artwork.map(game => game.app)))];
  await pool(apps, async app => {
    const url = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${app}/capsule_184x69.jpg`;
    try {
      const result = await request(url, true);
      if (!result.type?.startsWith('image/')) throw new Error(`Not an image: ${url}`);
      artwork[app] = { src: `data:${result.type.split(';')[0]};base64,${result.body.toString('base64')}`, source: `https://store.steampowered.com/app/${app}/`, imageUrl: url };
    } catch (error) {
      artwork[app] = { error: error.message, source: `https://store.steampowered.com/app/${app}/` };
      console.error(`Artwork ${app}: ${error.message}`);
    }
  });
  return artwork;
}

async function loadFlags(studios) {
  const flags = {};
  const countries = [...new Set(studios.flatMap(studio => studio.sites.map(site => site.country)))];
  await pool(countries, async code => {
    const result = await request(`https://flagcdn.com/w40/${code.toLowerCase()}.png`, true);
    if (!result.type?.startsWith('image/')) throw new Error(`Not a flag image: ${code}`);
    flags[code] = `data:image/png;base64,${result.body.toString('base64')}`;
  });
  return flags;
}

const legacyStrings = {
  'Stellen gefunden': 'Positions found',
  'Keine passenden Portal-Treffer': 'No matching portal results',
  'Nicht vollständig prüfbar': 'Not fully verifiable',
  'Quelle nicht erreichbar': 'Source unavailable',
  'Öffentliches Stellenportal; Zuordnung über die dokumentierten Städte. Remote-Rollen können standortübergreifend sein. Keine Garantie vollständiger Standortabdeckung.': 'Public job portal; assignment based on the documented cities. Remote roles may span locations. No guarantee of complete location coverage.',
  'Öffentliche Karriereseite geprüft; dynamische, geschützte oder externe Portale möglicherweise nicht vollständig erfasst. Standortzuordnung bei direkt aufgeführten HTML-Inseraten nicht bestätigt. Keine Aussage über das Fehlen offener Stellen.': 'Public careers page checked; dynamic, protected, or external portals may not be fully captured. Location assignment unconfirmed for directly listed HTML postings. No statement about the absence of open positions.',
  'Standort im Inserat prüfen': 'Check posting for location',
  'Stellen-Metadaten gefunden': 'Job metadata found',
  'Von Karriereseite verlinkt; Inserat erreichbar': 'Linked from careers page; posting reachable',
};
const translateLegacy = value => legacyStrings[value] || value;

let data;
if (refresh || reparse) {
  const studios = parseStudios();
  if (studios.length !== [...source.matchAll(/^### /gm)].length) throw new Error('Source coverage mismatch');
  if (reparse) {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    const previous = new Map(cached.studios.map(studio => [studio.name, studio]));
    for (const studio of studios) {
      const before = previous.get(studio.name);
      if (!before?.research) throw new Error(`No cached research for ${studio.name}; run node build-report.mjs --refresh`);
      studio.research = before.research;
      studio.research.status = translateLegacy(studio.research.status);
      studio.research.scope = translateLegacy(studio.research.scope);
      for (const job of [...studio.research.jobs, ...(studio.research.otherJobs || [])]) {
        job.location = translateLegacy(job.location);
        if (job.verification) job.verification = translateLegacy(job.verification);
      }
    }
    data = { ...cached, sourceText: source, studios };
  } else {
    const { body } = await request('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson');
    const geography = JSON.parse(body);
    if (geography.type !== 'FeatureCollection') throw new Error('Invalid map dataset');
    await pool(studios, researchStudio);
    data = { generatedAt: new Date().toISOString(), sourceFile, sourceText: source, careerCategories, careerCategoryNamesDe, studios, geography, artwork: await loadArtwork(studios), flags: await loadFlags(studios) };
  }
} else {
  data = JSON.parse(await readFile(cacheFile, 'utf8'));
  if (data.sourceText !== source) throw new Error('Source changed; regenerate using node build-report.mjs --reparse (text-only) or --refresh (full research)');
}
data.careerCategories = careerCategories;
data.careerCategoryNamesDe = careerCategoryNamesDe;
let factsResearch;
try {
  factsResearch = JSON.parse(await readFile('studio-research.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (factsResearch) validateStudioResearch(factsResearch, data.studios.map(studio => studio.name));
const sourceMetadata = new Map(parseStudios().map(studio => [studio.name, studio]));
data.updatedAt = new Date().toISOString();
for (const [index, studio] of data.studios.entries()) {
  studio.factsResearch = factsResearch?.studios[index];
  const metadata = sourceMetadata.get(studio.name);
  studio.collectedAt = metadata.collectedAt;
  studio.factSources = metadata.factSources;
  studio.reviewNote = metadata.reviewNote;
  studio.genres = genreCategories(studio.fields.Genre);
  studio.engine = engineCategories(studio.fields.Engine);
  studio.investor = investorCategory(studio.fields['Investor/Parent Company']);
  studio.investors = [...new Set([studio.investor, ...(/tencent/i.test(studio.fields['Investor/Parent Company']) ? ['Tencent'] : [])])];
  studio.stability = stabilityCategory(studio.name, studio.fields['Future Outlook & Layoffs']);
}
await writeFile(cacheFile, JSON.stringify(data));
const template = await readFile('report-template.html', 'utf8');
await writeFile('index.html', template.replace('/*__REPORT_DATA__*/', JSON.stringify(data).replace(/</g, '\\u003c')));
console.log(`Built index.html: ${data.studios.length} profiles, ${data.studios.reduce((sum, studio) => sum + studio.sites.length, 0)} locations, ${data.studios.reduce((sum, studio) => sum + studio.research.jobs.length, 0)} job postings.`);
