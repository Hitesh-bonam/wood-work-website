// The upload page (admin/): add a project, or photos to a project, straight from a phone.
// It is never linked from the website and asks search engines not to list it. Its script is
// src/assets/admin.js and its rules are in src/assets/admin-core.js. See "Add photos from your phone" in README.md.
import { esc, scriptJson, PHOTO_EXTS } from './util.mjs';
import { CHAPTER_DEFS, INFO_FIELDS, PRICE_KEYS, BEFORE_NAMES, AFTER_NAMES } from './content.mjs';
import { SOURCE_MAX } from './photos.mjs';
import { DEFAULT_FAVICON } from './pages.mjs';

export const ADMIN_PAGE = 'admin/index.html';
export const ADMIN_ASSETS = ['admin.css', 'admin-core.js', 'admin.js'];
/** JPEG quality of the photos made on the phone (the computer tidies photos at 84 too). */
const QUALITY = 0.84;

// The page holds the GitHub key, so it may only run its own scripts and only talk to this website and
// api.github.com. Inline styles are allowed because Safari's own drop-down menu (<select>) uses one.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self' https://api.github.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const CHAPTERS = [
  ['before', 'Before'],
  ['after', 'After'],
  ['woodwork', 'Woodwork'],
  ['painting', 'Painting'],
  ['repairs', 'Repairs'],
  ['team', 'Team at work'],
  ['quality', 'Quality close-ups'],
  ['materials', 'Materials'],
  ['photos', 'Other photos'],
];

const FIELDS = [
  { key: 'title', label: 'Title', placeholder: '3BHK full interior' },
  { key: 'area', label: 'Area', placeholder: 'Green Park', hint: 'Only the area, never the address.' },
  { key: 'size', label: 'Size of the home', placeholder: '3BHK, 1,850 sq ft' },
  { key: 'days', label: 'Days it took', placeholder: '42', inputmode: 'numeric' },
  { key: 'finished', label: 'Finished', placeholder: 'Sep 2026' },
  { key: 'type', label: 'Type of work', placeholder: 'Wardrobes, Kitchens', hint: 'Separate with commas. These become the filter buttons on your website.' },
  { key: 'about', label: 'About this project', rows: 3 },
  { key: 'review', label: 'What the client said', rows: 3 },
  { key: 'reviewBy', label: 'Review by', placeholder: 'Homeowner, Green Park', hint: 'Not the client’s name.' },
  { key: 'video', label: 'YouTube link', type: 'url', placeholder: 'https://youtu.be/…' },
  { key: 'price', label: 'Price list', rows: 4, placeholder: 'Wardrobes = 1,92,000\nModular kitchen = 1,45,000', hint: 'One item per line. Leave it empty to show no price.' },
  { key: 'priceNote', label: 'Price note', placeholder: 'GST extra' },
];

function fieldHtml(f) {
  const id = `up-f-${f.key}`;
  const described = [f.hint && `${id}-hint`, f.key === 'price' && `${id}-err`].filter(Boolean).join(' ');
  const common = `id="${id}" data-field="${f.key}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${described ? ` aria-describedby="${described}"` : ''}`;
  const control = f.rows
    ? `<textarea ${common} rows="${f.rows}" autocapitalize="sentences"></textarea>`
    : `<input ${common} type="${f.type || 'text'}"${f.inputmode ? ` inputmode="${f.inputmode}"` : ''}${f.type === 'url' ? ' autocapitalize="off" spellcheck="false"' : ' autocapitalize="sentences"'} autocomplete="off">`;
  return `<div class="field"><label for="${id}">${esc(f.label)}</label>${control}${f.hint ? `<p class="hint" id="${id}-hint">${esc(f.hint)}</p>` : ''}${f.key === 'price' ? `<p class="err" id="${id}-err" hidden></p>` : ''}</div>`;
}

