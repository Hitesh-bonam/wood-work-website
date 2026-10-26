// Reads the folders the owner edits (images/ and site/) and turns them into plain data.
// Nothing here touches the photos themselves; see photos.mjs for that.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  PROJECTS_DIR, PHOTO_EXTS, UNSUPPORTED_EXTS, SILENT_EXTS, isHiddenName, isHiddenFile, isCameraName, findFile, naturalCompare, readTextIfExists,
  parseKeyValueText, parsePriceLine, parseAmount, captionFromFilename, splitTitle, youtubeId, walk, plural, normKey,
} from './util.mjs';

const INFO_FILE = /^info(\.txt)+$/i;

/** Chapter folders, in the order they appear in a project. Any other folder name becomes its own chapter. */
export const CHAPTER_DEFS = [
  { key: 'photos', title: 'Photos', sub: '', names: ['photos', 'photo', 'pictures', 'pics', 'images', 'gallery', 'more'] },
  { key: 'woodwork', title: 'Woodwork', sub: 'Wardrobes, kitchens, units and doors', names: ['woodwork', 'wood work', 'wood', 'carpentry', 'carpenter', 'furniture', 'interiors', 'interior'] },
  { key: 'painting', title: 'Painting', sub: 'Walls, textures and polish', names: ['painting', 'paint', 'paints', 'painter', 'colours', 'colors', 'polish'] },
  { key: 'repairs', title: 'Repairs', sub: 'What was broken and how we fixed it', names: ['repairs', 'repair', 'fixes', 'fixing', 'fixed', 'maintenance'] },
  { key: '*' },
  { key: 'team', title: 'Our team at work', sub: 'Our carpenters and painters on site', names: ['team', 'our team', 'team at work', 'workers', 'worker', 'people', 'staff', 'work in progress', 'in progress', 'working', 'work'] },
  { key: 'quality', title: 'Quality up close', sub: 'Joints, edges, hinges and finish', names: ['quality', 'close up', 'closeup', 'close ups', 'closeups', 'details', 'detail', 'finishing', 'finish'] },
  { key: 'materials', title: 'Materials used', sub: 'What went into this home', names: ['materials', 'material', 'products', 'product', 'items', 'hardware', 'brands'] },
];
const CHAPTER_BY_NAME = new Map(CHAPTER_DEFS.flatMap((def) => (def.names || []).map((name) => [name, def])));
export const BEFORE_NAMES = ['before', 'before photos'];
export const AFTER_NAMES = ['after', 'after photos'];
const DERIVED_TYPES = ['woodwork', 'painting', 'repairs'];

export const INFO_FIELDS = {
  title: ['title', 'name', 'project name', 'project'],
  area: ['area', 'location', 'place', 'locality', 'site'],
  size: ['size', 'home size', 'house size'],
  days: ['days', 'duration', 'time', 'time taken', 'took', 'days taken'],
  finished: ['finished', 'completed', 'date', 'done', 'finished on', 'completed on', 'month'],
  type: ['type', 'types', 'category', 'categories', 'work type', 'tags'],
  about: ['about', 'description', 'story', 'summary'],
  priceNote: ['note', 'notes', 'price note'],
  review: ['review', 'client review', 'testimonial', 'feedback', 'client says'],
  reviewBy: ['review by', 'reviewer', 'client', 'client name', 'by'],
  video: ['video', 'youtube', 'video link', 'youtube link'],
  sample: ['sample'],
  cover: ['cover', 'cover photo', 'main photo'],
};
export const PRICE_KEYS = ['price', 'prices', 'price breakdown', 'price list', 'cost', 'costs', 'cost breakdown', 'budget', 'bill', 'quotation'];
const INFO_KNOWN = [...Object.values(INFO_FIELDS).flat(), ...PRICE_KEYS];

const BUSINESS_FIELDS = {
  name: ['business name', 'name', 'business', 'company', 'company name', 'shop name'],
  tagline: ['tagline', 'slogan', 'headline'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'call', 'contact number'],
  whatsapp: ['whatsapp', 'whatsapp number', 'whats app'],
  email: ['email', 'e mail', 'mail'],
  address: ['address', 'city', 'location', 'workshop'],
  areas: ['areas', 'areas served', 'service areas', 'areas we serve', 'we serve'],
  hours: ['hours', 'working hours', 'timings', 'timing', 'open'],
  years: ['years', 'years in business', 'experience', 'years of experience'],
  homes: ['homes', 'homes done', 'projects done', 'homes finished', 'jobs done'],
  warranty: ['warranty', 'guarantee'],
  map: ['map', 'google maps', 'map link', 'google map', 'maps'],
  instagram: ['instagram'],
  facebook: ['facebook'],
  youtube: ['youtube', 'youtube channel'],
  about: ['about', 'about us'],
  currency: ['currency'],
};

