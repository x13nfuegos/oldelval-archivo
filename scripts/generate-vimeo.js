#!/usr/bin/env node
/**
 * Genera vimeo.json descargando todos los videos de la cuenta que comienzan
 * con "OLD" (prefijo de los videos de Oldelval en Vimeo).
 *
 * Required env var:
 *   VIMEO_TOKEN   Token de acceso a la API de Vimeo (mismo que usa api/vimeo.js).
 */

const fs = require('fs');

const TOKEN = process.env.VIMEO_TOKEN;
if (!TOKEN) {
  console.error('Missing VIMEO_TOKEN env var');
  process.exit(1);
}

const FIELDS = 'uri,name,description,duration,created_time,pictures,stats,link,player_embed_url';
const PER_PAGE = 100;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(page) {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    page: String(page),
    query: 'OLD',
    fields: FIELDS,
    sort: 'date',
    direction: 'desc',
  });
  const res = await fetch('https://api.vimeo.com/me/videos?' + params, {
    headers: { Authorization: 'bearer ' + TOKEN },
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') || 10);
    console.warn(`Rate limited, retrying after ${retry}s...`);
    await sleep(retry * 1000);
    return fetchPage(page);
  }
  if (!res.ok) throw new Error(`Vimeo API error ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  const all = [];
  let page = 1;
  let total = null;

  while (true) {
    const body = await fetchPage(page);
    if (total === null) total = body.total || 0;

    const videos = (body.data || []).filter(v => v.name?.toUpperCase().startsWith('OLD'));
    all.push(...videos);
    process.stdout.write(`  Page ${page}: +${videos.length} videos (${all.length}/${total})\n`);

    if (!body.paging?.next) break;
    page++;
    await sleep(200); // pequeña pausa para no saturar la API
  }

  console.log(`Writing ${all.length} videos to vimeo.json`);
  fs.writeFileSync('vimeo.json', JSON.stringify(all));
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
