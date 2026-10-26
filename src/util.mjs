// Small helpers shared by the build, the preview server and the tests.
import fs from 'node:fs/promises';
import path from 'node:path';

/** The owner's main photo folder: images/project-1/before, images/project-1/after, and so on. */
export const PROJECTS_DIR = 'images';

export const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.jfif', '.jpe', '.png', '.webp']);

/** Files that are normal to find next to photos and are skipped without a note. */
export const SILENT_EXTS = new Set(['.txt', '.md', '.ini', '.db', '.tmp', '.part', '.crdownload', '.lnk', '.url', '.aae', '.xmp', '.json', '.gitkeep', '.ds_store']);

const VIDEO_TIP = 'Videos are too big for the website. Put the video on YouTube and add its link to info.txt as   Video: <link>';
const HEIC_TIP = 'iPhone HEIC photos can’t be shown on websites. Save it as JPG instead (iPhone: Settings › Camera › Formats › Most Compatible), or send it to yourself on WhatsApp and use that copy.';
const CONVERT_TIP = 'This file type isn’t supported. Save it as JPG or PNG.';

export const UNSUPPORTED_EXTS = new Map([
  ['.heic', HEIC_TIP], ['.heif', HEIC_TIP],
  ['.gif', CONVERT_TIP], ['.bmp', CONVERT_TIP], ['.tif', CONVERT_TIP], ['.tiff', CONVERT_TIP],
  ['.dng', CONVERT_TIP], ['.cr2', CONVERT_TIP], ['.nef', CONVERT_TIP], ['.arw', CONVERT_TIP], ['.raw', CONVERT_TIP],
  ['.avif', CONVERT_TIP], ['.svg', CONVERT_TIP],
  ['.mp4', VIDEO_TIP], ['.mov', VIDEO_TIP], ['.avi', VIDEO_TIP], ['.mkv', VIDEO_TIP],
  ['.3gp', VIDEO_TIP], ['.webm', VIDEO_TIP], ['.m4v', VIDEO_TIP], ['.wmv', VIDEO_TIP],
]);

/** Folders starting with _ . or ~ are ignored (like the _template folder, hidden and temporary folders). */
export function isHiddenName(name) {
  return name.startsWith('.') || name.startsWith('_') || name.startsWith('~');
}

/** Hidden and temporary files. Files starting with _ are kept: some cameras name photos "_DSC1234.JPG". */
export function isHiddenFile(name) {
  return name.startsWith('.') || name.startsWith('~');
}

/**
 * Finds a file in a folder whatever its capitals ("Info.TXT") and even when Windows hid a doubled
 * extension ("info.txt.txt"). GitHub's servers treat capitals as different letters; this keeps the
 * website the same there as in the preview.
 */
export async function findFile(dir, pattern) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const match = entries.filter((e) => e.isFile() && pattern.test(e.name)).map((e) => e.name).sort(naturalCompare)[0];
  return match ? path.join(dir, match) : null;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** JSON that is safe to put inside a <script> tag. */
export function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, String.fromCharCode(92) + 'u003c');
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** Sorts "2.jpg" before "10.jpg" and ignores upper/lower case. */
export function naturalCompare(a, b) {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Reads a text file written by any editor (UTF-8, UTF-8 with BOM, or Notepad's UTF-16). */
export async function readText(file) {
  const buf = await fs.readFile(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1)));
    return body.swap16().toString('utf16le');
  }
  const text = buf.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function readTextIfExists(file) {
  try {
    return await readText(file);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return null;
    throw err;
  }
}

/** Lists every file under a folder (skipping hidden ones), sorted naturally. Missing folder → []. */
export async function walk(dir) {
  const found = [];
  async function visit(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!isHiddenName(entry.name)) await visit(full);
      } else if (entry.isFile() && !isHiddenFile(entry.name)) {
        found.push(full);
      }
    }
  }
  await visit(dir);
  return found.sort((a, b) => naturalCompare(path.relative(dir, a).split(path.sep).join('/'), path.relative(dir, b).split(path.sep).join('/')));
}

export function normKey(key) {
  return String(key).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

/**
 * Reads the simple "Name: value" text files (info.txt, business.txt, rates.txt).
 * - Lines starting with # are notes and are skipped.
 * - "Name: value" and "Name = value" both work.
 * - A line like "Price:" with nothing after it starts a list; the following lines belong to it
 *   until a known field name appears again.
 */
export function parseKeyValueText(text, { sectionKeys = [], knownKeys = [] } = {}) {
  const fields = {};
  const entries = [];
  const sections = {};
  const sectionStarts = {};
  const warnings = [];
  let section = null;
  const known = new Set(knownKeys);
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    const match = line.match(/^([^:=]*[^:=\s])\s*[:=]\s*(.*)$/);
    const key = match ? normKey(match[1]) : '';
    if (match && sectionKeys.includes(key) && !match[2].trim()) {
      section = key;
      sections[key] = sections[key] || [];
      if (!sectionStarts[key]) sectionStarts[key] = index + 1;
      return;
    }
    if (section) {
      if (match && known.has(key)) {
        section = null;
      } else {
        sections[section].push({ text: line, line: index + 1 });
        return;
      }
    }
    if (!match) {
      warnings.push(`line ${index + 1} was skipped. Write it like   Name: value   ("${line}")`);
      return;
    }
    const value = match[2].trim();
    fields[key] = value;
    entries.push({ key, rawKey: match[1].trim(), value, line: index + 1 });
  });
  return { fields, entries, sections, sectionStarts, warnings };
}