function pick(fields, map) {
  const out = {};
  for (const [name, aliases] of Object.entries(map)) {
    for (const alias of aliases) {
      if (fields[alias]) {
        out[name] = fields[alias];
        break;
      }
    }
  }
  return out;
}

const relPath = (root, file) => path.relative(root, file).split(path.sep).join('/');
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A number in front ("1-woodwork", "01 woodwork") only sets the order; "3D wall panels" keeps its 3. */
const ORDER_NUMBER = /^\s*\d+(?:\s*[-_.)]\s*|\s+)/;

function normFolder(name) {
  return name.toLowerCase().replace(ORDER_NUMBER, '').replace(/[\s_-]+/g, ' ').trim();
}

function titleFromFolder(name) {
  let s = name.replace(ORDER_NUMBER, '');
  s = s.includes(' ') ? s.replace(/_+/g, ' ') : s.replace(/[-_]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return capFirst(s || name);
}

function makePhoto(file, root) {
  const name = path.basename(file);
  return { file, rel: relPath(root, file), name, caption: captionFromFilename(name), chapterTitle: '', label: '' };
}

function collectPhotos(files, root, warn) {
  const photos = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (PHOTO_EXTS.has(ext)) photos.push(makePhoto(file, root));
    else if (UNSUPPORTED_EXTS.has(ext)) warn(`${relPath(root, file)} is not shown. ${UNSUPPORTED_EXTS.get(ext)}`);
    else if (!SILENT_EXTS.has(ext)) warn(`${relPath(root, file)} is not shown because it isn't a photo. Photos must be JPG, PNG or WebP.`);
  }
  return photos;
}

/**
 * The part of a photo's name that its before and after photos share. The number in front only sets the
 * order, so "01-kitchen.jpg" in before/ pairs with "1-kitchen.jpg" or "kitchen.jpg" in after/, and
 * "1-before.jpg" pairs with "1-after.jpg". Phone names (IMG_2041.jpg) and plain numbers ("1.jpg" in both
 * folders, there only to set the order) never pair: they are different photos.
 */
function pairKey(photo) {
  const raw = path.parse(photo.name).name;
  if (isCameraName(raw)) return '';
  const base = raw.toLowerCase();
  const order = base.match(/^\s*(\d+)(?:\s*[-_.)]\s*|\s+|$)/);
  const rest = order ? base.slice(order[0].length) : base;
  const named = /\b(before|after)\b/.test(rest);
  const words = rest.replace(/\b(before|after)\b/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  if (words) return /\p{L}/u.test(words) || named ? words : '';
  return order && named ? String(Number(order[1])) : '';
}

/**
 * A before photo and the after photo with the same name (kitchen.jpg in both folders) become a slider.
 * Nothing is paired by guessing: every other photo stays in its own folder, in that folder's order.
 */
function pairBeforeAfter(before, after) {
  const pairs = [];
  const byKey = new Map();
  for (const photo of after) {
    const key = pairKey(photo);
    if (key && !byKey.has(key)) byKey.set(key, photo);
  }
  const used = new Set();
  const restBefore = [];
  for (const photo of before) {
    const key = pairKey(photo);
    const match = key ? byKey.get(key) : null;
    if (match && !used.has(match)) {
      used.add(match);
      pairs.push({ before: photo, after: match });
    } else {
      restBefore.push(photo);
    }
  }
  return { pairs, before: restBefore, after: after.filter((photo) => !used.has(photo)) };
}

/** Lines after "Price:" that read like "Kitchen = 1,45,000" are prices, even after a line like "Note: GST extra". */
function priceLines(parsed) {
  const start = Math.min(...Object.values(parsed.sectionStarts));
  if (!Number.isFinite(start)) return [];
  const inList = Object.values(parsed.sections).flat();
  const later = parsed.entries
    .filter((e) => e.line > start && !INFO_KNOWN.includes(e.key) && parseAmount(e.value) != null)
    .map((e) => ({ text: `${e.rawKey} = ${e.value}`, line: e.line }));
  return [...inList, ...later].sort((a, b) => a.line - b.line);
}

