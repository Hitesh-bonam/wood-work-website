// HTML for every page, in English (at the site root) and Telugu (under te/). Each function returns a
// string; all text from the owner goes through esc(), and the website's own words go through t().
import { esc, scriptJson, formatMoney } from './util.mjs';
import { LANGS, translator, scriptDictionary } from './i18n.mjs';

const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z"/><circle cx="8.5" cy="8.5" r="1.6"/>',
  box: '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M4.3 7.8 12 12l7.7-4.2M12 12v8.6"/>',
  phone: '<path d="M5 4h3.6l1.8 4.5-2.2 1.4a11.5 11.5 0 0 0 5.9 5.9l1.4-2.2L20 15.4V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  wa: '<path d="M4.5 19.5 5.7 16a8 8 0 1 1 3 2.6z"/><path stroke-width="1.6" d="M9.4 9.1c0 2.9 2.6 5.5 5.5 5.5l1-1.5-2-1-.9.8a4.7 4.7 0 0 1-2-2l.8-.9-1-2z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevL: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevD: '<path d="M6 9.5 12 15.5l6-6"/>',
  arrowR: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>',
  facebook: '<path d="M14.5 8.5H17V5h-2.5a4 4 0 0 0-4 4v2.5H8V15h2.5v6H14v-6h2.5l.5-3.5h-3V9.3a.8.8 0 0 1 .8-.8z"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z"/>',
  // Service icons: cabinet, ceiling light, paint roller, glass panes
  cabinet: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M12 3.5v17M4 11.5h16M9.5 7.5v1.5M14.5 7.5v1.5M9.5 15v1.5M14.5 15v1.5"/>',
  ceiling: '<path d="M3 4.5h18M12 4.5v4"/><path d="M7 14a5 5 0 0 1 10 0z"/><path d="M10.5 17.5h3M12 14v3.5"/>',
  roller: '<rect x="3.5" y="3.5" width="14" height="5" rx="1.5"/><path d="M17.5 6H20v5.5h-8V14"/><rect x="10.5" y="14" width="3" height="6.5" rx="1"/>',
  panes: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M12 3.5v17M3.5 12h17M6.5 9l3-3M14.5 17l3-3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
const SERVICE_ICONS = ['cabinet', 'ceiling', 'roller', 'panes'];

export function icon(name) {
  return `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

/** The two letters on the monogram: "Deva Deva Interio" → "DD". */
export function initials(name) {
  const words = String(name || '').split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || 'W').slice(0, 2)).toUpperCase();
}

/** Browser-tab icon: the monogram, drawn as SVG (used when there is no site/logo.png). */
export function monogramIcon(name) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#2B211B'/><rect x='5' y='5' width='54' height='54' rx='10' fill='none' stroke='#C49A5A' stroke-width='2'/><text x='32' y='42' font-family='Georgia, serif' font-size='27' font-weight='700' text-anchor='middle' fill='#F3E7D3' letter-spacing='1'>${initials(name)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export const DEFAULT_FAVICON = monogramIcon('W');

const TILE_SIZES = '(min-width: 1180px) 190px, (min-width: 1024px) 16vw, (min-width: 640px) 19vw, 24vw';
const BA_SIZES = '(min-width: 960px) 900px, 100vw';
const NAV_SHORT = { 'before-after': 'Compare', team: 'Team', quality: 'Quality', materials: 'Materials' };

function helpers(ctx, lang) {
  const b = ctx.business;
  const t = translator(lang);
  const prefix = lang === 'en' ? '' : `${lang}/`;
  const clean = (p) => String(p).replace(/^\/+/, '');
  // Pages are per language; photos, styles and scripts are shared.
  const u = (p = '') => ctx.base + prefix + clean(p);
  const asset = (p = '') => ctx.base + clean(p);
  const abs = (p = '') => (ctx.siteUrl ? `${ctx.siteUrl}/${prefix}${clean(p)}` : '');
  const absAsset = (p = '') => (ctx.siteUrl ? `${ctx.siteUrl}/${clean(p)}` : '');
  const photo = (name) => asset(`assets/photos/${name}`);
  const count = (n, one, many) => t(n === 1 ? one : many, { n });
  const photos = (n) => count(n, '1 photo', '{n} photos');
  const showPricing = ctx.rates.services.length > 0 || ctx.projects.some((p) => p.price);
  const nav = [
    { key: 'gallery', href: '', label: t('Gallery'), icon: 'grid' },
    showPricing && { key: 'pricing', href: 'pricing/', label: t('Pricing'), icon: 'tag' },
    ctx.materials.length > 0 && { key: 'materials', href: 'materials/', label: t('Materials'), icon: 'box' },
    { key: 'contact', href: 'contact/', label: t('Contact'), icon: 'phone' },
  ].filter(Boolean);
  // Folders without a number (see content.mjs) are named after the folder instead of "Project N".
  const projectName = (p) => (p.num ? (p.title ? `${t('Project {n}', { n: p.num })} · ${p.title}` : t('Project {n}', { n: p.num })) : p.title || p.folderTitle);
  const ref = (p) => (p.num ? t('Project {n}', { n: p.num }) : projectName(p));
  const alt = (p, project) => {
    // A before or after photo says so, wherever it is shown (the gallery, the viewer, the story).
    const tag = p.label || (['Before', 'After'].includes(p.chapterTitle) ? p.chapterTitle : '');
    const what = p.caption ? (tag ? `${t(tag)}: ${p.caption}` : p.caption) : p.chapterTitle ? (p.chapterTitle === 'Before' || p.chapterTitle === 'After' ? t(`${p.chapterTitle} photo`) : `${t(p.chapterTitle)} · ${t('Photo')}`) : t('Photo');
    // Named after the project's title and area when it has one ("Modular kitchen, Gachibowli"), so the
    // description means something to Google Images and to people using screen readers.
    const where = project ? (project.title ? [project.title, project.area].filter(Boolean).join(', ') : ref(project)) : '';
    return where ? `${what}, ${where}` : what;
  };
  return {
    lang,
    t,
    u,
    asset,
    abs,
    absAsset,
    photo,
    photos,
    count,
    showPricing,
    nav,
    projectName,
    ref,
    alt,
    tagline: lang === 'te' && b.taglineTe ? b.taglineTe : b.tagline,
    about: lang === 'te' && b.aboutTe ? b.aboutTe : b.about,
    money: (n) => esc(formatMoney(n, b.currency)),
    wa: (text) => (b.wa ? `https://wa.me/${b.wa}?text=${encodeURIComponent(text)}` : ''),
    item: (p, project) => ({ s: photo(p.s.name), l: photo(p.l.name), v: (p.v || [p.l]).map((x) => [photo(x.name), x.w]), w: p.l.w, h: p.l.h, c: p.caption || '', ch: p.chapterTitle ? t(p.chapterTitle) : '', alt: alt(p, project) }),
  };
}