const AMOUNT_UNITS = {
  k: 1e3, thousand: 1e3, thousands: 1e3,
  l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5,
  cr: 1e7, crore: 1e7, crores: 1e7,
};

/** "1,92,000" / "₹ 192000" / "1.92 lakh" / "65k" / "Rs. 8,000/-" → number. Anything else → null. */
export function parseAmount(input) {
  if (input == null) return null;
  let s = String(input).toLowerCase().trim();
  s = s.replace(/^(?:₹|rs\.?|inr|rupees?)\s*/, '');
  s = s.replace(/\s*(?:\/-|rupees?|only)\s*$/, '');
  s = s.replace(/[,\s]/g, '');
  const match = s.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  if (!match) return null;
  const multiplier = match[2] ? AMOUNT_UNITS[match[2]] : 1;
  if (!multiplier) return null;
  const amount = Math.round(parseFloat(match[1]) * multiplier);
  return Number.isFinite(amount) ? amount : null;
}

/** One line of the price list: "Wardrobes (3) = 1,92,000" → { item, amount }. */
export function parsePriceLine(text) {
  let item;
  let amountText;
  const withSeparator = text.match(/^(.*\S)\s*[=:]\s*([^=:]+)$/);
  if (withSeparator) {
    [, item, amountText] = withSeparator;
  } else {
    const trailing = text.match(/^(.*\S)\s+((?:₹|rs\.?)?\s*\d[\d,.]*\s*(?:k|l|lakhs?|lacs?|cr|crores?|thousands?)?(?:\/-)?)$/i);
    if (!trailing) return null;
    [, item, amountText] = trailing;
  }
  item = item.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '').trim();
  const amount = parseAmount(amountText);
  if (!/[\p{L}\p{N}]/u.test(item) || amount == null) return null;
  return { item, amount };
}

const CAMERA_NAME = /^(?:img|dsc|dscn|dscf|pxl|mvimg|photo|image|pic|picture|screenshot|screen shot|whatsapp image|wa|snapchat|signal|telegram|fb img|received|p)[\s_-]*(?:\(\d+\)|\d)/i;

/** True for names a phone or camera gives a photo ("IMG_2041", "WhatsApp Image 2026-10-12 ..."). */
export function isCameraName(base) {
  const name = String(base).trim();
  if (!name) return true;
  if (CAMERA_NAME.test(name)) return true;
  if ((name.match(/\d/g) || []).length >= 6) return true;
  return !/\p{L}/u.test(name);
}

/** Short trade words that should stay in capitals even when a file name is typed in lower case. */
const CAPS = new Map(['tv', 'led', 'bwp', 'bwr', 'mr', 'mdf', 'hdf', 'pvc', 'wpc', 'pu', 'ac', 'diy', 'pop', 'cnc']
  .map((w) => [w, w.toUpperCase()]).concat([['upvc', 'uPVC']]));

/** "01-master-wardrobe-sliding-doors.jpg" → "Master wardrobe sliding doors". Camera names → "". */
export function captionFromFilename(fileName) {
  const base = path.parse(fileName).name;
  if (isCameraName(base)) return '';
  let s = base.replace(/^\s*\d+\s*[-_.)]\s*/, '').replace(/^0\d*\s+/, '');
  s = s.includes(' ') ? s.replace(/_+/g, ' ') : s.replace(/[-_]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || !/\p{L}/u.test(s)) return '';
  s = s.replace(/\b(\d?)([a-z]+)\b/g, (word, digit, letters) => (CAPS.has(letters) ? digit + CAPS.get(letters) : /^\dbhk$/.test(word) ? word.toUpperCase() : word));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "BWP ply 18 mm - Standard and premium grades" → { title, desc }. */
export function splitTitle(caption) {
  const parts = String(caption || '').split(/\s+[-–—]\s+/);
  return { title: parts[0] || '', desc: parts.slice(1).join(' - ') };
}

export function youtubeId(url) {
  if (!url) return null;
  const match = String(url).trim().match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function formatMoney(amount, symbol = '₹') {
  const locale = symbol === '₹' ? 'en-IN' : 'en-US';
  return `${symbol}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(amount))}`;
}

export function normalizeBase(base) {
  let s = String(base || '/').trim();
  if (!s.startsWith('/')) s = `/${s}`;
  if (!s.endsWith('/')) s = `${s}/`;
  return s.replace(/\/{2,}/g, '/');
}

export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