function readPrice(parsed, info, where, warn) {
  const items = [];
  let total = null;
  for (const { text, line } of priceLines(parsed)) {
    const entry = parsePriceLine(text);
    if (!entry) {
      warn(`${where} line ${line}: couldn't read a price in "${text}". Write it like   Wardrobe = 85000`);
      continue;
    }
    if (/^(grand\s+)?total$/i.test(entry.item)) total = entry.amount;
    else items.push(entry);
  }
  for (const key of PRICE_KEYS) {
    const value = parsed.fields[key];
    if (!value) continue;
    const amount = parseAmount(value);
    if (amount == null) warn(`${where}: couldn't read the price "${value}". Write it like   Price: 480000`);
    else if (total == null) total = amount;
  }
  if (total == null && items.length) total = items.reduce((sum, item) => sum + item.amount, 0);
  return total == null ? null : { items, total, note: info.priceNote || '' };
}

async function scanProject({ dir, folder, num, slug, root, warn }) {
  const infoFile = await findFile(dir, INFO_FILE);
  const where = infoFile ? relPath(root, infoFile) : `${PROJECTS_DIR}/${folder}/info.txt`;
  const parsed = parseKeyValueText((infoFile && (await readTextIfExists(infoFile))) ?? '', { sectionKeys: PRICE_KEYS, knownKeys: INFO_KNOWN });
  for (const w of parsed.warnings) warn(`${where}: ${w}`);
  const priceStart = Math.min(...Object.values(parsed.sectionStarts));
  for (const e of parsed.entries) {
    const isPrice = e.line > priceStart && parseAmount(e.value) != null;
    if (!INFO_KNOWN.includes(e.key) && !isPrice) {
      warn(`${where} line ${e.line}: "${e.rawKey}" isn't a name this file understands, so the line was skipped. Use Title, Area, Size, Days, Finished, Type, About, Review, Review by, Video, Cover, Price or Note.`);
    }
  }
  const info = pick(parsed.fields, INFO_FIELDS);

  const regular = new Map();
  const before = [];
  const after = [];
  const loose = [];
  let coverPhoto = null;
  const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => naturalCompare(a.name, b.name));
  for (const entry of entries) {
    if (entry.isDirectory() ? isHiddenName(entry.name) : isHiddenFile(entry.name) || INFO_FILE.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const photos = collectPhotos(await walk(full), root, warn);
      if (!photos.length) continue;
      const norm = normFolder(entry.name);
      if (BEFORE_NAMES.includes(norm)) {
        before.push(...photos);
        continue;
      }
      if (AFTER_NAMES.includes(norm)) {
        after.push(...photos);
        continue;
      }
      const def = CHAPTER_BY_NAME.get(norm) || { key: `custom:${norm}`, title: titleFromFolder(entry.name), sub: '', custom: true };
      const chapter = regular.get(def.key) || { key: def.key, title: def.title, sub: def.sub, custom: Boolean(def.custom), photos: [], pairs: [] };
      chapter.photos.push(...photos);
      regular.set(def.key, chapter);
    } else if (entry.isFile()) {
      const [photo] = collectPhotos([full], root, warn);
      if (!photo) continue;
      if (/^cover$/i.test(path.parse(entry.name).name)) coverPhoto = { ...photo, caption: '' };
      else loose.push(photo);
    }
  }
  if (loose.length) {
    const def = CHAPTER_DEFS[0];
    const chapter = regular.get(def.key) || { key: def.key, title: def.title, sub: def.sub, custom: false, photos: [], pairs: [] };
    chapter.photos = [...loose, ...chapter.photos];
    regular.set(def.key, chapter);
  }

  // The story starts with the home before the work, then the finished work, each in its folder's order.
  const chapters = [];
  const ba = pairBeforeAfter(before, after);
  if (ba.before.length) chapters.push({ key: 'before', title: 'Before', sub: 'The home before the work started', custom: false, photos: ba.before, pairs: [] });
  if (ba.after.length) chapters.push({ key: 'after', title: 'After', sub: 'The finished work', custom: false, photos: ba.after, pairs: [] });
  if (ba.pairs.length) chapters.push({ key: 'before-after', title: 'Before and after', sub: 'Drag the line to compare', custom: false, photos: [], pairs: ba.pairs });
  for (const def of CHAPTER_DEFS) {
    if (def.key === '*') {
      chapters.push(...[...regular.values()].filter((c) => c.custom).sort((a, b) => naturalCompare(a.title, b.title)));
    } else if (regular.has(def.key)) {
      chapters.push(regular.get(def.key));
    }
  }
  let customCount = 0;
  for (const chapter of chapters) {
    chapter.id = chapter.custom ? `ch-c${++customCount}` : `ch-${chapter.key}`;
    for (const pair of chapter.pairs) {
      pair.before.chapterTitle = 'Before';
      pair.after.chapterTitle = 'After';
    }
    for (const photo of chapter.photos) photo.chapterTitle = photo.label || chapter.title;
  }

  const allPhotos = [];
  if (coverPhoto) allPhotos.push(coverPhoto);
  for (const chapter of chapters) {
    for (const pair of chapter.pairs) allPhotos.push(pair.before, pair.after);
    allPhotos.push(...chapter.photos);
  }
  if (!allPhotos.length) {
    warn(`${PROJECTS_DIR}/${folder} has no photos yet, so it isn't on the website. Add photos to its before and after folders to show it.`);
    return null;
  }

  let cover = coverPhoto;
  if (!cover && info.cover) {
    // "Cover: woodwork/2.jpg" names one photo exactly (the phone writes it like that). A bare name like
    // "2.jpg" or "kitchen" is looked for in every chapter, and a photo that isn't a before photo wins.
    const wanted = info.cover.trim().replace(/\\/g, '/').replace(/^(\.?\/)+/, '').toLowerCase();
    const inProject = (p) => relPath(dir, p.file).toLowerCase();
    const bare = wanted.split('/').pop();
    const named = (p) => p.name.toLowerCase() === bare || path.parse(p.name).name.toLowerCase() === bare;
    cover = (wanted.includes('/') && allPhotos.find((p) => inProject(p) === wanted || inProject(p).replace(/\.[^./]*$/, '') === wanted))
      || allPhotos.filter((p) => p.chapterTitle !== 'Before').find(named)
      || allPhotos.find(named)
      || null;
    if (!cover) warn(`${where}: the cover photo "${info.cover}" wasn't found, so the first photo is used.`);
  }
  if (!cover) {
    // The finished work: the first photo in after/, then other work, and an empty-house photo only if
    // there is nothing else.
    const work = chapters.find((c) => !['before', 'after', 'before-after'].includes(c.key) && c.photos.length);
    cover = after[0] || work?.photos[0] || allPhotos[0];
  }

  const row = [];
  const seen = new Set();
  const addToRow = (photo) => {
    if (photo && !seen.has(photo) && row.length < 5) {
      seen.add(photo);
      row.push(photo);
    }
  };
  // The gallery shows the finished work first; before photos only fill up what is left.
  addToRow(cover);
  for (const chapter of chapters) {
    if (chapter.key !== 'before') addToRow(chapter.key === 'before-after' ? chapter.pairs[0]?.after : chapter.photos[0]);
  }
  allPhotos.filter((p) => p.chapterTitle !== 'Before').forEach(addToRow);
  allPhotos.forEach(addToRow);

  let types = (info.type || '').split(/[,/|;]+/).map((t) => capFirst(t.trim())).filter(Boolean);
  if (!types.length) types = chapters.filter((c) => DERIVED_TYPES.includes(c.key)).map((c) => c.title);
  types = types.filter((t, i) => types.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);

  let days = info.days || '';
  if (/^\d+$/.test(days)) days = plural(Number(days), 'day');

  const videoId = youtubeId(info.video);
  let videoUrl = '';
  if (info.video && !videoId) {
    if (/^https?:\/\//i.test(info.video)) videoUrl = info.video;
    else warn(`${where}: the video link "${info.video}" isn't a web link, so it isn't shown.`);
  }

  return {
    num,
    slug,
    folder,
    folderTitle: titleFromFolder(folder),
    title: info.title || '',
    area: info.area || '',
    size: info.size || '',
    days,
    finished: info.finished || '',
    about: info.about || '',
    review: info.review || '',
    reviewBy: info.reviewBy || '',
    videoId,
    videoUrl,
    sample: /^(yes|y|true|1)$/i.test(info.sample || ''),
    types,
    price: readPrice(parsed, info, where, warn),
    cover,
    chapters,
    allPhotos,
    row,
  };
}

