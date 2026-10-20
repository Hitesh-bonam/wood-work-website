// Everything that reads or writes image pixels.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { sleep } from './util.mjs';

// Without this, Windows can keep photo files locked after reading them.
sharp.cache(false);

/** Bump when the output settings change, so every photo is made again. */
const VERSION = 'v1';
export const SMALL = 600;
export const LARGE = 1600;
/** Originals in projects/ are shrunk to this size so the GitHub repository stays small. */
export const SOURCE_MAX = 2000;

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renames over an existing file, retrying while Windows (antivirus, preview) briefly holds it.
 * `stillSafe` is checked before every attempt, so a file that changed in the meantime is never overwritten.
 */
export async function replaceFile(from, to, stillSafe = async () => true) {
  for (let attempt = 0; ; attempt++) {
    if (!(await stillSafe())) throw new Error('the photo changed while it was being tidied; it will be tidied next time');
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (attempt >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await sleep(120 * (attempt + 1));
    }
  }
}

const tempName = (file, tag) => `${file}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.${tag}.tmp`;

async function writeAtomic(dest, pipeline) {
  const tmp = tempName(dest, 'web');
  try {
    await pipeline.toFile(tmp);
    await replaceFile(tmp, dest);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

export function needsCleaning(meta) {
  return Boolean(meta.exif || meta.xmp || meta.iptc) || Math.max(meta.width || 0, meta.height || 0) > SOURCE_MAX;
}

/**
 * Makes an original photo safe and small enough for a public repository:
 * turns it upright, removes hidden data (GPS location, camera details) and shrinks it to 2000 px.
 * Returns true when the file was changed. Unreadable or half-copied files are never overwritten.
 */
export async function cleanPhotoInPlace(file) {
  const before = await fs.stat(file);
  const input = await fs.readFile(file);
  const meta = await sharp(input).metadata();
  if (!needsCleaning(meta)) return false;
  const ext = path.extname(file).toLowerCase();
  // 'error' still refuses half-copied photos, but accepts the small glitches many cameras leave in JPEGs.
  let pipeline = sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: SOURCE_MAX, height: SOURCE_MAX, fit: 'inside', withoutEnlargement: true });
  if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (ext === '.webp') pipeline = pipeline.webp({ quality: 84 });
  else pipeline = pipeline.jpeg({ quality: 84, mozjpeg: true });
  const output = await pipeline.toBuffer();
  await sharp(output).metadata();

  const unchanged = async () => {
    try {
      const now = await fs.stat(file);
      return now.size === before.size && now.mtimeMs === before.mtimeMs;
    } catch {
      return false;
    }
  };
  const tmp = tempName(file, 'cleaning');
  try {
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(output);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!(before.mode & 0o200)) await fs.chmod(file, 0o666).catch(() => {});
    await replaceFile(tmp, file, unchanged);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  return true;
}

/** True when a photo still carries hidden data such as GPS location or camera details. */
export async function hasHiddenData(file) {
  const meta = await sharp(file).metadata();
  return Boolean(meta.exif || meta.xmp || meta.iptc);
}

function hashOf(buffer, salt) {
  return createHash('sha1').update(VERSION).update(salt).update(buffer).digest('hex').slice(0, 16);
}

/**
 * Makes the two web versions of a photo (600 px and 1600 px WebP) in outDir.
 * Files are named after the photo's content, so unchanged photos are never made twice.
 */
export async function processPhoto(file, outDir) {
  const buffer = await fs.readFile(file);
  const hash = hashOf(buffer, 'photo');
  const names = { s: `${hash}-${SMALL}.webp`, l: `${hash}-${LARGE}.webp` };
  const missing = [];
  for (const key of ['s', 'l']) {
    if (!(await exists(path.join(outDir, names[key])))) missing.push(key);
  }
  if (missing.length) {
    const source = sharp(buffer, { failOn: 'error' }).rotate();
    for (const key of missing) {
      const size = key === 's' ? SMALL : LARGE;
      await writeAtomic(
        path.join(outDir, names[key]),
        source.clone().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: key === 's' ? 72 : 80 }),
      );
    }
  }
  const result = { hash };
  for (const key of ['s', 'l']) {
    const meta = await sharp(path.join(outDir, names[key])).metadata();
    result[key] = { name: names[key], w: meta.width, h: meta.height };
  }
  return result;
}

/** 1200×630 picture used when a link is shared on WhatsApp, Facebook and so on. */
export async function makeShareImage(file, outDir) {
  const buffer = await fs.readFile(file);
  const name = `${hashOf(buffer, 'share')}-share.jpg`;
  const dest = path.join(outDir, name);
  if (!(await exists(dest))) {
    await writeAtomic(dest, sharp(buffer, { failOn: 'error' }).rotate().resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 80, mozjpeg: true }));
  }
  return name;
}

/** Logo for the header plus the small icons browsers and phones show. */
export async function makeLogoFiles(file, outDir) {
  const buffer = await fs.readFile(file);
  const hash = hashOf(buffer, 'logo');
  const files = {
    logo: `${hash}-logo.png`,
    icon: `${hash}-icon-64.png`,
    apple: `${hash}-icon-180.png`,
  };
  const source = () => sharp(buffer, { failOn: 'error', density: 300 });
  if (!(await exists(path.join(outDir, files.logo)))) {
    await writeAtomic(path.join(outDir, files.logo), source().resize({ width: 480, height: 120, fit: 'inside', withoutEnlargement: true }).png());
  }
  if (!(await exists(path.join(outDir, files.icon)))) {
    await writeAtomic(path.join(outDir, files.icon), source().resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png());
  }
  if (!(await exists(path.join(outDir, files.apple)))) {
    await writeAtomic(path.join(outDir, files.apple), source().resize(180, 180, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png());
  }
  const meta = await sharp(path.join(outDir, files.logo)).metadata();
  return { ...files, logoW: meta.width, logoH: meta.height };
}
