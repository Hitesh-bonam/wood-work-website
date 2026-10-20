// Turns the projects/ and site/ folders into a finished website in dist/.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadContent } from './content.mjs';
import { cleanPhotoInPlace, processPhoto, makeShareImage, makeLogoFiles } from './photos.mjs';
import { renderSite } from './pages.mjs';
import { renderAdminPage, ADMIN_PAGE, ADMIN_ASSETS } from './admin.mjs';
import { normalizeBase } from './util.mjs';

const ASSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
const LIMIT = Math.max(2, Math.min(6, (os.availableParallelism?.() ?? os.cpus().length) - 1));
/** GitHub Pages allows a published site of up to 1 GB. */
export const SITE_LIMIT_BYTES = 1024 ** 3;

async function pool(items, limit, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
}

const short = (err) => String(err?.message || err).split('\n')[0].slice(0, 160);
const removeQuietly = (p) => fs.rm(p, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });

async function dirSize(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else total += (await fs.stat(full)).size;
  }
  return total;
}

/** The website folder is emptied on every build, so it must never be (or be inside) a folder with your own files. */
function assertSafeOut(root, out) {
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const back = path.relative(fold(out), fold(root));
  const outIsRootOrAbove = back === '' || (!back.startsWith('..') && !path.isAbsolute(back));
  const inside = path.relative(fold(root), fold(out)).split(path.sep);
  const protectedNames = ['projects', 'site', 'src', 'tests', 'scripts', '.git', '.github', '.githooks', 'node_modules'];
  const insideProtected = inside[0] !== '..' && !path.isAbsolute(inside.join(path.sep)) && protectedNames.includes(inside[0]) && !(inside[0] === 'tests' && inside[1] === '.tmp');
  if (outIsRootOrAbove || insideProtected) {
    throw new Error(`Refusing to build into "${out}" because it would delete your own files.`);
  }
}

/** Deletes files from an old build that the new build no longer has (photos are handled separately). */
async function removeStale(dir, keep, base = '') {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (rel === 'assets/photos') continue;
    if (entry.isDirectory()) {
      await removeStale(full, keep, rel);
      if (!(await fs.readdir(full)).length) await removeQuietly(full);
    } else if (!keep.has(rel)) {
      await removeQuietly(full);
    }
  }
}

async function cleanSources(files, { root, settleMs, warn, onTidy }) {
  const memoFile = path.join(root, '.cache', 'clean-memo.json');
  let memo = {};
  try {
    memo = JSON.parse(await fs.readFile(memoFile, 'utf8'));
  } catch {
    memo = {};
  }
  const nextMemo = {};
  const cleaned = [];
  let deferred = false;
  const now = Date.now();
  await pool(files, LIMIT, async (file) => {
    const rel = path.relative(root, file).split(path.sep).join('/');
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      return;
    }
    const key = `${stat.size}:${Math.round(stat.mtimeMs)}`;
    if (memo[rel] === key) {
      nextMemo[rel] = key;
      return;
    }
    const age = now - stat.mtimeMs;
    if (age >= 0 && age < settleMs) {
      deferred = true;
      return;
    }
    try {
      if (onTidy) onTidy(file);
      if (await cleanPhotoInPlace(file)) cleaned.push(file);
      const after = await fs.stat(file);
      nextMemo[rel] = `${after.size}:${Math.round(after.mtimeMs)}`;
    } catch (err) {
      warn(`Couldn't tidy ${rel} (${short(err)}). If it was still copying, it will be tidied on the next refresh.`);
    }
  });
  await fs.mkdir(path.dirname(memoFile), { recursive: true });
  await fs.writeFile(memoFile, JSON.stringify(nextMemo));
  return { cleaned, deferred };
}

function refillRow(project) {
  const row = project.row.filter((p) => !p.failed);
  const seen = new Set(row);
  for (const photo of [...project.allPhotos.filter((p) => p.chapterTitle !== 'Before'), ...project.allPhotos]) {
    if (row.length >= 5) break;
    if (!seen.has(photo)) {
      seen.add(photo);
      row.push(photo);
    }
  }
  project.row = row;
}