export async function loadProjects(root, warn) {
  const dir = path.join(root, PROJECTS_DIR);
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const folders = entries
    .filter((e) => e.isDirectory() && !isHiddenName(e.name) && !/^templates?$/i.test(e.name))
    .map((e) => e.name)
    .sort(naturalCompare);

  // A project's number comes only from its folder name, so it never changes when other projects are added.
  const used = new Set();
  const planned = folders.map((folder) => {
    const match = folder.match(/^(?:project|proj|p)?[\s_.-]*(\d{1,3})(?!\d)/i);
    const num = match ? Number(match[1]) : 0;
    if (num > 0 && !used.has(num)) {
      used.add(num);
      return { folder, num };
    }
    return { folder, num: null, duplicate: num > 0 ? num : 0 };
  });
  // Each folder without a number is offered its own free number, so following every tip gives no clashes.
  let next = Math.max(0, ...used) + 1;
  const slugs = new Set([...used].map(String));
  for (const p of planned) {
    if (p.num) {
      p.slug = String(p.num);
      continue;
    }
    const suggestion = next++;
    let slug = p.folder.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug || /^\d+$/.test(slug)) slug = `p-${createHash('sha1').update(p.folder).digest('hex').slice(0, 8)}`;
    while (slugs.has(slug)) slug = `${slug}-2`;
    slugs.add(slug);
    p.slug = slug;
    warn(p.duplicate
      ? `Two project folders use the number ${p.duplicate}, so "${PROJECTS_DIR}/${p.folder}" is shown at the end of the gallery without a number. Rename it to the next free number, like "project-${suggestion}".`
      : `"${PROJECTS_DIR}/${p.folder}" has no number, so it is shown at the end of the gallery. Rename it to "project-${suggestion}" to show it at the top as Project ${suggestion}.`);
  }

  const projects = [];
  for (const p of planned) {
    const project = await scanProject({ dir: path.join(dir, p.folder), folder: p.folder, num: p.num, slug: p.slug, root, warn });
    if (project) projects.push(project);
  }
  return projects.sort((a, b) => {
    if (a.num && b.num) return b.num - a.num;
    if (a.num || b.num) return a.num ? -1 : 1;
    return naturalCompare(a.folder, b.folder);
  });
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