/**
 * A photo with every web size listed, so each screen downloads only what it needs. Photos that are not
 * on the first screen show their small version and get the other sizes only when they come near
 * (see "Photos load as you scroll" in app.js), so a long project page doesn't download everything at once.
 */
function img(h, p, { sizes = '100vw', alt = '', eager = false, cls = '', single = false } = {}) {
  const v = p.v || [p.s, p.l].filter(Boolean);
  const shape = v[v.length - 1];
  const set = !single && v.length > 1 ? v.map((x) => `${h.photo(x.name)} ${x.w}w`).join(', ') : '';
  const src = eager && !single ? v[Math.min(1, v.length - 1)] : v[0];
  const attrs = eager
    ? `${set ? ` srcset="${esc(set)}" sizes="${esc(sizes)}"` : ''} fetchpriority="high"`
    : `${set ? ` data-srcset="${esc(set)}" data-sizes="${esc(sizes)}"` : ''} loading="lazy"`;
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(h.photo(src.name))}"${attrs} width="${shape.w}" height="${shape.h}" alt="${esc(alt)}" decoding="async">`;
}

function waButton(href, label, extra = '') {
  return href ? `<a class="btn wa${extra}" href="${esc(href)}">${icon('wa')}<span>${esc(label)}</span></a>` : '';
}

function callButton(b, label, extra = '') {
  return b.tel ? `<a class="btn${extra}" href="tel:${esc(b.tel)}">${icon('phone')}<span>${esc(label)}</span></a>` : '';
}

/** The text logo: a monogram and the name, with the last word set small in spaced capitals. */
function textLogo(b) {
  const words = String(b.name).trim().split(/\s+/);
  const main = words.length > 1 ? words.slice(0, -1).join(' ') : words[0];
  const last = words.length > 1 ? words[words.length - 1] : '';
  return `<span class="mono" aria-hidden="true">${esc(initials(b.name))}</span><span class="brand-txt"><span class="bn">${esc(main)}</span>${last ? ` <span class="bs">${esc(last)}</span>` : ''}</span>`;
}