/** Everything the page's script needs to follow the website's own rules (see src/content.mjs). */
export function adminConfig({ repo = '', base = '/', projects = [] } = {}) {
  return {
    repo,
    base,
    maxSide: SOURCE_MAX,
    quality: QUALITY,
    photoExts: [...PHOTO_EXTS],
    chapters: CHAPTER_DEFS.filter((def) => def.names).map(({ key, title, names }) => ({ key, title, names })),
    beforeNames: BEFORE_NAMES,
    afterNames: AFTER_NAMES,
    infoFields: INFO_FIELDS,
    priceKeys: PRICE_KEYS,
    projects: projects.map((p) => ({ folder: p.folder, slug: p.slug, title: p.title })),
  };
}

/**
 * @param {object} ctx
 * @param {object} ctx.business  from site/business.txt
 * @param {object|null} ctx.logo logo files (see makeLogoFiles)
 * @param {string} ctx.base      path the site lives under, like "/website/"
 * @param {string} ctx.version   cache-busting version of the assets
 * @param {string} ctx.repo      "owner/name" on GitHub ('' when not known yet)
 * @param {object[]} ctx.projects projects on the website (for their titles)
 */
export function renderAdminPage(ctx) {
  const u = (p = '') => ctx.base + String(p).replace(/^\/+/, '');
  const asset = (name) => esc(`${u(`assets/${name}`)}?v=${ctx.version}`);
  const b = ctx.business;
  const icons = ctx.logo
    ? `<link rel="icon" type="image/png" href="${esc(u(`assets/photos/${ctx.logo.icon}`))}"><link rel="apple-touch-icon" href="${esc(u(`assets/photos/${ctx.logo.apple}`))}">`
    : `<link rel="icon" href="${DEFAULT_FAVICON}">`;
  const brand = ctx.logo
    ? `<img src="${esc(u(`assets/photos/${ctx.logo.logo}`))}" width="${ctx.logo.logoW}" height="${ctx.logo.logoH}" alt=""><span>${esc(b.name)}</span>`
    : `<span>${esc(b.name)}</span>`;
  // No branch here: the page saves to the repository's default branch, as GitHub reports it.
  const config = adminConfig({ repo: ctx.repo || '', base: ctx.base, projects: ctx.projects });
  const chips = CHAPTERS.map(([value, label]) => `<label class="tier"><input type="radio" name="chapter" value="${value}"><span>${esc(label)}</span></label>`).join('');
  const help = ctx.repo ? `https://github.com/${ctx.repo}#add-photos-from-your-phone` : 'https://github.com/';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(`Add photos | ${b.name}`)}</title>
<meta name="theme-color" content="#FAF7F2">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Add photos">
${icons}
<link rel="stylesheet" href="${asset('app.css')}">
<link rel="stylesheet" href="${asset('admin.css')}">
<script src="${asset('admin-core.js')}" defer></script>
<script src="${asset('admin.js')}" defer></script>
</head>
<body class="page-admin">
<header class="top"><div class="top-in"><a class="brand" href="${esc(u(''))}">${brand}</a></div></header>
<main id="main" class="wrap up">
<h1>Add photos</h1>
<p class="up-lead">Add a new project, or more photos to a project, straight from your phone.</p>
<noscript><p class="up-alert">This page needs JavaScript. Turn it on in your browser’s settings.</p></noscript>
<p class="up-alert" id="up-alert" role="alert" hidden></p>

<div class="up-loading" id="up-loading" hidden><p class="up-status" id="up-loading-text" role="status">Loading your projects…</p><button class="btn big" id="up-retry" type="button" hidden>Try again</button></div>

<section class="card" id="up-norepo" aria-labelledby="up-norepo-h" hidden>
<h2 id="up-norepo-h">Not on GitHub yet</h2>
<p>This page works once your website is on GitHub. See “Put the website online” in README.md, then open this page on your website’s address.</p>
</section>

<form class="card" id="up-connect" aria-labelledby="up-connect-h" novalidate hidden>
<h2 id="up-connect-h">Connect this phone</h2>
<div class="up-again" id="up-key-again" hidden>
<p class="up-alert" id="up-key-again-text" role="alert"></p>
<div class="up-again-btns"><button class="btn primary big" id="up-key-retry" type="button">Try again</button><button class="btn big" id="up-key-new" type="button">Paste a new key</button></div>
</div>
<p>Paste the key you made on GitHub. This phone remembers it, so you only do this once.</p>
<div class="field"><label for="up-key">Your GitHub key</label>
<input id="up-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="github_pat_…" aria-describedby="up-key-help up-key-err">
<p class="hint" id="up-key-help">No key yet? <a id="up-help-link" href="${esc(help)}" target="_blank" rel="noopener">How to make one</a>, in your website’s README.</p>
<p class="err" id="up-key-err" role="alert" hidden></p></div>
<button class="btn primary big up-wide" id="up-connect-btn" type="submit">Connect</button>
</form>