/** "owner/name" of the GitHub repository this folder is connected to (from .git/config), or ''. */
export async function readGitHubRepo(root) {
  let text;
  try {
    text = await fs.readFile(path.join(root, '.git', 'config'), 'utf8');
  } catch {
    return '';
  }
  const origin = text.match(/\[remote "origin"\]([^[]*)/);
  const url = origin && origin[1].match(/^\s*url\s*=\s*(\S+)/m);
  const match = url && url[1].match(/github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : '';
}

/** Removes photos that couldn't be read. Returns false when nothing is left of the project. */
function pruneProject(project) {
  for (const chapter of project.chapters) {
    const survivors = [];
    chapter.pairs = chapter.pairs.filter((pair) => {
      if (!pair.before.failed && !pair.after.failed) return true;
      if (!pair.before.failed) survivors.push(Object.assign(pair.before, { label: 'Before' }));
      if (!pair.after.failed) survivors.push(Object.assign(pair.after, { label: 'After' }));
      return false;
    });
    chapter.photos = [...survivors, ...chapter.photos.filter((p) => !p.failed)];
  }
  project.chapters = project.chapters.filter((c) => c.pairs.length || c.photos.length);
  project.allPhotos = project.allPhotos.filter((p) => !p.failed);
  if (!project.allPhotos.length) return false;
  if (!project.cover || project.cover.failed) project.cover = project.allPhotos.find((p) => p.chapterTitle !== 'Before') || project.allPhotos[0];
  refillRow(project);
  project.allPhotos.forEach((photo, index) => {
    photo.index = index;
  });
  return true;
}

/**
 * Builds the website.
 * @param {object} options
 * @param {string} options.root          folder that holds projects/ and site/
 * @param {string} [options.out]         where the website is written (default: root/dist)
 * @param {string} [options.base]        path the site lives under, e.g. "/wood-work/" on GitHub Pages
 * @param {string} [options.siteUrl]     full address, used for link previews and the sitemap
 * @param {boolean} [options.dev]        adds the auto-refresh script used by the preview
 * @param {boolean} [options.cleanSources] tidies the original photos in place (preview and commit only)
 * @param {string} [options.repo]        "owner/name" on GitHub, for the upload page (default: from .git/config)
 * @param {string} [options.branch]      branch the upload page saves to (default: main)
 */
export async function build(options) {
  const started = Date.now();
  const root = path.resolve(options.root);
  const out = path.resolve(options.out ?? path.join(root, 'dist'));
  assertSafeOut(root, out);
  const base = normalizeBase(options.base);
  const siteUrl = String(options.siteUrl || '').replace(/\/+$/, '');
  const warnings = [];
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  const content = await loadContent(root, warn);
  const projectPhotos = content.projects.flatMap((p) => p.allPhotos);
  const everyPhoto = [...projectPhotos, ...content.materials, ...content.team];
  const files = [...new Set(everyPhoto.map((p) => p.file))];

  let cleaned = [];
  let deferred = false;
  if (options.cleanSources) {
    ({ cleaned, deferred } = await cleanSources(files, { root, settleMs: options.settleMs ?? 2000, warn, onTidy: options.onTidy }));
  }

  const photoDir = path.join(out, 'assets', 'photos');
  await fs.mkdir(photoDir, { recursive: true });
  const keep = new Set();
  const byFile = new Map();
  for (const photo of everyPhoto) {
    if (!byFile.has(photo.file)) byFile.set(photo.file, []);
    byFile.get(photo.file).push(photo);
  }
  await pool(files, LIMIT, async (file) => {
    try {
      const result = await processPhoto(file, photoDir);
      for (const photo of byFile.get(file)) Object.assign(photo, { s: result.s, l: result.l });
      keep.add(result.s.name);
      keep.add(result.l.name);
    } catch (err) {
      for (const photo of byFile.get(file)) photo.failed = true;
      warn(`${path.relative(root, file).split(path.sep).join('/')} was skipped because it couldn't be read as a photo (${short(err)}).`);
    }
  });

  content.projects = content.projects.filter((project) => {
    if (pruneProject(project)) return true;
    warn(`projects/${project.folder} isn't shown because none of its photos could be read.`);
    return false;
  });
  for (const key of ['materials', 'team']) {
    content[key] = content[key].filter((p) => !p.failed);
    content[key].forEach((photo, index) => {
      photo.index = index;
    });
  }

  for (const project of content.projects) {
    try {
      project.share = await makeShareImage(project.cover.file, photoDir);
      keep.add(project.share);
    } catch (err) {
      warn(`Couldn't make the link preview picture for projects/${project.folder} (${short(err)}).`);
    }
  }
  let logo = null;
  if (content.logo) {
    try {
      logo = await makeLogoFiles(content.logo, photoDir);
      [logo.logo, logo.icon, logo.apple].forEach((name) => keep.add(name));
    } catch (err) {
      warn(`site/${path.basename(content.logo)} couldn't be read, so the logo isn't shown (${short(err)}).`);
    }
  }

  // New pages are written over the old ones first and only then are leftovers removed,
  // so a page open in the preview never finds its file missing halfway through a rebuild.
  const css = await fs.readFile(path.join(ASSET_DIR, 'app.css'), 'utf8');
  const js = await fs.readFile(path.join(ASSET_DIR, 'app.js'), 'utf8');
  const version = createHash('sha1').update(css).update(js).digest('hex').slice(0, 10);
  // The upload page (admin/) has its own files, so the public pages and their version stay unchanged.
  const adminAssets = [];
  for (const name of ADMIN_ASSETS) adminAssets.push({ file: `assets/${name}`, content: await fs.readFile(path.join(ASSET_DIR, name), 'utf8') });
  const adminVersion = adminAssets.reduce((hash, asset) => hash.update(asset.content), createHash('sha1').update(css)).digest('hex').slice(0, 10);
  const admin = renderAdminPage({
    business: content.business,
    logo,
    base,
    version: adminVersion,
    repo: options.repo || (await readGitHubRepo(root)),
    branch: options.branch || 'main',
    projects: content.projects,
  });
  const pages = [
    { file: 'assets/app.css', content: css },
    { file: 'assets/app.js', content: js },
    ...adminAssets,
    ...renderSite({ ...content, logo, base, siteUrl, dev: Boolean(options.dev), version, year: new Date().getFullYear() }),
    { file: ADMIN_PAGE, content: admin },
  ];
  for (const page of pages) {
    const dest = path.join(out, ...page.file.split('/'));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, page.content);
  }
  await removeStale(out, new Set(pages.map((p) => p.file)));
  for (const name of await fs.readdir(photoDir)) {
    if (!keep.has(name)) await removeQuietly(path.join(photoDir, name));
  }

  return {
    warnings,
    deferred,
    cleaned: cleaned.length,
    cleanedFiles: cleaned,
    projects: content.projects.length,
    photos: content.projects.reduce((n, p) => n + p.allPhotos.length, 0) + content.materials.length + content.team.length,
    bytes: await dirSize(out),
    ms: Date.now() - started,
    out,
  };
}

export function sizeReport(bytes) {
  const mb = bytes / 1024 ** 2;
  const percent = (bytes / SITE_LIMIT_BYTES) * 100;
  const text = `Website size: ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB of 1,024 MB (${percent < 1 ? '<1' : Math.round(percent)}% of the free GitHub space)`;
  return { text, percent };
}