function layout(ctx, h, { page, title, description, path = '', share = '', body, head = '' }) {
  const b = ctx.business;
  const { t } = h;
  const docTitle = title ? `${title} | ${b.name}` : h.tagline ? `${b.name} | ${h.tagline}` : b.name;
  const url = h.abs(path);
  const shareUrl = share ? h.absAsset(`assets/photos/${share}`) : '';
  const icons = ctx.logo
    ? `<link rel="icon" type="image/png" href="${esc(h.photo(ctx.logo.icon))}"><link rel="apple-touch-icon" href="${esc(h.photo(ctx.logo.apple))}">`
    : `<link rel="icon" href="${esc(monogramIcon(b.name))}">`;
  const current = (n) => (n.key === page ? ' aria-current="page"' : '');
  const brand = ctx.logo
    ? `<img src="${esc(h.photo(ctx.logo.logo))}" width="${ctx.logo.logoW}" height="${ctx.logo.logoH}" alt=""><span>${esc(b.name)}</span>`
    : textLogo(b);
  // The same page in the other language (404 has only one version, so it links to the other home).
  const other = h.lang === 'en' ? 'te' : 'en';
  const otherHref = ctx.base + (other === 'en' ? '' : `${other}/`) + (page === '404' ? '' : path);
  // Narrow phones show the short label ("తె" / "EN"), so the business name keeps its room.
  const otherName = other === 'te' ? 'తెలుగు' : 'English';
  const langLink = `<a class="lang" href="${esc(otherHref)}" hreflang="${other}" lang="${other}"><span class="l-long">${otherName}</span><span class="l-short" aria-hidden="true">${other === 'te' ? 'తె' : 'EN'}</span></a>`;
  const topActions = [
    langLink,
    b.tel ? `<a class="btn icon" href="tel:${esc(b.tel)}" aria-label="${esc(t('Call us'))}">${icon('phone')}</a>` : '',
    b.wa ? `<a class="btn wa top-wa" href="${esc(h.wa(`Hi ${b.name}, I found your website and I'd like to ask about work for my home.`))}" aria-label="${esc(t('WhatsApp us'))}">${icon('wa')}<span class="lbl">${esc(t('WhatsApp'))}</span></a>` : '',
  ].join('');
  const footContact = [
    b.tel ? `<a href="tel:${esc(b.tel)}">${icon('phone')}${esc(b.phone)}</a>` : '',
    b.email ? `<a href="mailto:${esc(b.email)}">${icon('mail')}${esc(b.email)}</a>` : '',
    b.address ? `<span>${icon('pin')}${esc(b.address)}</span>` : '',
    b.hours ? `<span>${icon('clock')}${esc(b.hours)}</span>` : '',
  ].filter(Boolean).join('');
  const alternates = page === '404' || !ctx.siteUrl ? '' : LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(`${ctx.siteUrl}/${l === 'en' ? '' : `${l}/`}${path}`)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${esc(`${ctx.siteUrl}/${path}`)}">`;
  const meta = [
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(b.name)}">`,
    // WhatsApp shows og:title but not the site name, so the business name is part of it.
    `<meta property="og:title" content="${esc(docTitle)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:locale" content="${h.lang === 'te' ? 'te_IN' : 'en_IN'}">`,
    shareUrl ? `<meta property="og:image" content="${esc(shareUrl)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : '',
    url && page !== '404' ? `<meta property="og:url" content="${esc(url)}"><link rel="canonical" href="${esc(url)}">` : '',
    alternates,
    b.googleVerification ? `<meta name="google-site-verification" content="${esc(b.googleVerification)}">` : '',
  ].filter(Boolean).join('\n');
  const words = scriptDictionary(h.lang);
  const parent = b.parent ? `<p class="foot-parent">${esc(t('A {company} company', { company: b.parent }))}</p>` : '';
  return `<!doctype html>
<html lang="${h.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(docTitle)}</title>
${meta}
<meta name="theme-color" content="#F7F3EE">
${icons}
<link rel="stylesheet" href="${esc(h.asset('assets/app.css'))}?v=${ctx.version}">
${head}
</head>
<body class="page-${page} lang-${h.lang}">
<a class="skip" href="#main">${esc(t('Skip to content'))}</a>
<header class="top">
<div class="top-in">
<a class="brand" href="${esc(h.u(''))}">${brand}</a>
<nav class="nav-desk" aria-label="${esc(t('Main'))}">${h.nav.map((n) => `<a href="${esc(h.u(n.href))}"${current(n)}>${esc(n.label)}</a>`).join('')}</nav>
<div class="top-act">${topActions}</div>
</div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="foot">
<div class="wrap foot-in">
<div class="foot-brand"><p class="foot-name">${ctx.logo ? esc(b.name) : textLogo(b)}</p>${parent}${h.tagline ? `<p class="foot-tag">${esc(h.tagline)}</p>` : ''}</div>
${footContact ? `<div class="foot-contact">${footContact}</div>` : ''}
<p class="foot-small">&copy; ${ctx.year} ${esc(b.name)}${b.parent ? ` · ${esc(b.parent)}` : ''}</p>
</div>
</footer>
<nav class="tabbar" aria-label="${esc(t('Main menu'))}">${h.nav.map((n) => `<a href="${esc(h.u(n.href))}"${current(n)}>${icon(n.icon)}<span>${esc(n.label)}</span></a>`).join('')}</nav>
${words ? `<script type="application/json" id="i18n">${scriptJson(words)}</script>` : ''}
<script src="${esc(h.asset('assets/app.js'))}?v=${ctx.version}" defer></script>
${ctx.dev ? '<script src="/__dev/reload.js"></script>' : ''}
</body>
</html>
`;
}

function collectTypes(projects) {
  const order = ['full home', 'kitchens', 'kitchen', 'wardrobes', 'wardrobe', 'woodwork', 'painting', 'repairs'];
  const found = new Map();
  for (const p of projects) {
    for (const ty of p.types) {
      if (!found.has(ty.toLowerCase())) found.set(ty.toLowerCase(), ty);
    }
  }
  return [...found.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    })
    .map(([, label]) => label);
}

function projectTitleHtml(h, p) {
  if (!p.num) return esc(p.title || p.folderTitle);
  return `<span class="pj-num">${esc(h.t('Project {n}', { n: p.num }))}</span>${p.title ? ` · ${esc(p.title)}` : ''}`;
}

function projectBlock(h, p, position) {
  const { t } = h;
  const url = h.u(`project/${p.slug}/`);
  const total = p.allPhotos.length;
  const meta = [p.area, p.days, h.photos(total)].filter(Boolean).map(esc).join(' · ');
  const tiles = p.row
    .map((photo, k) => `<a class="tile" href="${esc(url)}" data-proj="${esc(p.slug)}" data-i="${photo.index}" data-json="${esc(h.u(`project/${p.slug}/photos.json`))}" data-s="${esc(h.photo(photo.s.name))}" data-l="${esc(h.photo(photo.l.name))}" data-c="${esc(photo.caption)}" data-ch="${esc(photo.chapterTitle ? t(photo.chapterTitle) : '')}" data-title="${esc(h.projectName(p))}" aria-label="${esc(t('Open photo: {x}', { x: h.alt(photo, p) }))}">${img(h, photo, { sizes: TILE_SIZES, eager: position === 0 && k < 3, single: true, alt: h.alt(photo, p) })}</a>`)
    .join('');
  let more = '';
  if (total > 3) {
    const hide = [total <= 4 ? ' no-t' : '', total <= 5 ? ' no-d' : ''].join('');
    more = `<a class="tile more${hide}" href="${esc(url)}"><span class="m" aria-hidden="true">+${total - 3}</span><span class="t" aria-hidden="true">+${total - 4}</span><span class="d" aria-hidden="true">+${total - 5}</span><span class="sr">${esc(t('See all {n} photos of {p}', { n: total, p: h.ref(p) }))}</span></a>`;
  }
  return `<article class="pj reveal" id="project-${esc(p.slug)}" data-types="${esc(p.types.map((ty) => ty.toLowerCase()).join('|'))}">
<div class="pj-head"><h3 class="pj-title"><a href="${esc(url)}">${projectTitleHtml(h, p)}</a></h3><a class="pj-all" href="${esc(url)}" aria-label="${esc(t('See all photos of {p}', { p: h.ref(p) }))}">${esc(t('See all'))}</a></div>
<p class="pj-meta">${p.sample ? `<span class="badge">${esc(t('Sample'))}</span>` : ''}${meta}</p>
<div class="pj-row">${tiles}${more}</div>
</article>`;
}

/** "4+" → "4+ years experience"; text that already says years is used as typed. */
function trustItems(h, b) {
  return [
    b.years && (/\b(yrs?|years?)\b/i.test(b.years) ? b.years : h.t('{n} years experience', { n: b.years })),
    b.homes && (/\b(homes?|houses?|projects?|jobs?|flats?|famil)/i.test(b.homes) ? b.homes : h.t('{n} homes done', { n: b.homes })),
    h.lang === 'te' && b.warrantyTe ? b.warrantyTe : b.warranty,
  ].filter(Boolean);
}

function galleryPage(ctx, h) {
  const b = ctx.business;
  const { t } = h;
  const extras = (ctx.extras && ctx.extras[h.lang]) || { services: [], process: [], faq: [] };
  const trust = trustItems(h, b);
  const types = collectTypes(ctx.projects);
  const filters = types.length >= 2 && ctx.projects.length >= 2
    ? `<div class="filters" role="group" aria-label="${esc(t('Show projects by type'))}" data-filters hidden><button type="button" class="chip" data-type="all" aria-pressed="true">${esc(t('All'))}</button>${types.map((ty) => `<button type="button" class="chip" data-type="${esc(ty.toLowerCase())}" aria-pressed="false">${esc(ty)}</button>`).join('')}</div>`
    : '';
  const quoteHref = h.wa(`Hi ${b.name}, I saw your work on your website. I'd like a quote for my home.`);
  const cta = [waButton(quoteHref, t('Get a quote on WhatsApp')), callButton(b, b.phone ? t('Call {phone}', { phone: b.phone }) : t('Call us'))].join('');
  // The hero photo: the newest real project's finished work.
  const heroProject = ctx.projects.find((p) => !p.sample && p.num) || ctx.projects[0];
  const hero = heroProject ? `<div class="hero-media" aria-hidden="true">${img(h, heroProject.cover, { eager: true, sizes: '100vw' })}</div>` : '';
  const services = extras.services.length
    ? `<section class="services wrap" aria-labelledby="svc-h"><h2 id="svc-h" class="sec-title">${esc(t('What we do'))}</h2>
<ul class="svc-grid">${extras.services.map((s, i) => `<li class="svc reveal">${icon(SERVICE_ICONS[i % SERVICE_ICONS.length])}<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ul></section>`
    : '';
  const process = extras.process.length
    ? `<section class="process" aria-labelledby="how-h"><div class="wrap"><h2 id="how-h" class="sec-title">${esc(t('How we work'))}</h2>
<ol class="steps">${extras.process.map((s, i) => `<li class="step reveal"><span class="step-n" aria-hidden="true">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join('')}</ol></div></section>`
    : '';
  const faq = extras.faq.length
    ? `<section class="faq wrap" aria-labelledby="faq-h"><h2 id="faq-h" class="sec-title">${esc(t('Questions people ask'))}</h2>
<div class="faq-list">${extras.faq.map((f) => `<details class="faq-item"><summary><span>${esc(f.q)}</span>${icon('chevD')}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></section>`
    : '';
  const ending = `<section class="cta-band"><div class="wrap cta-in reveal"><h2>${esc(t('Free site visit and quote'))}</h2><p>${esc(t('Tell us about your home. We visit, measure and give you a clear quote, free of charge.'))}</p>${cta ? `<div class="btn-row">${cta}</div>` : ''}</div></section>`;
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: b.name,
    ...(b.parent && { parentOrganization: { '@type': 'Organization', name: b.parent } }),
    ...(b.tagline && { description: b.tagline }),
    ...(b.tel && { telephone: b.tel }),
    ...(b.email && { email: b.email }),
    ...(b.address && { address: { '@type': 'PostalAddress', addressLocality: b.address, ...(b.currency === '₹' && { addressCountry: 'IN' }) } }),
    ...(b.areas.length && { areaServed: b.areas }),
    ...(ctx.siteUrl && { url: `${ctx.siteUrl}/` }),
    ...(ctx.siteUrl && heroProject?.share && { image: h.absAsset(`assets/photos/${heroProject.share}`) }),
    ...([b.instagram, b.facebook, b.youtube].some(Boolean) && { sameAs: [b.instagram, b.facebook, b.youtube].filter(Boolean) }),
  }];
  if (extras.faq.length) {
    jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: extras.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }
  const body = `<section class="hero${hero ? ' has-media' : ''}">${hero}
<div class="wrap hero-in">
${b.address ? `<p class="hero-k">${esc(t('Interiors across {city}', { city: b.address }))}</p>` : ''}
<h1>${esc(b.name)}</h1>
${h.tagline ? `<p class="tagline">${esc(h.tagline)}</p>` : ''}
${trust.length ? `<ul class="trust">${trust.map((x) => `<li>${icon('check')}${esc(x)}</li>`).join('')}</ul>` : ''}
${cta ? `<div class="btn-row">${cta}</div>` : ''}
</div>
</section>
${services}
<section class="gal wrap" aria-labelledby="gal-title">
<div class="gal-head"><h2 id="gal-title" class="sec-title">${esc(t('Our work'))}</h2>${ctx.projects.length ? `<p class="gal-count" data-count data-of="${esc(t('{n} projects', { n: '{n}' }))}">${esc(h.count(ctx.projects.length, '1 project', '{n} projects'))}</p>` : ''}</div>
${filters}
<p class="none" data-none hidden>${esc(t('No projects of this type yet.'))}</p>
${ctx.projects.map((p, i) => projectBlock(h, p, i)).join('\n')}
${ctx.projects.length ? '' : `<p class="empty">${esc(t('Photos of our work are coming soon.'))}</p>`}
</section>
${process}
${faq}
${ending}`;
  const sentences = [
    (h.tagline || `Woodwork, painting and repairs by ${b.name}`).replace(/[.!]+$/, ''),
    b.areas.length && !h.tagline?.toLowerCase().includes(b.areas[0].toLowerCase().replace(/^all of /, '')) ? `Serving ${b.areas.join(', ')}` : '',
    trust.length ? trust.join(', ') : '',
  ];
  const description = `${sentences.filter(Boolean).join('. ')}.`.slice(0, 300);
  return layout(ctx, h, { page: 'gallery', title: '', description, path: '', share: heroProject?.share, body, head: `<script type="application/ld+json">${scriptJson(jsonLd)}</script>` });
}

function tileHtml(h, project, photo, first) {
  const sizes = first ? '(min-width: 1024px) 290px, (min-width: 640px) 33vw, 100vw' : '(min-width: 1024px) 290px, (min-width: 640px) 33vw, 50vw';
  return `<figure class="ptile"><a href="${esc(h.photo(photo.l.name))}" data-lb="${photo.index}" aria-label="${esc(h.t('Open photo: {x}', { x: h.alt(photo, project) }))}">${img(h, photo, { sizes, alt: h.alt(photo, project) })}${photo.label ? `<span class="ptag">${esc(h.t(photo.label))}</span>` : ''}</a>${photo.caption ? `<figcaption>${esc(photo.caption)}</figcaption>` : ''}</figure>`;
}

function beforeAfterHtml(h, pair) {
  const { t } = h;
  const caption = pair.after.caption || pair.before.caption;
  // The figure is never wider than the photo can be on this screen, so the slider and the line match.
  return `<figure class="ba" data-ba style="--ar:${(pair.after.l.w / pair.after.l.h).toFixed(4)}">
<div class="ba-frame" style="aspect-ratio:${pair.after.l.w} / ${pair.after.l.h}">
${img(h, pair.after, { sizes: BA_SIZES, alt: caption ? `${t('After')}: ${caption}` : t('After'), cls: 'ba-after' })}
${img(h, pair.before, { sizes: BA_SIZES, alt: caption ? `${t('Before')}: ${caption}` : t('Before'), cls: 'ba-before' })}
<span class="ba-tag ba-tag-b" aria-hidden="true">${esc(t('Before'))}</span><span class="ba-tag ba-tag-a" aria-hidden="true">${esc(t('After'))}</span>
<span class="ba-handle" aria-hidden="true"></span>
</div>
<input class="ba-range" type="range" min="0" max="100" step="1" value="50" aria-label="${esc(t('Slide to compare before and after'))}" data-js-only hidden>
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
</figure>`;
}

function chapterHtml(h, project, chapter) {
  const count = chapter.photos.length + chapter.pairs.length * 2;
  const sub = [chapter.sub && h.t(chapter.sub), h.photos(count)].filter(Boolean).join(' · ');
  const grid = chapter.photos.length ? `<div class="grid">${chapter.photos.map((photo, i) => tileHtml(h, project, photo, i === 0)).join('')}</div>` : '';
  return `<section class="chap" id="${chapter.id}" aria-labelledby="${chapter.id}-h">
<div class="wrap">
<h2 id="${chapter.id}-h">${esc(h.t(chapter.title))}</h2>
<p class="chap-sub">${esc(sub)}</p>
${chapter.pairs.map((pair) => beforeAfterHtml(h, pair)).join('')}
${grid}
</div>
</section>`;
}

function projectPage(ctx, h, p, position) {
  const b = ctx.business;
  const { t } = h;
  const next = ctx.projects.length > 1 ? ctx.projects[(position + 1) % ctx.projects.length] : null;
  const label = [p.title || (p.num ? '' : p.folderTitle), p.area].filter(Boolean).join(', ');
  const waHref = h.wa(`Hi ${b.name}, I saw ${p.num ? `Project ${p.num}` : 'your project'}${label ? ` (${label})` : ''} on your website. I'd like a quote for something similar.`);
  const meta = [p.area, p.size, p.days, p.finished && t('Finished {d}', { d: p.finished })].filter(Boolean);
  const total = p.allPhotos.length;
  const navItems = [
    ...p.chapters.map((c) => [c.id, t(NAV_SHORT[c.key] || c.title)]),
    (p.videoId || p.videoUrl) && ['ch-video', t('Video')],
    p.review && ['ch-review', t('Review')],
    p.price && ['ch-price', t('Price')],
  ].filter(Boolean);
  const nextUrl = next ? h.u(`project/${next.slug}/`) : '';
  const story = `<button type="button" class="btn primary" data-story data-js-only hidden data-title="${esc(h.projectName(p))}" data-wa="${esc(waHref)}" data-tel="${esc(b.tel ? `tel:${b.tel}` : '')}" data-price="${p.price ? '#ch-price' : ''}" data-next="${esc(nextUrl)}" data-next-label="${esc(next ? h.projectName(next) : '')}">${icon('play')}<span>${esc(t('Watch as story'))}</span></button>`;

  let video = '';
  if (p.videoId) {
    video = `<section class="chap" id="ch-video" aria-labelledby="ch-video-h"><div class="wrap"><h2 id="ch-video-h">${esc(t('Video'))}</h2><div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(p.videoId)}" title="${esc(t('Video of {p}', { p: h.ref(p) }))}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div></section>`;
  } else if (p.videoUrl) {
    video = `<section class="chap" id="ch-video" aria-labelledby="ch-video-h"><div class="wrap"><h2 id="ch-video-h">${esc(t('Video'))}</h2><p><a class="btn" href="${esc(p.videoUrl)}" target="_blank" rel="noopener">${icon('play')}<span>${esc(t('Watch the video'))}</span></a></p></div></section>`;
  }

  const review = p.review
    ? `<section class="chap" id="ch-review" aria-labelledby="ch-review-h"><div class="wrap"><h2 id="ch-review-h">${esc(t('What the client said'))}</h2><blockquote class="review"><p>${esc(p.review)}</p>${p.reviewBy ? `<footer>${esc(p.reviewBy)}</footer>` : ''}</blockquote></div></section>`
    : '';

  let price = '';
  if (p.price) {
    const rows = p.price.items.map((item) => `<tr><th scope="row">${esc(item.item)}</th><td>${h.money(item.amount)}</td></tr>`).join('');
    const table = rows
      ? `<table class="ptable"><tbody>${rows}</tbody><tfoot><tr><th scope="row">${esc(t('Total'))}</th><td>${h.money(p.price.total)}</td></tr></tfoot></table>`
      : `<p class="price-total"><span>${esc(t('Total'))}</span><strong>${h.money(p.price.total)}</strong></p>`;
    price = `<section class="chap" id="ch-price" aria-labelledby="ch-price-h"><div class="wrap"><h2 id="ch-price-h">${esc(t('Price for this project'))}</h2>
<div class="card price-card">${table}
${p.price.note ? `<p class="note price-note">${esc(p.price.note)}</p>` : ''}
<p class="note">${p.finished ? `${esc(t('Prices as of {d}.', { d: p.finished }))} ` : ''}${esc(t('Your price depends on sizes, materials and site conditions.'))}</p>
<div class="btn-row">${waButton(waHref, t('Get a quote like this')) || callButton(b, t('Call for a quote'))}${h.showPricing ? `<a class="btn" href="${esc(h.u('pricing/'))}">${icon('tag')}<span>${esc(t('See all our rates'))}</span></a>` : ''}</div>
</div></div></section>`;
  }

  const endButtons = [waButton(waHref, t('Get a quote on WhatsApp')), callButton(b, t('Call us'))].join('');
  const nextCard = next
    ? `<a class="next-card" href="${esc(nextUrl)}"><span class="next-img">${img(h, next.cover, { sizes: '120px', single: true })}</span><span class="next-txt"><span class="next-k">${esc(t('Next project'))}</span><span class="next-t">${esc(h.projectName(next))}</span>${next.area ? `<span class="next-m">${esc(next.area)}</span>` : ''}</span>${icon('arrowR')}</a>`
    : '';
  const chapterCount = p.chapters.length > 1 ? t('{photos} in {chapters}', { photos: h.photos(total), chapters: t('{n} chapters', { n: p.chapters.length }) }) : h.photos(total);

  const body = `<div class="wrap"><nav class="crumb" aria-label="${esc(t('Breadcrumb'))}"><a href="${esc(h.u(''))}">${icon('chevL')}<span>${esc(t('All projects'))}</span></a></nav></div>
<section class="p-hero wrap">
<figure class="p-cover">${img(h, p.cover, { eager: true, sizes: '(min-width: 1024px) 640px, 100vw', alt: h.alt(p.cover, p) })}</figure>
<div class="p-intro">
${(p.num && p.title) || p.sample ? `<p class="p-num">${p.num && p.title ? esc(t('Project {n}', { n: p.num })) : ''}${p.sample ? ` <span class="badge">${esc(t('Sample'))}</span>` : ''}</p>` : ''}
<h1>${esc(p.title || (p.num ? t('Project {n}', { n: p.num }) : p.folderTitle))}</h1>
${meta.length ? `<ul class="p-meta">${meta.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
${p.about ? `<p class="p-about">${esc(p.about)}</p>` : ''}
<p class="p-count">${esc(chapterCount)}</p>
<div class="btn-row">${story}${waButton(waHref, t('Ask about this project'))}</div>
</div>
</section>
${navItems.length > 1 ? `<nav class="chap-nav" aria-label="${esc(t('Chapters'))}"><div class="chap-in">${navItems.map(([id, text]) => `<a href="#${id}">${esc(text)}</a>`).join('')}</div></nav>` : ''}
${p.chapters.map((c) => chapterHtml(h, p, c)).join('\n')}
${video}
${review}
${price}
<section class="p-end"><div class="wrap">
<div class="cta-card"><h2>${esc(t('Like this project?'))}</h2><p>${esc(t("Send us a message and we'll get back to you with a quote."))}</p>${endButtons ? `<div class="btn-row">${endButtons}</div>` : `<p><a class="btn primary" href="${esc(h.u('contact/'))}">${esc(t('Contact us'))}</a></p>`}</div>
${nextCard}
<p class="back-all"><a href="${esc(h.u(''))}">${icon('chevL')}<span>${esc(t('All projects'))}</span></a></p>
</div></section>
<script type="application/json" id="photos-data">${scriptJson(p.allPhotos.map((photo) => h.item(photo, p)))}</script>`;

  // Shared links and Google show what the project is, where, and who did it.
  const what = [p.about || p.types.join(', '), p.area && `in ${p.area}`].filter(Boolean).join(' ');
  const description = `${what ? `${what}. ` : ''}${h.photos(total)}${p.chapters.some((c) => c.key === 'before' || c.key === 'before-after') ? ', before and after' : ''}. ${b.name}${b.address ? `, ${b.address}` : ''}.`.slice(0, 300);
  return layout(ctx, h, { page: 'gallery', title: h.projectName(p), description, path: `project/${p.slug}/`, share: p.share, body });
}

function pricingPage(ctx, h) {
  const b = ctx.business;
  const { t } = h;
  const { services, asOf } = ctx.rates;
  const anyPremium = services.some((s) => s.prem != null);
  const rateCell = (amount, unit) => `${h.money(amount)}<span class="unit"> / ${esc(unit)}</span>`;
  const rows = services.map((s) => {
    if (s.note != null) return `<tr><th scope="row">${esc(s.name)}</th><td colspan="${anyPremium ? 2 : 1}">${esc(s.note)}</td></tr>`;
    const premium = anyPremium ? `<td>${s.prem != null ? rateCell(s.prem, s.unit) : `<span class="muted">${esc(t('Not offered'))}</span>`}</td>` : '';
    return `<tr><th scope="row">${esc(s.name)}</th><td>${rateCell(s.std, s.unit)}</td>${premium}</tr>`;
  }).join('');
  const rateTable = services.length
    ? `<section class="card" aria-labelledby="rates-h"><h2 id="rates-h">${esc(t('Our rates'))}</h2>${asOf ? `<p class="note">${esc(t('Rates as of {d}.', { d: asOf }))}</p>` : ''}
<div class="table-wrap"><table class="rtable"><thead><tr><th scope="col">${esc(t('Service'))}</th><th scope="col">${esc(anyPremium ? t('Standard') : t('Price'))}</th>${anyPremium ? `<th scope="col">${esc(t('Premium'))}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div></section>`
    : '';

  const estimable = services.filter((s) => s.note == null);
  const first = estimable[0];
  // The Standard/Premium choice only appears when the rate card has premium prices.
  const tiers = anyPremium
    ? `<fieldset class="field tiers"><legend>${esc(t('Finish'))}</legend>
<label class="tier"><input type="radio" name="tier" value="std" checked><span>${esc(t('Standard'))}</span></label>
<label class="tier"><input type="radio" name="tier" value="prem"${first && first.prem == null ? ' disabled' : ''}><span>${esc(t('Premium'))}</span></label>
</fieldset>`
    : '';
  const estimator = first
    ? `<section class="card" aria-labelledby="est-h"><h2 id="est-h">${esc(t('Estimate your job'))}</h2>
<form class="est-form" id="estimator" data-wa-base="${esc(b.wa ? `https://wa.me/${b.wa}?text=` : '')}" data-name="${esc(b.name)}" novalidate>
<div class="field"><label for="est-svc">${esc(t('What do you need?'))}</label><select id="est-svc">${estimable.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('')}</select></div>
${tiers}
<div class="field"><label for="est-qty" id="est-qty-label">${esc(t('How many {unit}?', { unit: first.unit }))}</label>
<input id="est-qty" type="number" inputmode="decimal" min="0" step="any" placeholder="${esc(t('For example 60'))}" aria-describedby="est-help est-err">
<p class="hint" id="est-help">${esc(t('Not sure? A rough guess is fine. We measure on the site visit.'))}</p>
<p class="err" id="est-err" hidden>${esc(t('Enter a number above 0.'))}</p></div>
<div class="est-result" aria-live="polite"><p class="est-k">${esc(t('Approximate cost'))}</p><p class="est-out" id="est-out">${esc(t('Enter a size to see an estimate'))}</p><p class="note">${esc(t('Final price after a site visit.'))}</p></div>
${b.wa ? `<a class="btn wa" id="est-wa" href="${esc(h.wa(`Hi ${b.name}, I'd like an estimate for my home.`))}">${icon('wa')}<span>${esc(t('Send this on WhatsApp'))}</span></a>` : callButton(b, t('Call us with this estimate'))}
</form>
<script type="application/json" id="rates-data">${scriptJson({ symbol: b.currency, services: estimable.map((s) => ({ name: s.name, std: s.std, prem: s.prem, unit: s.unit })) })}</script>
</section>`
    : '';

  // Sample projects show made-up prices, so they are never listed as what past projects cost.
  const past = ctx.projects.filter((p) => p.price && !p.sample);
  const pastTable = past.length
    ? `<section class="card" aria-labelledby="past-h"><h2 id="past-h">${esc(t('What our past projects cost'))}</h2>
<div class="table-wrap"><table class="ptable past"><thead><tr><th scope="col">${esc(t('Project'))}</th><th scope="col">${esc(t('Cost'))}</th></tr></thead><tbody>
${past.map((p) => `<tr><th scope="row"><a href="${esc(h.u(`project/${p.slug}/`))}">${esc(h.projectName(p))}</a>${p.area || p.finished ? `<span class="sub">${esc([p.area, p.finished].filter(Boolean).join(' · '))}</span>` : ''}</th><td>${h.money(p.price.total)}</td></tr>`).join('')}
</tbody></table></div></section>`
    : '';

  const body = `<section class="page-head wrap"><h1>${esc(t('Pricing'))}</h1><p>${esc(t('Clear rates, an estimate in seconds, and what our past projects really cost.'))}</p></section>
<div class="wrap pricing">${rateTable}${estimator}${pastTable}</div>`;
  return layout(ctx, h, { page: 'pricing', title: t('Pricing'), description: `Rates and a quick cost estimate for woodwork, false ceilings and painting from ${b.name}${b.address ? `, ${b.address}` : ''}.`, path: 'pricing/', share: ctx.projects[0]?.share, body });
}

function showcaseGrid(h, photos, cls) {
  return `<div class="${cls}">${photos.map((photo) => `<figure class="mcard"><a href="${esc(h.photo(photo.l.name))}" data-lb="${photo.index}" aria-label="${esc(h.t('Open photo: {x}', { x: photo.caption || h.t('Photo') }))}">${img(h, photo, { sizes: '(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw', alt: [photo.title, photo.desc].filter(Boolean).join(', ') })}</a><figcaption>${photo.title ? `<strong>${esc(photo.title)}</strong>` : ''}${photo.desc ? `<span>${esc(photo.desc)}</span>` : ''}</figcaption></figure>`).join('')}</div>`;
}

function materialsPage(ctx, h) {
  const { t } = h;
  const body = `<section class="page-head wrap"><h1>${esc(t('Materials we use'))}</h1><p>${esc(t('The boards, finishes and fittings that go into our work. Ask us about grades and options.'))}</p></section>
<section class="wrap">${showcaseGrid(h, ctx.materials, 'mgrid')}</section>
<script type="application/json" id="photos-data">${scriptJson(ctx.materials.map((photo) => h.item(photo)))}</script>`;
  return layout(ctx, h, { page: 'materials', title: t('Materials we use'), description: `The materials ${ctx.business.name} uses: boards, finishes and fittings.`, path: 'materials/', share: ctx.projects[0]?.share, body });
}

function contactPage(ctx, h) {
  const b = ctx.business;
  const { t } = h;
  const buttons = [
    waButton(h.wa(`Hi ${b.name}, I found your website and I'd like to ask about work for my home.`), t('WhatsApp us'), ' big'),
    callButton(b, b.phone ? t('Call {phone}', { phone: b.phone }) : t('Call us'), ' big'),
    b.email ? `<a class="btn big" href="mailto:${esc(b.email)}">${icon('mail')}<span>${esc(b.email)}</span></a>` : '',
  ].join('');
  const facts = [
    b.hours && `<div><dt>${icon('clock')}${esc(t('Working hours'))}</dt><dd>${esc(b.hours)}</dd></div>`,
    b.areas.length && `<div><dt>${icon('map')}${esc(t('Areas we serve'))}</dt><dd>${esc(b.areas.join(', '))}</dd></div>`,
    (b.address || b.map) && `<div><dt>${icon('pin')}${esc(t('Find us'))}</dt><dd>${b.address ? esc(b.address) : ''}${b.map ? `${b.address ? '<br>' : ''}<a href="${esc(b.map)}" target="_blank" rel="noopener">${esc(t('Open in Google Maps'))}</a>` : ''}</dd></div>`,
  ].filter(Boolean).join('');
  const social = [
    b.instagram && `<a class="btn" href="${esc(b.instagram)}" target="_blank" rel="noopener">${icon('instagram')}<span>Instagram</span></a>`,
    b.facebook && `<a class="btn" href="${esc(b.facebook)}" target="_blank" rel="noopener">${icon('facebook')}<span>Facebook</span></a>`,
    b.youtube && `<a class="btn" href="${esc(b.youtube)}" target="_blank" rel="noopener">${icon('youtube')}<span>YouTube</span></a>`,
  ].filter(Boolean).join('');
  const body = `<section class="page-head wrap"><h1>${esc(t('Contact us'))}</h1><p>${esc(t("Tell us about your home. We'll reply with a quote."))}</p></section>
<div class="wrap contact">
${buttons ? `<div class="contact-btns">${buttons}</div>` : ''}
${facts ? `<div class="card"><dl class="facts">${facts}</dl></div>` : ''}
${h.about ? `<section class="card" aria-labelledby="about-h"><h2 id="about-h">${esc(t('About us'))}</h2><p>${esc(h.about)}</p>${b.parent ? `<p class="note">${esc(t('A {company} company', { company: b.parent }))}</p>` : ''}</section>` : ''}
${ctx.team.length ? `<section aria-labelledby="team-h"><h2 id="team-h" class="sec-h">${esc(t('Our team'))}</h2>${showcaseGrid(h, ctx.team, 'mgrid team')}</section>` : ''}
${social ? `<div class="btn-row social">${social}</div>` : ''}
</div>
${ctx.team.length ? `<script type="application/json" id="photos-data">${scriptJson(ctx.team.map((photo) => h.item(photo)))}</script>` : ''}`;
  return layout(ctx, h, { page: 'contact', title: t('Contact us'), description: `Call or WhatsApp ${b.name}${b.areas.length ? `, serving ${b.areas.join(', ')}` : ''}${b.hours ? `. ${b.hours}` : ''}.`, path: 'contact/', share: ctx.projects[0]?.share, body });
}

function notFoundPage(ctx, h) {
  const { t } = h;
  const body = `<section class="page-head wrap nf"><h1>${esc(t('Page not found'))}</h1><p>${esc(t("This page doesn't exist. It may have been moved or removed."))}</p><p><a class="btn primary" href="${esc(h.u(''))}">${icon('grid')}<span>${esc(t('See all projects'))}</span></a></p></section>`;
  return layout(ctx, h, { page: '404', title: t('Page not found'), description: 'Page not found.', body });
}

function pagesFor(ctx, lang) {
  const h = helpers(ctx, lang);
  const at = (file) => (lang === 'en' ? file : `${lang}/${file}`);
  const pages = [{ file: at('index.html'), content: galleryPage(ctx, h) }];
  ctx.projects.forEach((project, position) => {
    pages.push({ file: at(`project/${project.slug}/index.html`), content: projectPage(ctx, h, project, position) });
    pages.push({ file: at(`project/${project.slug}/photos.json`), content: JSON.stringify(project.allPhotos.map((photo) => h.item(photo, project))) });
  });
  if (h.showPricing) pages.push({ file: at('pricing/index.html'), content: pricingPage(ctx, h) });
  if (ctx.materials.length) pages.push({ file: at('materials/index.html'), content: materialsPage(ctx, h) });
  pages.push({ file: at('contact/index.html'), content: contactPage(ctx, h) });
  return { h, pages };
}

export function renderSite(ctx) {
  const all = LANGS.map((lang) => pagesFor(ctx, lang));
  const en = all[0].h;
  const pages = all.flatMap((x) => x.pages);
  // GitHub Pages shows one 404 page for every missing address.
  pages.push({ file: '404.html', content: notFoundPage(ctx, en) });
  pages.push({ file: '.nojekyll', content: '' });
  pages.push({ file: 'robots.txt', content: `User-agent: *\nAllow: /\n${ctx.siteUrl ? `Sitemap: ${en.absAsset('sitemap.xml')}\n` : ''}` });
  if (ctx.siteUrl) {
    const paths = ['', ...ctx.projects.map((p) => `project/${p.slug}/`), en.showPricing && 'pricing/', ctx.materials.length && 'materials/', 'contact/'].filter((p) => p !== false && p !== 0);
    const urls = LANGS.flatMap((lang) => paths.map((p) => `${ctx.siteUrl}/${lang === 'en' ? '' : `${lang}/`}${p}`));
    pages.push({ file: 'sitemap.xml', content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((loc) => `<url><loc>${esc(loc)}</loc></url>`).join('\n')}\n</urlset>\n` });
  }
  return pages;
}