<form id="up-form" novalidate hidden>
<section class="card" aria-labelledby="up-s1">
<h2 id="up-s1">1. Which project?</h2>
<div class="field"><label for="up-project">Project</label><select id="up-project"></select></div>
</section>

<section class="card" aria-labelledby="up-s2">
<h2 id="up-s2">2. What are the photos of?</h2>
<fieldset class="up-chapters" aria-labelledby="up-s2" aria-describedby="up-chapter-hint">
<div class="up-chips" id="up-chips">${chips}<label class="tier" id="up-custom-chip"><input type="radio" name="chapter" value="custom"><span>New chapter…</span></label></div>
</fieldset>
<div class="field" id="up-custom-field" hidden><label for="up-custom">Name of the new chapter</label><input id="up-custom" type="text" maxlength="40" autocomplete="off" autocapitalize="sentences" placeholder="Pooja room"></div>
<p class="hint" id="up-chapter-hint" hidden></p>
</section>

<section class="card" aria-labelledby="up-s3">
<h2 id="up-s3">3. Add photos</h2>
<div class="up-pick">
<label class="btn primary big up-pick-btn"><input class="up-file" id="up-gallery" type="file" accept="image/*" multiple><span>Choose photos</span></label>
<label class="btn big up-pick-btn"><input class="up-file" id="up-camera" type="file" accept="image/*" capture="environment"><span>Take a photo</span></label>
</div>
<p class="hint">Before anything is sent, photos are made smaller and their location (GPS) is removed. They wait on this phone until you publish them.</p>
<p class="up-status" id="up-photo-status" role="status"></p>
<p class="hint up-restored" id="up-restored" role="status" hidden></p>
<p class="err" id="up-photo-err" role="alert" hidden></p>
<ol class="up-photos" id="up-photos"></ol>
<button class="btn up-clear" id="up-clear" type="button" hidden>Clear all photos</button>
<datalist id="up-captions"></datalist>
</section>

<section class="card" aria-labelledby="up-s4">
<details class="up-details" id="up-details">
<summary><h2 id="up-s4">4. Project details <span class="up-opt">(optional)</span></h2></summary>
<p class="hint">Everything here is public. Never write a client’s name, phone number or exact address.</p>
<p class="up-status" id="up-details-status" role="status" hidden></p>
<div class="up-fields" id="up-fields">
${FIELDS.map(fieldHtml).join('\n')}
</div>
</details>
</section>

<div class="up-send">
<p class="err" id="up-send-err" role="alert" hidden></p>
<button class="btn primary big up-wide" id="up-publish" type="button">Publish</button>
<p class="hint">Your website updates about 2 minutes after you publish.</p>
</div>
</form>

<section class="card" id="up-progress" aria-labelledby="up-progress-h" hidden>
<h2 id="up-progress-h">Publishing…</h2>
<progress id="up-bar" max="100" value="0" aria-labelledby="up-progress-h"></progress>
<p class="up-status" id="up-progress-text" role="status"></p>
<p class="hint">Keep this page open until it says Done.</p>
</section>

<section class="card" id="up-done" aria-labelledby="up-done-h" tabindex="-1" hidden>
<h2 id="up-done-h">Done!</h2>
<p id="up-done-text"></p>
<div class="btn-row up-done-btns"><a class="btn primary big" id="up-done-link" href="${esc(u(''))}">See your website</a><button class="btn big" id="up-again" type="button">Add more photos</button></div>
</section>

<footer class="up-foot" id="up-foot" hidden>
<p>Saving to <strong id="up-repo"></strong> on GitHub.</p>
<button class="btn" id="up-forget" type="button">Forget this phone</button>
</footer>
</main>
<script type="application/json" id="up-config">${scriptJson(config)}</script>
</body>
</html>
`;
}