/** "98765 43210 / 99887 76655" → "98765 43210" (with a note that only the first number is used). */
function firstNumber(value, label, warn) {
  const parts = String(value || '').split(/\s*(?:[/,;|&]|\bor\b)\s*/i).map((s) => s.trim()).filter((s) => /\d/.test(s));
  if (parts.length > 1) warn(`site/business.txt: only the first ${label} number (${parts[0]}) is used for the buttons.`);
  return parts[0] || '';
}

async function loadBusiness(root, warn) {
  const file = await findFile(path.join(root, 'site'), /^business(\.txt)+$/i);
  const text = file && (await readTextIfExists(file));
  if (text == null) warn('site/business.txt is missing. Add your business name, phone and WhatsApp number there.');
  const parsed = parseKeyValueText(text ?? '', { knownKeys: Object.values(BUSINESS_FIELDS).flat() });
  for (const w of parsed.warnings) warn(`site/business.txt: ${w}`);
  const b = pick(parsed.fields, BUSINESS_FIELDS);
  const currencyText = String(b.currency || '₹').trim() || '₹';
  const india = /^(₹|rs\.?|inr|rupees?)$/i.test(currencyText);
  const currency = india ? '₹' : currencyText;

  const rawWa = firstNumber(b.whatsapp, 'WhatsApp', warn);
  let wa = digits(rawWa);
  if (india && /^[6-9]\d{9}$/.test(wa)) wa = `91${wa}`;
  else if (india && /^0[6-9]\d{9}$/.test(wa)) wa = `91${wa.slice(1)}`;
  if (wa && !/[1-9]/.test(wa.replace(/^91/, ''))) wa = '';
  if (wa && (wa.length < 11 || wa.length > 15)) {
    warn(`site/business.txt: the WhatsApp number "${rawWa}" doesn't look right. Write it with the country code, like 91 98xxx xxxxx.`);
    wa = '';
  }

  const rawPhone = firstNumber(b.phone, 'phone', warn);
  let tel = rawPhone.startsWith('+') ? `+${digits(rawPhone)}` : digits(rawPhone);
  if (india && /^[6-9]\d{9}$/.test(tel)) tel = `+91${tel}`;
  else if (india && /^0\d{10}$/.test(tel)) tel = `+91${tel.slice(1)}`;
  else if (/^91\d{10}$/.test(tel)) tel = `+${tel}`;
  if (tel && !/[1-9]/.test(tel.replace(/^\+?91/, ''))) tel = '';
  if (tel && (digits(tel).length < 6 || digits(tel).length > 15)) {
    warn(`site/business.txt: the phone number "${rawPhone}" doesn't look right, so the Call buttons are hidden.`);
    tel = '';
  }

  if (!b.name) warn('site/business.txt: add your business name.');
  if (!wa && !tel) warn('site/business.txt: add your Phone and WhatsApp numbers so customers can contact you.');
  else if (!wa) warn('site/business.txt: add your WhatsApp number to show the "WhatsApp us" buttons.');
  else if (!tel) warn('site/business.txt: add your Phone number to show the "Call" buttons.');

  let email = String(b.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warn(`site/business.txt: the email "${email}" doesn't look right, so it isn't shown.`);
    email = '';
  }

  let map = String(b.map || '').trim();
  if (map && !/^https?:\/\//i.test(map)) map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(map)}`;

  const social = (value, site) => {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return `https://www.${site}.com/${v.replace(/^@/, '')}`;
  };

  return {
    name: b.name || 'Your business name',
    tagline: b.tagline || '',
    phone: tel ? rawPhone : '',
    tel,
    wa,
    email,
    address: b.address || '',
    areas: (b.areas || '').split(/[,;|]+/).map((s) => s.trim()).filter(Boolean),
    hours: b.hours || '',
    years: b.years || '',
    homes: b.homes || '',
    warranty: b.warranty || '',
    map,
    instagram: social(b.instagram, 'instagram'),
    facebook: social(b.facebook, 'facebook'),
    youtube: social(b.youtube, 'youtube'),
    about: b.about || '',
    currency,
  };
}

/** "1200 / 1700 per sq ft" → { std: 1200, prem: 1700, unit: 'sq ft' }. */
export function parseRate(value) {
  const s = String(value).replace(/(?:₹|\brs\.?|\binr)\s*(?=\d)/gi, '').replace(/(\d),(?=\d)/g, '$1').trim();
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*(?:per\s+|\/\s*|an?\s+)(\S.*)$/i);
  if (!match) return null;
  return { std: Number(match[1]), prem: match[2] ? Number(match[2]) : null, unit: match[3].trim().replace(/\.$/, '') };
}

