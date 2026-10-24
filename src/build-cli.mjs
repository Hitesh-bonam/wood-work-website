// `npm run build` — builds the website into dist/. GitHub runs this before publishing.
// SITE_URL and BASE_PATH are set by the GitHub workflow; locally they can be left empty.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, sizeReport } from './build.mjs';
import { hasHiddenData } from './photos.mjs';
import { PHOTO_EXTS, walk } from './util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteUrl = process.env.SITE_URL || '';
let base = process.env.BASE_PATH;
if (base == null || base === '') {
  try {
    base = siteUrl ? new URL(siteUrl).pathname : '/';
  } catch {
    base = '/';
  }
}

/** On GitHub: points out photos that reached the repository without being tidied (for example uploaded on github.com). */
async function reportUntidiedPhotos() {
  const files = [...(await walk(path.join(root, 'projects'))), ...(await walk(path.join(root, 'site')))];
  for (const file of files) {
    if (!PHOTO_EXTS.has(path.extname(file).toLowerCase())) continue;
    let hidden = false;
    try {
      hidden = await hasHiddenData(file);
    } catch {
      hidden = false;
    }
    if (hidden) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      console.log(`::warning file=${rel}::This photo still has hidden data such as the GPS location. The website copy is clean, but the original in the repository is public. Add photos from your computer (PUBLISH.cmd or GitHub Desktop) so they are tidied first.`);
    }
  }
}

try {
  // GitHub sets GITHUB_REPOSITORY ("owner/name"); the upload page saves photos there.
  const result = await build({ root, out: path.join(root, 'dist'), base, siteUrl, repo: process.env.GITHUB_REPOSITORY || '' });
  for (const warning of result.warnings) console.log(`  ! ${warning}`);
  const size = sizeReport(result.bytes, result.photoBytes);
  console.log(`Built ${result.projects} projects and ${result.photos} photos in ${(result.ms / 1000).toFixed(1)}s.`);
  console.log(size.text);
  if (size.warning) console.log(`  ! ${size.warning}`);
  if (process.env.GITHUB_ACTIONS) await reportUntidiedPhotos();
} catch (err) {
  console.error(`Build failed: ${err.message}`);
  process.exitCode = 1;
}
