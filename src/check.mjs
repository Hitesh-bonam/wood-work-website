// `npm run check` — makes sure every link and picture inside the built website points at a real file.
// GitHub runs this before publishing, so a broken website is never put online.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBase } from './util.mjs';

export async function checkSite(dir, base = '/') {
  const root = path.resolve(dir);
  const prefix = normalizeBase(base);
  const problems = [];
  const htmlFiles = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.name.endsWith('.html')) htmlFiles.push(full);
    }
  }
  await visit(root);
  const exists = async (file) => {
    try {
      return (await fs.stat(file)).isFile();
    } catch {
      return false;
    }
  };
  for (const file of htmlFiles) {
    const html = await fs.readFile(file, 'utf8');
    const rel = path.relative(root, file).split(path.sep).join('/');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const urls = [];
    for (const m of html.matchAll(/\s(?:href|src|data-json|data-s|data-l|data-next)="([^"]*)"/g)) urls.push(m[1]);
    for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) {
      for (const part of m[1].split(',')) urls.push(part.trim().split(/\s+/)[0]);
    }
    for (const raw of urls) {
      const url = raw.replace(/&amp;/g, '&');
      if (!url || /^(https?:|mailto:|tel:|data:)/i.test(url)) continue;
      if (url.startsWith('#')) {
        if (url.length > 1 && !ids.has(decodeURIComponent(url.slice(1)))) problems.push(`${rel}: link to missing section ${url}`);
        continue;
      }
      if (url.startsWith('/__dev/')) continue;
      if (!url.startsWith(prefix)) {
        problems.push(`${rel}: link outside the site base "${prefix}": ${url}`);
        continue;
      }
      let target = decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0]);
      if (target === '' || target.endsWith('/')) target += 'index.html';
      if (!(await exists(path.join(root, ...target.split('/'))))) problems.push(`${rel}: missing file for ${url}`);
    }
  }
  return { pages: htmlFiles.length, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const siteUrl = process.env.SITE_URL || '';
  let base = process.env.BASE_PATH;
  if (!base) {
    try {
      base = siteUrl ? new URL(siteUrl).pathname : '/';
    } catch {
      base = '/';
    }
  }
  const { pages, problems } = await checkSite(path.join(root, 'dist'), base);
  if (problems.length) {
    console.error(`Found ${problems.length} broken links:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`Checked ${pages} pages: every link and photo works.`);
  }
}