async function loadRates(root, warn) {
  const file = await findFile(path.join(root, 'site'), /^rates(\.txt)+$/i);
  const text = file && (await readTextIfExists(file));
  if (text == null) return { asOf: '', services: [] };
  const parsed = parseKeyValueText(text);
  for (const w of parsed.warnings) warn(`site/rates.txt: ${w}`);
  let asOf = '';
  const services = [];
  for (const entry of parsed.entries) {
    if (['rates as of', 'as of', 'updated', 'prices as of', 'date'].includes(normKey(entry.rawKey))) {
      asOf = entry.value;
      continue;
    }
    if (!entry.value) continue;
    const rate = parseRate(entry.value);
    services.push(rate ? { name: entry.rawKey, ...rate } : { name: entry.rawKey, note: entry.value });
  }
  return { asOf, services };
}

async function loadShowcase(dir, root, warn) {
  return collectPhotos(await walk(dir), root, warn).map((photo) => {
    const { title, desc } = splitTitle(photo.caption);
    return { ...photo, title, desc, caption: [title, desc].filter(Boolean).join(' — ') };
  });
}

function findLogo(root) {
  return findFile(path.join(root, 'site'), /^logo\.(png|jpe?g|webp|svg)$/i);
}

export async function loadContent(root, warn) {
  const business = await loadBusiness(root, warn);
  const rates = await loadRates(root, warn);
  const projects = await loadProjects(root, warn);
  const materials = await loadShowcase(path.join(root, 'site', 'materials'), root, warn);
  const team = await loadShowcase(path.join(root, 'site', 'team'), root, warn);
  const logo = await findLogo(root);
  return { business, rates, projects, materials, team, logo };
}
