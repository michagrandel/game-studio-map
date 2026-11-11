import { resources } from './studio-resources.mjs';

export const studioFields = [
  'Location', 'Engine', 'Current Project', 'Franchise', 'Genre', 'Publisher',
  'Investor/Parent Company', 'Future Outlook & Layoffs',
];

export function assertStudioAllowed(name) {
  if (/bio[\s-]*ware/i.test(name)) throw new Error(`Excluded studio: ${name}. BioWare is excluded by editorial request; do not reintroduce it.`);
}

const fieldPatterns = {
  Location: /\b(?:located|based in|headquarters|office|address|studio in)\b/i,
  Engine: /\b(?:unreal|unity|engine|frostbite|decima|northlight|snowdrop)\b/i,
  'Current Project': /\b(?:developing|development|upcoming|announced|working on|next game|new game|project)\b/i,
  Franchise: /\b(?:games|franchise|titles|released|portfolio)\b/i,
  Genre: /\b(?:shooter|role.playing|rpg|strategy|simulation|action|adventure|platformer|racing|puzzle)\b/i,
  Publisher: /\b(?:publisher|published by|publishing)\b/i,
  'Investor/Parent Company': /\b(?:acquired|acquisition|subsidiary|parent company|owned by|investment|investor|part of)\b/i,
  'Future Outlook & Layoffs': /\b(?:layoffs|job cuts|restructuring|closure|closed|redundan|financial|funding)\b/i,
};

export function sourceProfiles(source) {
  return [...source.matchAll(/^### (.+)\r?\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map(([, name, body]) => {
    assertStudioAllowed(name);
    const fields = Object.fromEntries([...body.matchAll(/^\* \*\*(.+?):\*\* (.+)$/gm)].map(([, key, value]) => [key, value.trim()]));
    if (Object.keys(fields).join('|') !== studioFields.join('|')) throw new Error(`Invalid fields: ${name}`);
    const resource = resources.find(([prefix]) => name.trim().startsWith(prefix));
    if (!resource) throw new Error(`Missing resources: ${name}`);
    return { name: name.trim(), fields, website: resource[1] };
  });
}

function plainText(html) {
  return html.replace(/<(script|style|nav|footer)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 30);
}

export function officialLinks(html, pageUrl) {
  const links = [];
  for (const [, href] of html.matchAll(/<a\b[^>]*href=["']([^"'<>]+)["']/gi)) {
    let url;
    try { url = new URL(href.replace(/&amp;/g, '&'), pageUrl); }
    catch { continue; }
    if (url.protocol !== 'https:' || url.origin !== new URL(pageUrl).origin) continue;
    if (!/about|company|studio|games|projects|news|press/i.test(url.pathname)) continue;
    if (/\.(?:pdf|png|jpg|zip)$/i.test(url.pathname)) continue;
    url.hash = '';
    links.push(url.href);
  }
  return [...new Set(links)].filter(url => url !== pageUrl).slice(0, 4);
}

export function pageEvidence(html, url) {
  const lines = plainText(html);
  return Object.fromEntries(studioFields.map(field => [field,
    lines.filter(line => fieldPatterns[field].test(line)).slice(0, 2)
      .map(line => ({ url, excerpt: line.slice(0, 240), verification: 'Unverified text match' })),
  ]));
}

export async function collectStudioResearch(profiles, request, now = new Date().toISOString()) {
  const cache = new Map();
  const fetchPage = url => {
    if (!cache.has(url)) cache.set(url, request(url));
    return cache.get(url);
  };
  const studios = new Array(profiles.length);
  let next = 0;
  async function worker() {
    while (next < profiles.length) {
      const index = next++;
      const profile = profiles[index];
      const result = {
        name: profile.name, checkedAt: now, method: 'Non-AI official-site text extraction',
        status: 'Manual review required', pages: [], errors: [],
        fields: Object.fromEntries(studioFields.map(field => [field, {
          status: 'No evidence collected', evidence: [],
        }])),
      };
      const urls = [profile.website];
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          const page = await fetchPage(url);
          result.pages.push(page.url);
          if (i === 0) urls.push(...officialLinks(page.body, page.url).filter(link => !urls.includes(link)));
          for (const [field, evidence] of Object.entries(pageEvidence(page.body, page.url))) {
            result.fields[field].evidence.push(...evidence);
          }
        } catch (error) {
          result.errors.push(`${url}: ${error.message}`);
        }
      }
      for (const field of Object.values(result.fields)) {
        field.evidence = field.evidence.slice(0, 4);
        if (field.evidence.length) field.status = 'Unverified evidence collected';
      }
      if (!result.pages.length) result.status = 'Source unavailable';
      studios[index] = result;
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, profiles.length) }, worker));
  return { checkedAt: now, complete: false, studios };
}

export function validateStudioResearch(research, names) {
  if (research.complete !== false || !Number.isFinite(Date.parse(research.checkedAt))) throw new Error('Invalid studio research metadata');
  if (!Array.isArray(research.studios) || research.studios.length !== names.length) throw new Error('Studio research coverage mismatch');
  for (const [index, studio] of research.studios.entries()) {
    if (studio.name !== names[index] || !Number.isFinite(Date.parse(studio.checkedAt))) throw new Error(`Invalid studio research: ${names[index]}`);
    if (!['Manual review required', 'Source unavailable'].includes(studio.status) || !Array.isArray(studio.errors)) throw new Error(`Invalid research status: ${studio.name}`);
    if (Object.keys(studio.fields).join('|') !== studioFields.join('|')) throw new Error(`Incomplete research fields: ${studio.name}`);
    for (const field of Object.values(studio.fields)) {
      if (!['No evidence collected', 'Unverified evidence collected'].includes(field.status) || !Array.isArray(field.evidence)) throw new Error(`Invalid evidence: ${studio.name}`);
      for (const item of field.evidence) {
        const url = new URL(item.url);
        if (url.protocol !== 'https:' || !item.excerpt || item.excerpt.length > 240) throw new Error(`Invalid evidence link/text: ${studio.name}`);
      }
    }
  }
}
