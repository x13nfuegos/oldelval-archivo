#!/usr/bin/env node
/**
 * Generates data.json by scanning a Dropbox folder recursively, extracting
 * metadata from folder name conventions, and creating Dropbox shared links
 * so the web app can link directly to each folder.
 *
 * Required env vars:
 *   DROPBOX_ACCESS_TOKEN  Dropbox API token with files.metadata.read and sharing.write.
 *                         Use a refresh-token-backed token if you can.
 *
 * Optional env vars:
 *   DROPBOX_ROOT_PATH         Root path to scan. Default "/OLDELVAL".
 *   DROPBOX_TEAM_MEMBER_ID    If the root lives in a Business team space, set this
 *                             to the Dropbox team member id whose access we should use.
 *                             Requires the token to have team_data.member scope.
 */

const fs = require('fs');
const { Dropbox } = require('dropbox');

const ROOT_PATH = process.env.DROPBOX_ROOT_PATH || '/OLDELVAL';
const TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const TEAM_MEMBER_ID = process.env.DROPBOX_TEAM_MEMBER_ID || '';

if (!TOKEN) {
  console.error('Missing DROPBOX_ACCESS_TOKEN env var');
  process.exit(1);
}

const dbxOpts = { accessToken: TOKEN, fetch };
if (TEAM_MEMBER_ID) {
  dbxOpts.selectUser = TEAM_MEMBER_ID;
  dbxOpts.pathRoot = JSON.stringify({ '.tag': 'root', root: 'auto' });
}
const dbx = new Dropbox(dbxOpts);

const TYPE_PATTERNS = [
  { tp: 'Foto',    re: /(?:\b|_)(foto|photos?|banco_fotos?)(?:\b|_)/i },
  { tp: 'RAW',     re: /(?:\b|_)raw(?:\b|_)/i },
  { tp: 'Audio',   re: /(?:\b|_)audio(?:\b|_)/i },
  { tp: 'Edición', re: /(?:\b|_)(edicion|edición|edit)(?:\b|_)/i },
  { tp: 'Entrega', re: /(?:\b|_)entregas?(?:\b|_)/i },
];

function detectType(...haystacks) {
  const s = haystacks.join(' ');
  for (const p of TYPE_PATTERNS) if (p.re.test(s)) return p.tp;
  return '';
}

function detectYear(...haystacks) {
  const m = haystacks.join(' ').match(/\b(20[1-3]\d)\b/);
  return m ? m[1] : '';
}

function detectDate(name) {
  let m = name.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = name.match(/(20\d{2})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, label, max = 5) {
  let attempt = 0;
  while (true) {
    try { return await fn(); }
    catch (e) {
      attempt++;
      const status = e?.status || e?.error?.status;
      const tag = e?.error?.error?.['.tag'] || e?.error?.['.tag'] || '';
      const retryAfter = Number(e?.error?.retry_after || e?.headers?.['retry-after']) || 0;
      if (attempt >= max) throw e;
      if (status === 429 || status === 503 || tag === 'too_many_requests' || tag === 'too_many_write_operations') {
        const backoff = Math.max(retryAfter * 1000, 500 * 2 ** attempt);
        console.warn(`[${label}] retry ${attempt} after ${backoff}ms (status=${status} tag=${tag})`);
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
}

async function listFolderRecursive(path) {
  let entries = [];
  let res = await withRetry(
    () => dbx.filesListFolder({ path, recursive: true, include_non_downloadable_files: false }),
    'listFolder'
  );
  entries = entries.concat(res.result.entries);
  while (res.result.has_more) {
    res = await withRetry(
      () => dbx.filesListFolderContinue({ cursor: res.result.cursor }),
      'listFolderContinue'
    );
    entries = entries.concat(res.result.entries);
  }
  return entries;
}

async function shareLink(path) {
  try {
    const r = await withRetry(
      () => dbx.sharingCreateSharedLinkWithSettings({ path, settings: { audience: 'public', access: 'viewer' } }),
      'createShareLink'
    );
    return r.result.url;
  } catch (e) {
    const tag = e?.error?.error?.['.tag'] || '';
    if (tag === 'shared_link_already_exists') {
      try {
        const r = await withRetry(
          () => dbx.sharingListSharedLinks({ path, direct_only: true }),
          'listSharedLinks'
        );
        if (r.result.links && r.result.links.length) return r.result.links[0].url;
      } catch (e2) {
        console.warn('listSharedLinks failed for', path, e2?.message || e2);
      }
    }
    console.warn('shareLink skipped for', path, '-', e?.message || tag);
    return '';
  }
}

(async () => {
  console.log('Scanning Dropbox path:', ROOT_PATH);
  const all = await listFolderRecursive(ROOT_PATH);
  const folders = all.filter(e => e['.tag'] === 'folder');
  const files = all.filter(e => e['.tag'] === 'file');
  console.log(`Found ${folders.length} folders, ${files.length} files`);

  const childFolderCount = new Map();
  const childFileCount = new Map();
  for (const e of folders) {
    const parent = e.path_display.replace(/\/[^/]+$/, '') || '/';
    childFolderCount.set(parent, (childFolderCount.get(parent) || 0) + 1);
  }
  for (const e of files) {
    const parent = e.path_display.replace(/\/[^/]+$/, '') || '/';
    childFileCount.set(parent, (childFileCount.get(parent) || 0) + 1);
  }

  // Load previous data.json to reuse share links and avoid hammering the API
  const prev = new Map();
  try {
    const old = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    for (const r of old) if (r.pt && r.sl) prev.set(r.pt, r.sl);
    console.log('Reusing', prev.size, 'existing share links');
  } catch {}

  const records = [];
  const ns = TEAM_MEMBER_ID ? 'TEAM' : 'USER';

  // root entry
  {
    const parts = ROOT_PATH.split('/').filter(Boolean);
    const cl = (parts[0] || '').toUpperCase();
    records.push({
      ns, lv: 1, cl, jo: '',
      nm: parts[parts.length - 1] || cl,
      pt: ROOT_PATH,
      dt: '', yr: '', tp: '',
      fd: childFolderCount.get(ROOT_PATH) || 0,
      fi: childFileCount.get(ROOT_PATH) || 0,
      sl: prev.get(ROOT_PATH) || await shareLink(ROOT_PATH),
    });
  }

  let i = 0;
  for (const f of folders) {
    const parts = f.path_display.split('/').filter(Boolean);
    const lv = parts.length;
    const cl = (parts[0] || '').toUpperCase();
    const jo = parts[1] || '';
    const nm = f.name;
    const pt = f.path_display;
    const sl = prev.get(pt) || await shareLink(pt);
    records.push({
      ns, lv, cl, jo, nm, pt,
      dt: detectDate(nm),
      yr: detectYear(nm, pt),
      tp: detectType(nm, jo),
      fd: childFolderCount.get(pt) || 0,
      fi: childFileCount.get(pt) || 0,
      sl,
    });
    if (++i % 25 === 0) process.stdout.write(`  ${i}/${folders.length}\r`);
  }

  console.log(`\nWriting ${records.length} records to data.json`);
  fs.writeFileSync('data.json', JSON.stringify(records));
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
