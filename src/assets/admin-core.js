/* Upload page (admin/): the parts that don't touch the page. They read the projects on GitHub, name the
   new photos, edit info.txt and save everything as one commit. The page itself is in admin.js.
   The rules mirror src/content.mjs and src/util.mjs; tests/unit/admin.test.mjs checks that both agree.
   Runs in the browser and in Node (for the tests) and adds one object, WoodworkUpload, to the global scope. */
(function (root) {
  'use strict';

  const API = 'https://api.github.com';
  /** Value of the project menu for "New project". */
  const NEW = 'new';
  /** Bigger files can crash a phone's browser while they are made smaller. */
  const MAX_FILE_BYTES = 40 * 1024 * 1024;
  /** 64 megapixels covers the 48 and 50 megapixel modes of today's phones. */
  const MAX_PIXELS = 64 * 1000 * 1000;
  /** Photos sent in one go. More would make one publish take too long on a phone connection. */
  const MAX_PHOTOS = 50;
  const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

  /* ---------- The same small rules the website uses (src/util.mjs, src/content.mjs) ---------- */

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  function naturalCompare(a, b) {
    return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  }
  const normKey = (key) => String(key).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  const isHiddenName = (name) => name.startsWith('.') || name.startsWith('_') || name.startsWith('~');
  const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /** "01-kitchen.jpg" → { base: "01-kitchen", ext: ".jpg" } (like path.parse). */
  function splitName(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot).toLowerCase() } : { base: name, ext: '' };
  }

  const CAMERA_NAME = /^(?:img|dsc|dscn|dscf|pxl|mvimg|photo|image|pic|picture|screenshot|screen shot|whatsapp image|wa|snapchat|signal|telegram|fb img|received|p)[\s_-]*(?:\(\d+\)|\d)/i;
  function isCameraName(base) {
    const name = String(base).trim();
    if (!name) return true;
    if (CAMERA_NAME.test(name)) return true;
    if ((name.match(/\d/g) || []).length >= 6) return true;
    return !/\p{L}/u.test(name);
  }

  const CAPS = new Map(['tv', 'led', 'bwp', 'bwr', 'mr', 'mdf', 'hdf', 'pvc', 'wpc', 'pu', 'ac', 'diy', 'pop', 'cnc']
    .map((w) => [w, w.toUpperCase()]).concat([['upvc', 'uPVC']]));

  /** "01-master-wardrobe.jpg" → "Master wardrobe". Camera names → "". */
  function captionFromFilename(fileName) {
    const { base } = splitName(fileName);
    if (isCameraName(base)) return '';
    let s = base.replace(/^\s*\d+\s*[-_.)]\s*/, '').replace(/^0\d*\s+/, '');
    s = s.includes(' ') ? s.replace(/_+/g, ' ') : s.replace(/[-_]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s || !/\p{L}/u.test(s)) return '';
    s = s.replace(/\b(\d?)([a-z]+)\b/g, (word, digit, letters) => (CAPS.has(letters) ? digit + CAPS.get(letters) : /^\dbhk$/.test(word) ? word.toUpperCase() : word));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const ORDER_NUMBER = /^\s*\d+(?:\s*[-_.)]\s*|\s+)/;
  const normFolder = (name) => name.toLowerCase().replace(ORDER_NUMBER, '').replace(/[\s_-]+/g, ' ').trim();
  function titleFromFolder(name) {
    let s = name.replace(ORDER_NUMBER, '');
    s = s.includes(' ') ? s.replace(/_+/g, ' ') : s.replace(/[-_]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return capFirst(s || name);
  }

  const AMOUNT_UNITS = {
    k: 1e3, thousand: 1e3, thousands: 1e3,
    l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5,
    cr: 1e7, crore: 1e7, crores: 1e7,
  };
  function parseAmount(input) {
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

  function parsePriceLine(text) {
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

  /* ---------- Projects on GitHub ---------- */

  const INFO_FILE = /^info(\.txt)+$/i;
  const PROJECT_NUMBER = /^(?:project|proj|p)?[\s_.-]*(\d{1,3})(?!\d)/i;

  /**
   * Lists the project folders from the files on GitHub, numbered exactly like the website numbers them.
   * entries: [{ path, sha }] of every file in the repository.
   */
  function listProjects(entries, config) {
    const byFolder = new Map();
    for (const entry of entries) {
      const parts = String(entry.path).split('/');
      if (parts[0] !== 'projects' || parts.length < 3) continue;
      const folder = parts[1];
      if (!folder || isHiddenName(folder) || /^templates?$/i.test(folder)) continue;
      if (!byFolder.has(folder)) byFolder.set(folder, { rootFiles: [], filesIn: new Map(), names: [] });
      const p = byFolder.get(folder);
      const inside = parts.slice(2);
      p.names.push(inside[inside.length - 1]);
      if (inside.length === 1) {
        p.rootFiles.push({ name: inside[0], sha: entry.sha });
      } else {
        if (!p.filesIn.has(inside[0])) p.filesIn.set(inside[0], []);
        if (inside.length === 2) p.filesIn.get(inside[0]).push(inside[1]);
      }
    }
    const used = new Set();
    const projects = [...byFolder.keys()].sort(naturalCompare).map((folder) => {
      const p = byFolder.get(folder);
      const match = folder.match(PROJECT_NUMBER);
      const wanted = match ? Number(match[1]) : 0;
      let num = null;
      if (wanted > 0 && !used.has(wanted)) {
        used.add(wanted);
        num = wanted;
      }
      const info = p.rootFiles.filter((f) => INFO_FILE.test(f.name)).sort((a, b) => naturalCompare(a.name, b.name))[0];
      return {
        folder,
        num,
        info: info ? { path: `projects/${folder}/${info.name}`, sha: info.sha } : null,
        dirs: [...p.filesIn.keys()].filter((dir) => !isHiddenName(dir)).sort(naturalCompare),
        filesIn: p.filesIn,
        names: p.names,
        hasCover: p.rootFiles.some((f) => /^cover$/i.test(splitName(f.name).base) && config.photoExts.includes(splitName(f.name).ext)),
      };
    });
    projects.sort((a, b) => {
      if (a.num && b.num) return b.num - a.num;
      if (a.num || b.num) return a.num ? -1 : 1;
      return naturalCompare(a.folder, b.folder);
    });
    return { projects, next: Math.max(0, ...used) + 1 };
  }

  function projectLabel(project, config) {
    const known = (config.projects || []).find((p) => p.folder === project.folder);
    const title = known ? known.title : '';
    if (!project.num) return title || titleFromFolder(project.folder);
    return title ? `Project ${project.num} · ${title}` : `Project ${project.num}`;
  }

  /** Address of a project's page on the website, or the home page if it isn't known yet. */
  function projectUrl(folder, num, config) {
    const known = (config.projects || []).find((p) => p.folder === folder);
    const slug = known ? known.slug : num ? String(num) : '';
    return `${config.base}${slug ? `project/${slug}/` : ''}`;
  }

  /* ---------- Chapters and photo names ---------- */

  /** "1-Wood work" → "woodwork", "Before photos" → "before", "Pooja room" → "custom:pooja room". */
  function chapterKeyOf(folder, config) {
    const norm = normFolder(folder);
    if (config.beforeNames.includes(norm)) return 'before';
    if (config.afterNames.includes(norm)) return 'after';
    const def = config.chapters.find((c) => c.names.includes(norm));
    return def ? def.key : `custom:${norm}`;
  }

  function canonicalFolder(key, config) {
    if (key === 'before') return config.beforeNames[0];
    if (key === 'after') return config.afterNames[0];
    const def = config.chapters.find((c) => c.key === key);
    return def ? def.names[0] : '';
  }

  const WINDOWS_BAD = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
  const oneLine = (value) => String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = (s, max) => Array.from(s).slice(0, max).join('');

  /** A caption that is safe as a file name on Windows, phones and GitHub (it becomes part of the name). */
  function cleanCaption(text) {
    let s = oneLine(String(text == null ? '' : text).normalize('NFC')).replace(WINDOWS_BAD, ' ');
    s = s.replace(/\.(jpe?g|jfif|jpe|png|webp|heic|heif)$/i, '').replace(/\s+/g, ' ').trim();
    if (Array.from(s).length > 60) s = cut(s, 60).replace(/\s+\S*$/, '') || cut(s, 60);
    return s.replace(/[\s.]+$/, '');
  }

  /** A chapter name typed on the phone, made safe as a folder name. */
  function cleanFolderName(text) {
    let s = oneLine(String(text == null ? '' : text).normalize('NFC')).replace(WINDOWS_BAD, ' ').replace(/\s+/g, ' ').trim();
    s = cut(s.replace(/^[._~\s]+/, ''), 40).replace(/[\s.]+$/, '');
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = `${s} photos`;
    return s;
  }

  /** Which folder new photos go into. chapter: { key } or { key: 'custom', name } or { key: 'dir:<folder>' }. */
  function chapterFolder(project, chapter, config) {
    let key = chapter && chapter.key;
    let typed = '';
    if (!key) throw new UploadError('chapter');
    if (key === 'custom') {
      typed = cleanFolderName(chapter.name);
      if (!typed) throw new UploadError('chapter-name');
      key = chapterKeyOf(typed, config);
    } else if (key.startsWith('dir:')) {
      typed = key.slice(4);
      if (project.dirs.includes(typed)) return typed;
      key = chapterKeyOf(typed, config);
    }
    // Reuse the project's own folder for this chapter ("1-Wood work"), whatever its capitals.
    const existing = project.dirs.filter((dir) => chapterKeyOf(dir, config) === key)[0];
    if (existing) return existing;
    if (key.startsWith('custom:')) return typed;
    const folder = canonicalFolder(key, config);
    if (!folder) throw new UploadError('chapter');
    return folder;
  }

  /** The order number a name starts with: "07-kitchen.jpg" → 7, "3.jpg" → 3, "IMG_2041.jpg" → 0. */
  function orderNumber(name) {
    const match = splitName(name).base.match(/^\s*(\d{1,3})(?!\d)(?=\s*[-_.)\s]|$)/);
    return match ? Number(match[1]) : 0;
  }

  /** "3-Master wardrobe.jpg": the number keeps the order, the rest is the caption on the website. */
  const photoName = (number, caption, ext = '.jpg') => `${number}${caption ? `-${caption}` : ''}${ext}`;
  const captionKey = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

  /** Captions of the photos in the other half of before/after, offered as suggestions. */
  function partnerNames(project, key, config) {
    const other = key === 'before' ? 'after' : key === 'after' ? 'before' : '';
    if (!other || !project) return [];
    return project.dirs.filter((dir) => chapterKeyOf(dir, config) === other).flatMap((dir) => project.filesIn.get(dir) || []);
  }
  function partnerCaptions(project, key, config) {
    const seen = new Set();
    return partnerNames(project, key, config).map(captionFromFilename).filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
  }

  /**
   * File names for new photos in a folder. They continue the folder's numbering, never clash with a file
   * that is there (whatever its capitals), and an after photo with the same caption as a before photo
   * gets exactly that photo's name, so the website shows the two as a slider.
   */
  function namePhotos({ project, folder, photos, config }) {
    const key = chapterKeyOf(folder, config);
    const here = project.filesIn.get(folder) || [];
    const taken = new Set(here.map((n) => n.toLowerCase()));
    // A cover is found by name, so its name must not appear anywhere else in the project.
    const everywhere = new Set();
    const remember = (name) => {
      everywhere.add(name.toLowerCase());
      everywhere.add(splitName(name).base.toLowerCase());
    };
    project.names.forEach(remember);
    let next = Math.max(0, ...here.map(orderNumber)) + 1;
    const partners = partnerNames(project, key, config);
    return photos.map((photo) => {
      const caption = cleanCaption(photo.caption);
      // Photos are saved as JPEG; a browser that can only save PNG keeps that ending, so the name never lies.
      const ext = photo.ext || '.jpg';
      const free = (name) => !taken.has(name.toLowerCase()) && (!photo.cover || !everywhere.has(name.toLowerCase()));
      let name = '';
      if (caption) {
        const partner = partners.find((n) => captionKey(captionFromFilename(n)) === captionKey(caption) && free(`${splitName(n).base}${ext}`));
        if (partner) name = `${splitName(partner).base}${ext}`;
      }
      if (!name) {
        do {
          name = photoName(next++, caption, ext);
        } while (!free(name));
      }
      next = Math.max(next, orderNumber(name) + 1);
      taken.add(name.toLowerCase());
      remember(name);
      return name;
    });
  }

  /** Warning for a caption the website can't show (a file name with 6 or more digits reads as a camera name). */
  function captionProblem(caption, name) {
    if (!cleanCaption(caption) || captionFromFilename(name)) return '';
    return 'This caption has too many numbers to be shown on the website. Use fewer numbers, like “Wardrobe 8 ft”.';
  }

  /* ---------- info.txt ---------- */

  const FIELD_LABELS = {
    title: 'Title', area: 'Area', size: 'Size', days: 'Days', finished: 'Finished', type: 'Type', about: 'About',
    review: 'Review', reviewBy: 'Review by', video: 'Video', cover: 'Cover', priceNote: 'Note',
  };
  const KV = /^([^:=]*[^:=\s])\s*[:=]\s*(.*)$/;

  /** Reads info.txt line by line, the way parseKeyValueText in src/util.mjs does, keeping every line. */
  function scanInfo(text, config) {
    const known = new Set([...Object.values(config.infoFields).flat(), ...config.priceKeys]);
    const raw = String(text == null ? '' : text).replace(/^﻿/, '');
    const eol = /\r\n/.test(raw) ? '\r\n' : '\n';
    let section = null;
    const rows = raw.split(/\r\n|\r|\n/).map((original, index) => {
      const row = { text: original, index };
      const line = original.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return row;
      const match = line.match(KV);
      const key = match ? normKey(match[1]) : '';
      if (match && config.priceKeys.includes(key) && !match[2].trim()) {
        section = key;
        return Object.assign(row, { start: true, key });
      }
      if (section) {
        if (match && known.has(key)) section = null;
        else return Object.assign(row, { inSection: true, line });
      }
      if (!match) return row;
      return Object.assign(row, { entry: true, key, rawKey: match[1].trim(), value: match[2].trim() });
    });
    return { rows, eol, known };
  }

  /** The lines the website reads as the price (like priceLines and readPrice in src/content.mjs). */
  function priceRows(scan, config) {
    const first = scan.rows.find((r) => r.start);
    return scan.rows.filter((r) => r.inSection
      || (r.entry && config.priceKeys.includes(r.key) && r.value)
      || (first && r.entry && r.index > first.index && !scan.known.has(r.key) && parseAmount(r.value) != null));
  }

  const isTotalLine = (text) => {
    const entry = parsePriceLine(text);
    return Boolean(entry && /^(grand\s+)?total$/i.test(entry.item));
  };

  /** What the website shows from info.txt, as the values for the form. */
  function readInfo(text, config) {
    const scan = scanInfo(text, config);
    const fields = {};
    for (const row of scan.rows) if (row.entry) fields[row.key] = row.value;
    const values = {};
    for (const [name, aliases] of Object.entries(config.infoFields)) {
      const alias = aliases.find((a) => fields[a]);
      values[name] = alias ? fields[alias] : '';
    }
    const rows = priceRows(scan, config);
    const list = rows.filter((r) => !config.priceKeys.includes(r.key)).map((r) => (r.inSection ? r.line : `${r.rawKey} = ${r.value}`));
    const single = config.priceKeys.map((k) => fields[k]).find((v) => v && parseAmount(v) != null);
    if (single && !list.some(isTotalLine)) list.push(`Total = ${single}`);
    values.price = list.join('\n');
    return values;
  }

  const priceLinesOf = (text) => String(text == null ? '' : text).split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);

  /** Problems with a typed price list, as plain sentences (empty when it is fine). */
  function checkPrice(text, config) {
    const known = new Set([...Object.values(config.infoFields).flat(), ...config.priceKeys]);
    const problems = [];
    String(text == null ? '' : text).split(/\r\n|\r|\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;
      const match = line.match(KV);
      if (match && known.has(normKey(match[1]))) {
        problems.push(`Price list line ${i + 1}: “${match[1].trim()}” can't be used as an item name. Call it something else, like “${match[1].trim()} work”.`);
      } else if (!parsePriceLine(line)) {
        problems.push(`Price list line ${i + 1}: write it like   Wardrobe = 85000`);
      }
    });
    return problems;
  }

  /** "Title: old" → "Title: new", keeping how the owner wrote the name and the colon. */
  function withValue(text, value) {
    const match = text.match(/^(\s*[^:=]*[^:=\s]\s*[:=])([ \t]*)/);
    if (!match) return text;
    return value ? `${match[1]}${match[2] || ' '}${value}` : match[1];
  }

  /**
   * Changes info.txt in place: only the lines of the changed fields are touched, so notes (#),
   * spelling and anything the page doesn't know about stay as they were.
   * changes: { title: 'New title', price: 'Kitchen = 100\nDoors = 50', ... }
   */
  function updateInfo(text, changes, config) {
    if (!String(text == null ? '' : text).trim()) return newInfo(changes);
    const scan = scanInfo(text, config);
    const { rows } = scan;
    const replace = new Map();
    const before = new Map();
    const after = new Map();
    const atEnd = [];
    const add = (map, index, lines) => map.set(index, (map.get(index) || []).concat(lines));
    const firstStart = rows.find((r) => r.start);
    const limit = firstStart ? firstStart.index : rows.length;
    const fieldRows = rows.filter((r) => r.entry && r.index < limit && scan.known.has(r.key) && !config.priceKeys.includes(r.key));
    const lastField = fieldRows[fieldRows.length - 1];
    // A file that ends with a newline has an empty last row; new lines go before it.
    const end = rows.length > 1 && rows[rows.length - 1].text === '' ? rows.length - 1 : rows.length;
    const gap = end > 0 && rows[end - 1].text.trim() ? [''] : [];

    if (Object.prototype.hasOwnProperty.call(changes, 'price')) {
      const lines = priceLinesOf(changes.price);
      const old = priceRows(scan, config);
      old.forEach((r) => replace.set(r.index, []));
      if (lines.length) {
        const single = old.find((r) => config.priceKeys.includes(r.key));
        if (firstStart) add(after, firstStart.index, lines);
        else if (single) replace.set(single.index, [withValue(single.text, ''), ...lines]);
        else atEnd.push(...gap, 'Price:', ...lines);
      }
    }

    for (const [name, raw] of Object.entries(changes)) {
      const aliases = config.infoFields[name];
      if (name === 'price' || !aliases) continue;
      const value = oneLine(raw);
      const mine = rows.filter((r) => r.entry && aliases.includes(r.key));
      if (!value) {
        mine.forEach((r) => {
          if (r.value) replace.set(r.index, [withValue(r.text, '')]);
        });
        continue;
      }
      // The line the website reads today: the last line of the first name in the list that has a value.
      let target = null;
      for (const alias of aliases) {
        const last = mine.filter((r) => r.key === alias).pop();
        if (last && last.value) {
          target = last;
          break;
        }
      }
      target = target || mine[0];
      const line = `${FIELD_LABELS[name] || name}: ${value}`;
      if (target) replace.set(target.index, [withValue(target.text, value)]);
      else if (name === 'priceNote') atEnd.push(line);
      else if (lastField) add(after, lastField.index, [line]);
      else if (firstStart) add(before, firstStart.index, [line]);
      else atEnd.push(line);
    }

    const out = [];
    rows.forEach((row, i) => {
      if (i === end) out.push(...atEnd);
      if (before.has(i)) out.push(...before.get(i));
      out.push(...(replace.has(i) ? replace.get(i) : [row.text]));
      if (after.has(i)) out.push(...after.get(i));
    });
    if (end === rows.length) out.push(...atEnd);
    return out.join(scan.eol);
  }

  /** info.txt for a new project, laid out like projects/_template/info.txt. */
  function newInfo(values) {
    const v = (name) => oneLine(values[name]);
    const line = (name) => (v(name) ? `${FIELD_LABELS[name]}: ${v(name)}` : `${FIELD_LABELS[name]}:`);
    const lines = ['title', 'area', 'size', 'days', 'finished', 'type', 'about'].map(line);
    lines.push('', ...['review', 'reviewBy', 'video'].map(line));
    if (v('cover')) lines.push(line('cover'));
    lines.push('', 'Price:', ...priceLinesOf(values.price));
    if (v('priceNote')) lines.push(line('priceNote'));
    return `${lines.join('\n')}\n`;
  }

  /* ---------- One upload, worked out before anything is saved ---------- */

  class UploadError extends Error {
    constructor(kind, detail, status) {
      super(detail || kind);
      this.name = 'UploadError';
      this.kind = kind;
      this.status = status || 0;
    }
  }

  /**
   * Works out every file of one upload from the files on GitHub right now.
   * request: { project: NEW | folder, chapter, photos: [{ caption, cover }], changes: { field: value } }
   */
  function planUpload({ state, request, infoText = null, config }) {
    const isNew = request.project === NEW;
    const project = isNew
      ? { folder: `project-${state.next}`, num: state.next, info: null, dirs: [], filesIn: new Map(), names: [], hasCover: false }
      : state.projects.find((p) => p.folder === request.project);
    if (!project) throw new UploadError('gone');
    const photos = request.photos || [];
    const folder = photos.length ? chapterFolder(project, request.chapter, config) : '';
    const names = photos.length ? namePhotos({ project, folder, photos, config }) : [];
    const changes = Object.assign({}, request.changes);
    const coverAt = photos.findIndex((p) => p.cover);
    if (coverAt !== -1 && !project.hasCover) changes.cover = names[coverAt];

    let info = null;
    const changed = Object.keys(changes).length > 0;
    if (isNew || (changed && !project.info)) {
      info = { path: `projects/${project.folder}/info.txt`, text: newInfo(changes) };
    } else if (changed) {
      if (infoText == null) throw new UploadError('unexpected', 'info.txt was not read');
      const text = updateInfo(infoText, changes, config);
      if (text !== infoText) info = { path: project.info.path, text };
    }

    const count = `${photos.length} photo${photos.length === 1 ? '' : 's'}`;
    const what = [isNew && 'new project', names.length && `${count} in ${folder}`, !isNew && info && 'details updated'].filter(Boolean).join(', ');
    const message = names.length || isNew
      ? `Add photos from phone: ${project.folder} (${what})`
      : `Update details from phone: ${project.folder}`;
    return {
      isNew,
      folder: project.folder,
      num: project.num,
      chapterFolder: folder,
      names,
      paths: names.map((name) => `projects/${project.folder}/${folder}/${name}`),
      info,
      message,
    };
  }

  /** Names the photos would get with the files seen last (for warnings before publishing). */
  function previewNames(state, request, config) {
    try {
      const plan = planUpload({ state, request: Object.assign({}, request, { changes: {} }), infoText: '', config });
      return plan.names;
    } catch (err) {
      return (request.photos || []).map((p, i) => photoName(i + 1, cleanCaption(p.caption), p.ext));
    }
  }

  /* ---------- GitHub ---------- */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const defaultOnline = () => !(root.navigator && root.navigator.onLine === false);

  function errorKind(status, data, headers) {
    const message = String((data && data.message) || '');
    if (status === 401) return 'auth';
    if (status === 429 || (status === 403 && (headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(message)))) return 'rate';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'notfound';
    if (status === 409) return /empty/i.test(message) ? 'empty' : 'conflict';
    if (status === 413) return 'toolarge';
    if (status === 422 && /fast.?forward/i.test(message)) return 'conflict';
    if (status >= 500) return 'server';
    return 'unexpected';
  }

  /** How long to wait before trying again, or null when it isn't worth waiting on a phone. */
  function retryDelay(kind, headers, attempt) {
    if (kind === 'server') return 1000 * attempt * attempt;
    // GitHub's "slow down" answers usually ask for up to a minute's wait; longer than that, stop and say so.
    const after = Number(headers.get('retry-after'));
    if (after > 0) return after <= 60 ? after * 1000 : null;
    return null;
  }

  /**
   * Talks to the GitHub API with the owner's key. The key is only ever put in the Authorization header
   * of requests to api.github.com; it is never part of an address, logged or sent anywhere else.
   */
  function createClient({ token, repo, branch = 'main', fetchImpl, wait = sleep, isOnline = defaultOnline }) {
    if (!REPO.test(String(repo))) throw new UploadError('repo');
    const send = fetchImpl || ((url, init) => root.fetch(url, init));
    const repoPath = `/repos/${repo}`;
    const refPath = String(branch).split('/').map(encodeURIComponent).join('/');
    let asked = 0;

    async function call(method, path, body, { timeout = 30000, attempts = 3 } = {}) {
      for (let attempt = 1; ; attempt++) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
        let res;
        let data = null;
        try {
          // Only headers GitHub allows from a web page. (A cache setting would make some browsers add
          // Pragma and Cache-Control headers, which GitHub refuses; see head() for staying up to date.)
          res = await send(API + path, {
            method,
            headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }, body ? { 'Content-Type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller ? controller.signal : undefined,
          });
          const text = res.status === 204 ? '' : await res.text();
          try {
            data = text ? JSON.parse(text) : null;
          } catch (err) {
            data = null;
          }
        } catch (err) {
          if (!isOnline()) throw new UploadError('offline');
          if (attempt < attempts) {
            await wait(1000 * attempt * attempt);
            continue;
          }
          throw new UploadError(err && err.name === 'AbortError' ? 'timeout' : 'network');
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (res.ok) return data;
        const kind = errorKind(res.status, data, res.headers);
        const delay = attempt < attempts ? retryDelay(kind, res.headers, attempt) : null;
        if (delay != null) {
          await wait(delay);
          continue;
        }
        throw new UploadError(kind, data && data.message, res.status);
      }
    }

    const createBlob = async (base64, timeout) => (await call('POST', `${repoPath}/git/blobs`, { content: base64, encoding: 'base64' }, { timeout })).sha;
    // GitHub lets browsers keep its answers for a minute. Asking at a new address each time means a
    // second publish never builds on an old version. (Commits, trees and files never change, so they may be kept.)
    const branchCommit = async () => (await call('GET', `${repoPath}/git/ref/heads/${refPath}?fresh=${Date.now().toString(36)}${++asked}`)).object.sha;

    return {
      repo,
      branch,
      /** Run once when a key is pasted: can it read the repository, and save to it? */
      async checkAccess() {
        const info = await call('GET', repoPath);
        try {
          // A tiny file nothing points to: it shows the key may save, and GitHub tidies it away later.
          await call('POST', `${repoPath}/git/blobs`, { content: 'Checking the upload key.\n', encoding: 'utf-8' });
        } catch (err) {
          if (err.kind === 'notfound') throw new UploadError('forbidden', err.message, err.status);
          throw err;
        }
        return info;
      },
      async head() {
        const sha = await branchCommit();
        const commit = await call('GET', `${repoPath}/git/commits/${sha}`);
        return { commit: sha, tree: commit.tree.sha };
      },
      /** True when the commit is on the branch, even with a few newer saves on top of it. */
      async isSaved(commitSha) {
        let sha = await branchCommit();
        for (let i = 0; sha && i < 5; i++) {
          if (sha === commitSha) return true;
          const commit = await call('GET', `${repoPath}/git/commits/${sha}`);
          sha = commit.parents && commit.parents.length ? commit.parents[0].sha : '';
        }
        return false;
      },
      async files(treeSha) {
        const tree = await call('GET', `${repoPath}/git/trees/${treeSha}?recursive=1`, null, { timeout: 60000 });
        if (tree.truncated) throw new UploadError('toomany');
        return tree.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha }));
      },
      async readText(sha) {
        const blob = await call('GET', `${repoPath}/git/blobs/${sha}`);
        return decodeText(base64ToBytes(blob.content));
      },
      createBlob,
      async createTree(base, entries) {
        return (await call('POST', `${repoPath}/git/trees`, { base_tree: base, tree: entries.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha })) })).sha;
      },
      async createCommit(message, tree, parent) {
        return (await call('POST', `${repoPath}/git/commits`, { message, tree, parents: [parent] })).sha;
      },
      async moveBranch(sha) {
        await call('PATCH', `${repoPath}/git/refs/heads/${refPath}`, { sha, force: false });
      },
    };
  }

  /** Waiting time for one photo: a minute, plus time for a slow phone connection (about 25 KB a second). */
  const uploadTimeout = (base64Length) => 60000 + Math.round(base64Length / 25);

  const forget = (memo) => Object.keys(memo).forEach((key) => delete memo[key]);

  /**
   * Sends the photos, then saves everything as ONE commit on the branch: blobs → tree → commit → branch.
   * If something else was saved in the meantime (the computer, another phone), the files are worked out
   * again on top of it, so nothing is ever overwritten. photos[i].sha is kept, so a second try after a
   * lost connection doesn't send the photos that already arrived.
   * memo is kept by the page between tries: if the signal was lost just as GitHub saved, the next try
   * finds that save instead of saving the same photos twice. result.sent lists the photos that were saved.
   */
  async function publish({ client, config, request, photos, readBase64, onProgress = () => {}, memo = {} }) {
    if (memo.commit) {
      onProgress({ stage: 'check', done: 0, total: photos.length });
      const earlier = Object.assign({}, memo);
      if (await client.isSaved(earlier.commit)) {
        forget(memo);
        return Object.assign({}, earlier.plan, { commit: earlier.commit, tree: earlier.tree, sent: earlier.sent, earlier: true });
      }
      forget(memo);
    }
    const total = photos.length;
    for (let i = 0; i < total; i++) {
      onProgress({ stage: 'send', done: i, total });
      if (!photos[i].sha) {
        const base64 = await readBase64(photos[i]);
        photos[i].sha = await client.createBlob(base64, uploadTimeout(base64.length));
      }
    }
    onProgress({ stage: 'save', done: total, total });
    const wantsInfo = request.project !== NEW && (Object.keys(request.changes || {}).length > 0 || (request.photos || []).some((p) => p.cover));
    for (let attempt = 1; ; attempt++) {
      const head = await client.head();
      const state = listProjects(await client.files(head.tree), config);
      const project = state.projects.find((p) => p.folder === request.project);
      const infoText = wantsInfo && project && project.info ? await client.readText(project.info.sha) : null;
      const plan = planUpload({ state, request, infoText, config });
      const entries = plan.paths.map((path, i) => ({ path, sha: photos[i].sha }));
      if (plan.info) entries.push({ path: plan.info.path, sha: await client.createBlob(textToBase64(plan.info.text)) });
      if (!entries.length) return Object.assign(plan, { unchanged: true, commit: head.commit, tree: head.tree, sent: photos.slice() });
      const tree = await client.createTree(head.tree, entries);
      const commit = await client.createCommit(plan.message, tree, head.commit);
      Object.assign(memo, { commit, tree, plan, sent: photos.slice() });
      try {
        await client.moveBranch(commit);
      } catch (err) {
        // GitHub may have saved it and only the answer was lost; otherwise the branch moved meanwhile.
        if (!(await client.isSaved(commit).catch(() => false))) {
          if (err.kind === 'conflict') forget(memo);
          if (err.kind !== 'conflict' || attempt >= 3) throw err;
          continue;
        }
      }
      forget(memo);
      return Object.assign(plan, { commit, tree, sent: photos.slice() });
    }
  }

  /** Plain words for every problem the page can run into. */
  function describeError(err, repo, during = 'publish') {
    const kind = err && err.kind;
    const again = during === 'publish' ? 'tap Publish again' : 'try again';
    switch (kind) {
      case 'offline':
        return during === 'publish'
          ? 'No internet connection. Your photos are still here: tap Publish again when you have signal.'
          : 'No internet connection. Connect to the internet and try again.';
      case 'network':
      case 'timeout':
        return `Couldn't reach GitHub. Check your internet connection, then ${again}.${during === 'publish' ? ' Your photos are still here.' : ''}`;
      case 'auth':
        return during === 'connect'
          ? 'GitHub says this key is wrong or has expired. Check that you copied all of it, or make a new key.'
          : 'GitHub says the saved key is wrong or has expired. Paste a new key to carry on.';
      case 'forbidden':
        return `This key isn't allowed to save to ${repo}. Make a new key for this repository with “Contents: Read and write” (see the README).`;
      case 'notfound':
        return `GitHub can't find ${repo} with this key. Check that the key was made for this repository.`;
      case 'rate':
        return `GitHub is busy right now. Wait a minute, then ${again}.`;
      case 'conflict':
        return `Something else was saved to GitHub at the same moment. ${capFirst(again)}.`;
      case 'toolarge':
        return 'That was too much for GitHub in one go. Send fewer photos at a time.';
      case 'server':
        return 'GitHub is having problems right now. Try again in a few minutes.';
      case 'empty':
        return "Your website isn't on GitHub yet. Put it online from your computer first (see the README).";
      case 'gone':
        return "This project isn't on GitHub any more (it may have been renamed). Reload the page and choose it again.";
      case 'toomany':
        return 'There are too many files on GitHub for this page to read.';
      case 'chapter':
        return 'Choose what the photos are of.';
      case 'chapter-name':
        return 'Type a name for the new chapter.';
      default:
        return `Something went wrong${err && err.message ? ` (${String(err.message).slice(0, 160)})` : ''}. ${capFirst(again)}.`;
    }
  }

  /** "github_pat_…" (fine-grained) or "ghp_…" (classic) keys. Returns a problem, or '' when it looks right. */
  function checkKeyFormat(token) {
    if (!token) return 'Paste your GitHub key first.';
    if (!/^(github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}$/.test(token)) return 'This doesn’t look like a GitHub key. It starts with github_pat_ and is about 90 letters and numbers long.';
    return '';
  }

  /* ---------- Photos on the phone ---------- */

  const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.3gp', '.webm', '.m4v', '.wmv'];
  const megabytes = (bytes) => Math.round(bytes / (1024 * 1024));

  /** A problem with a chosen file that is clear before opening it, or null. */
  function checkFile(file) {
    const { ext } = splitName(String(file.name || ''));
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('video/') || VIDEO_EXTS.includes(ext)) {
      return { kind: 'video', text: 'Videos are too big for the website. Put the video on YouTube and add its link under “YouTube link”.' };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { kind: 'toobig', text: `This photo is too big (${megabytes(file.size)} MB; the most is ${megabytes(MAX_FILE_BYTES)} MB). Choose a smaller one, or send it to yourself on WhatsApp and use that copy.` };
    }
    if (type && !type.startsWith('image/')) return { kind: 'notphoto', text: 'This isn’t a photo.' };
    return null;
  }

  function unreadableText(file) {
    const { ext } = splitName(String((file && file.name) || ''));
    const type = String((file && file.type) || '').toLowerCase();
    if (ext === '.heic' || ext === '.heif' || /heic|heif/.test(type)) {
      return 'This is an iPhone HEIC photo, which this browser can’t open. Send it to yourself on WhatsApp and use that copy.';
    }
    return 'This photo couldn’t be opened. Try another photo, or send it to yourself on WhatsApp and use that copy.';
  }

  const tooManyPixelsText = (width, height) => `This photo is too big to prepare on a phone (${Math.round((width * height) / 1e6)} megapixels). Take photos in the normal camera mode, or send it to yourself on WhatsApp and use that copy.`;

  /** The size a photo is made: at most `max` pixels on its longest side, never bigger than it was. */
  function fitInside(width, height, max) {
    if (width <= max && height <= max) return { width, height };
    const scale = max / Math.max(width, height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  /* ---------- Small helpers ---------- */

  function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return root.btoa(binary);
  }
  function base64ToBytes(base64) {
    const binary = root.atob(String(base64).replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const textToBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));

  /** Reads a text file written by any editor (UTF-8, with or without BOM, or Notepad's UTF-16). */
  function decodeText(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    const text = new TextDecoder('utf-8').decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  /** The repository this website comes from: built in by GitHub, or worked out from a github.io address. */
  function findRepo(config, location) {
    if (config.repo && REPO.test(config.repo)) return config.repo;
    const host = String((location && location.hostname) || '').toLowerCase();
    if (!host.endsWith('.github.io')) return '';
    const owner = host.slice(0, -'.github.io'.length);
    const first = String(config.base || '/').split('/').filter(Boolean)[0];
    const repo = first ? `${owner}/${first}` : `${owner}/${host}`;
    return REPO.test(repo) ? repo : '';
  }

  root.WoodworkUpload = {
    NEW,
    MAX_PHOTOS,
    MAX_PIXELS,
    MAX_FILE_BYTES,
    naturalCompare,
    captionFromFilename,
    isCameraName,
    parseAmount,
    parsePriceLine,
    titleFromFolder,
    listProjects,
    projectLabel,
    projectUrl,
    chapterKeyOf,
    chapterFolder,
    cleanCaption,
    cleanFolderName,
    orderNumber,
    namePhotos,
    partnerCaptions,
    captionProblem,
    readInfo,
    updateInfo,
    newInfo,
    checkPrice,
    planUpload,
    previewNames,
    UploadError,
    createClient,
    uploadTimeout,
    publish,
    describeError,
    checkKeyFormat,
    checkFile,
    unreadableText,
    tooManyPixelsText,
    fitInside,
    bytesToBase64,
    base64ToBytes,
    textToBase64,
    decodeText,
    findRepo,
  };
})(globalThis);
