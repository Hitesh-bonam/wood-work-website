// Tidies original photos before they are saved to GitHub: turns them upright, removes hidden
// data such as the GPS location of the client's home, and shrinks them to web size.
//   npm run clean-photos                → every photo in images/ and site/
//   node src/clean-photos.mjs --staged  → only photos about to be committed (used by the git hook).
//                                         Stops the commit if a photo still has hidden data.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPhotoInPlace, hasHiddenData } from './photos.mjs';
import { PHOTO_EXTS, PROJECTS_DIR, UNSUPPORTED_EXTS, walk } from './util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staged = process.argv.includes('--staged');
const inContent = (rel) => rel.toLowerCase().startsWith(`${PROJECTS_DIR}/`) || rel.toLowerCase().startsWith('site/');
const firstLine = (err) => String(err && err.message ? err.message : err).split('\n')[0];

let files;
if (staged) {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { cwd: root });
  files = out.toString('utf8').split('\0').filter(Boolean).filter(inContent);
} else {
  files = [...(await walk(path.join(root, PROJECTS_DIR))), ...(await walk(path.join(root, 'site')))].map((f) => path.relative(root, f).split(path.sep).join('/'));
}

let cleaned = 0;
const notes = [];
const blocked = [];
for (const rel of files) {
  const ext = path.extname(rel).toLowerCase();
  if (UNSUPPORTED_EXTS.has(ext)) {
    notes.push(`${rel} won't show on the website. ${UNSUPPORTED_EXTS.get(ext)}`);
    continue;
  }
  if (!PHOTO_EXTS.has(ext)) continue;
  const file = path.join(root, rel);
  try {
    if (await cleanPhotoInPlace(file)) {
      cleaned++;
      if (staged) execFileSync('git', ['add', '--', rel], { cwd: root });
    }
  } catch (err) {
    notes.push(`${rel} couldn't be tidied (${firstLine(err)}).`);
  }
  if (staged) {
    let hidden = true;
    try {
      hidden = await hasHiddenData(file);
    } catch {
      hidden = true;
    }
    if (hidden) blocked.push(rel);
  }
}

if (cleaned) console.log(`Tidied ${cleaned} photo${cleaned === 1 ? '' : 's'}: location data removed and sized for the web.`);
for (const note of notes) console.log(`  ! ${note}`);
if (blocked.length) {
  console.log('');
  console.log('Not saved: these photos may still contain the GPS location of where they were taken,');
  console.log('and the website files are public. Open each one, save a copy as a new JPG, and replace it:');
  for (const rel of blocked) console.log(`  - ${rel}`);
  process.exitCode = 1;
}
