// HTML for every page. Each function returns a string; all text from the owner goes through esc().
import { esc, scriptJson, formatMoney, plural } from './util.mjs';

const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z"/><circle cx="8.5" cy="8.5" r="1.6"/>',
  box: '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M4.3 7.8 12 12l7.7-4.2M12 12v8.6"/>',
  phone: '<path d="M5 4h3.6l1.8 4.5-2.2 1.4a11.5 11.5 0 0 0 5.9 5.9l1.4-2.2L20 15.4V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  wa: '<path d="M4.5 19.5 5.7 16a8 8 0 1 1 3 2.6z"/><path stroke-width="1.6" d="M9.4 9.1c0 2.9 2.6 5.5 5.5 5.5l1-1.5-2-1-.9.8a4.7 4.7 0 0 1-2-2l.8-.9-1-2z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevL: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  arrowR: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>',
  facebook: '<path d="M14.5 8.5H17V5h-2.5a4 4 0 0 0-4 4v2.5H8V15h2.5v6H14v-6h2.5l.5-3.5h-3V9.3a.8.8 0 0 1 .8-.8z"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
};

export function icon(name) {
  return `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

export const DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%238A5A2B'/%3E%3Cpath d='M15 22h34M15 32h34M15 42h34' stroke='%23F5ECE1' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E";
const TILE_SIZES = '(min-width: 1180px) 190px, (min-width: 1024px) 16vw, (min-width: 640px) 19vw, 24vw';
const BA_SIZES = '(min-width: 960px) 900px, 100vw';
const NAV_SHORT = { 'before-after': 'Compare', team: 'Team', quality: 'Quality', materials: 'Materials' };

function helpers(ctx) {
  const b = ctx.business;
  const u = (p = '') => ctx.base + String(p).replace(/^\/+/, '');
  const abs = (p = '') => (ctx.siteUrl ? `${ctx.siteUrl}/${String(p).replace(/^\/+/, '')}` : '');
  const photo = (name) => u(`assets/photos/${name}`);
  const showPricing = ctx.rates.services.length > 0 || ctx.projects.some((p) => p.price);
  const nav = [
    { key: 'gallery', href: '', label: 'Gallery', icon: 'grid' },
    showPricing && { key: 'pricing', href: 'pricing/', label: 'Pricing', icon: 'tag' },
    ctx.materials.length > 0 && { key: 'materials', href: 'materials/', label: 'Materials', icon: 'box' },
    { key: 'contact', href: 'contact/', label: 'Contact', icon: 'phone' },
  ].filter(Boolean);
  // Folders without a number (see content.mjs) are named after the folder instead of "Project N".
  const projectName = (p) => (p.num ? (p.title ? `Project ${p.num} · ${p.title}` : `Project ${p.num}`) : p.title || p.folderTitle);
  const ref = (p) => (p.num ? `project ${p.num}` : projectName(p));
  const alt = (p, project) => {
    // A before or after photo says so, wherever it is shown (the gallery, the viewer, the story).
    const tag = p.label || (['Before', 'After'].includes(p.chapterTitle) ? p.chapterTitle : '');
    const what = p.caption ? (tag ? `${tag}: ${p.caption}` : p.caption) : p.chapterTitle ? `${p.chapterTitle} photo` : 'Photo';
    return project ? `${what}, ${ref(project)}` : what;
  };
  return {
    u,
    abs,
    photo,
    showPricing,
    nav,
    projectName,
    ref,
    alt,
    money: (n) => esc(formatMoney(n, b.currency)),
    wa: (text) => (b.wa ? `https://wa.me/${b.wa}?text=${encodeURIComponent(text)}` : ''),
    item: (p, project) => ({ s: photo(p.s.name), l: photo(p.l.name), w: p.l.w, h: p.l.h, c: p.caption || '', ch: p.chapterTitle || '', alt: alt(p, project) }),
  };
}

function img(h, p, { sizes = '100vw', alt = '', eager = false, large = false, cls = '' } = {}) {
  const main = large ? p.l : p.s;
  const srcset = p.s.w < p.l.w ? ` srcset="${esc(`${h.photo(p.s.name)} ${p.s.w}w, ${h.photo(p.l.name)} ${p.l.w}w`)}" sizes="${esc(sizes)}"` : '';
  const loading = eager ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(h.photo(main.name))}"${srcset} width="${main.w}" height="${main.h}" alt="${esc(alt)}"${loading} decoding="async">`;
}

function waButton(href, label, extra = '') {
  return href ? `<a class="btn wa${extra}" href="${esc(href)}">${icon('wa')}<span>${esc(label)}</span></a>` : '';
}

function callButton(b, label, extra = '') {
  return b.tel ? `<a class="btn${extra}" href="tel:${esc(b.tel)}">${icon('phone')}<span>${esc(label)}</span></a>` : '';
}

function layout(ctx, h, { page, title, description, path = '', share = '', body, head = '' }) {
  const b = ctx.business;
  const docTitle = title ? `${title} | ${b.name}` : b.tagline ? `${b.name} | ${b.tagline}` : b.name;
  const url = h.abs(path);
  const shareUrl = share ? h.abs(`assets/photos/${share}`) : '';
  const icons = ctx.logo
    ? `<link rel="icon" type="image/png" href="${esc(h.photo(ctx.logo.icon))}"><link rel="apple-touch-icon" href="${esc(h.photo(ctx.logo.apple))}">`
    : `<link rel="icon" href="${DEFAULT_FAVICON}">`;
  const current = (n) => (n.key === page ? ' aria-current="page"' : '');
  const brand = ctx.logo
    ? `<img src="${esc(h.photo(ctx.logo.logo))}" width="${ctx.logo.logoW}" height="${ctx.logo.logoH}" alt=""><span>${esc(b.name)}</span>`
    : `<span>${esc(b.name)}</span>`;
  const topActions = [
    b.tel ? `<a class="btn icon" href="tel:${esc(b.tel)}" aria-label="Call us">${icon('phone')}</a>` : '',
    b.wa ? `<a class="btn wa top-wa" href="${esc(h.wa(`Hi ${b.name}, I found your website and I'd like to ask about work for my home.`))}" aria-label="WhatsApp us">${icon('wa')}<span class="lbl">WhatsApp</span></a>` : '',
  ].join('');
  const footContact = [
    b.tel ? `<a href="tel:${esc(b.tel)}">${icon('phone')}${esc(b.phone)}</a>` : '',
    b.email ? `<a href="mailto:${esc(b.email)}">${icon('mail')}${esc(b.email)}</a>` : '',
    b.address ? `<span>${icon('pin')}${esc(b.address)}</span>` : '',
  ].filter(Boolean).join('');
  const meta = [
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(b.name)}">`,
    `<meta property="og:title" content="${esc(title || b.name)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    shareUrl ? `<meta property="og:image" content="${esc(shareUrl)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : '',
    url ? `<meta property="og:url" content="${esc(url)}"><link rel="canonical" href="${esc(url)}">` : '',
  ].join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(docTitle)}</title>
${meta}
<meta name="theme-color" content="#FAF7F2">
${icons}
<link rel="stylesheet" href="${esc(h.u('assets/app.css'))}?v=${ctx.version}">
${head}
</head>
<body class="page-${page}">
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<div class="top-in">
<a class="brand" href="${esc(h.u(''))}">${brand}</a>
<nav class="nav-desk" aria-label="Main">${h.nav.map((n) => `<a href="${esc(h.u(n.href))}"${current(n)}>${n.label}</a>`).join('')}</nav>
<div class="top-act">${topActions}</div>
</div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="foot">
<div class="wrap foot-in">
<div><p class="foot-name">${esc(b.name)}</p>${b.tagline ? `<p class="foot-tag">${esc(b.tagline)}</p>` : ''}</div>
${footContact ? `<div class="foot-contact">${footContact}</div>` : ''}
<p class="foot-small">&copy; ${ctx.year} ${esc(b.name)}</p>
</div>
</footer>
<nav class="tabbar" aria-label="Main menu">${h.nav.map((n) => `<a href="${esc(h.u(n.href))}"${current(n)}>${icon(n.icon)}<span>${n.label}</span></a>`).join('')}</nav>
<script src="${esc(h.u('assets/app.js'))}?v=${ctx.version}" defer></script>
${ctx.dev ? '<script src="/__dev/reload.js"></script>' : ''}
</body>
</html>
`;
}

function collectTypes(projects) {
  const order = ['full home', 'kitchens', 'kitchen', 'wardrobes', 'wardrobe', 'woodwork', 'painting', 'repairs'];
  const found = new Map();
  for (const p of projects) {
    for (const t of p.types) {
      if (!found.has(t.toLowerCase())) found.set(t.toLowerCase(), t);
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

function projectTitleHtml(p) {
  if (!p.num) return esc(p.title || p.folderTitle);
  return `<span class="pj-num">Project ${p.num}</span>${p.title ? ` · ${esc(p.title)}` : ''}`;
}

function projectBlock(h, p, position) {
  const url = h.u(`project/${p.slug}/`);
  const total = p.allPhotos.length;
  const meta = [p.area, p.days, plural(total, 'photo')].filter(Boolean).map(esc).join(' · ');
  const tiles = p.row
    .map((photo, k) => `<a class="tile" href="${esc(url)}" data-proj="${esc(p.slug)}" data-i="${photo.index}" data-json="${esc(h.u(`project/${p.slug}/photos.json`))}" data-s="${esc(h.photo(photo.s.name))}" data-l="${esc(h.photo(photo.l.name))}" data-c="${esc(photo.caption)}" data-ch="${esc(photo.chapterTitle)}" data-title="${esc(h.projectName(p))}" aria-label="${esc(`Open photo: ${h.alt(photo, p)}`)}">${img(h, photo, { sizes: TILE_SIZES, eager: position === 0 && k < 3 })}</a>`)
    .join('');
  let more = '';
  if (total > 3) {
    const hide = [total <= 4 ? ' no-t' : '', total <= 5 ? ' no-d' : ''].join('');
    more = `<a class="tile more${hide}" href="${esc(url)}"><span class="m" aria-hidden="true">+${total - 3}</span><span class="t" aria-hidden="true">+${total - 4}</span><span class="d" aria-hidden="true">+${total - 5}</span><span class="sr">${esc(`See all ${total} photos of ${h.ref(p)}`)}</span></a>`;
  }
  return `<article class="pj" id="project-${esc(p.slug)}" data-types="${esc(p.types.map((t) => t.toLowerCase()).join('|'))}">
<div class="pj-head"><h3 class="pj-title"><a href="${esc(url)}">${projectTitleHtml(p)}</a></h3><a class="pj-all" href="${esc(url)}" aria-label="${esc(`See all photos of ${h.ref(p)}`)}">See all</a></div>
<p class="pj-meta">${p.sample ? '<span class="badge">Sample</span>' : ''}${meta}</p>
<div class="pj-row">${tiles}${more}</div>
</article>`;
}

function galleryPage(ctx, h) {
  const b = ctx.business;
  const trust = [
    b.years && (/\b(yrs?|years?)\b/i.test(b.years) ? b.years : `${b.years} years experience`),
    b.homes && (/\b(homes?|houses?|projects?|jobs?|flats?|famil)/i.test(b.homes) ? b.homes : `${b.homes} homes done`),
    b.warranty,
  ].filter(Boolean);
  const types = collectTypes(ctx.projects);
  const filters = types.length >= 2 && ctx.projects.length >= 2
    ? `<div class="filters" role="group" aria-label="Show projects by type" data-filters hidden><button type="button" class="chip" data-type="all" aria-pressed="true">All</button>${types.map((t) => `<button type="button" class="chip" data-type="${esc(t.toLowerCase())}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>`
    : '';
  const cta = [
    waButton(h.wa(`Hi ${b.name}, I saw your work on your website. I'd like a quote for my home.`), 'Get a quote on WhatsApp'),
    callButton(b, b.phone ? `Call ${b.phone}` : 'Call us'),
  ].join('');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: b.name,
    ...(b.tagline && { description: b.tagline }),
    ...(b.tel && { telephone: b.tel }),
    ...(b.email && { email: b.email }),
    ...(b.address && { address: b.address }),
    ...(b.areas.length && { areaServed: b.areas }),
    ...(ctx.siteUrl && { url: h.abs('') }),
    ...(ctx.siteUrl && ctx.projects[0]?.share && { image: h.abs(`assets/photos/${ctx.projects[0].share}`) }),
  };
  const body = `<section class="hero wrap">
<h1>${esc(b.name)}</h1>
${b.tagline ? `<p class="tagline">${esc(b.tagline)}</p>` : ''}
${trust.length ? `<ul class="trust">${trust.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
${cta ? `<div class="btn-row">${cta}</div>` : ''}
</section>
<section class="gal wrap" aria-labelledby="gal-title">
<div class="gal-head"><h2 id="gal-title">Our work</h2>${ctx.projects.length ? `<p class="gal-count">${plural(ctx.projects.length, 'project')}</p>` : ''}</div>
${filters}
<p class="none" data-none hidden>No projects of this type yet.</p>
${ctx.projects.map((p, i) => projectBlock(h, p, i)).join('\n')}
${ctx.projects.length ? '' : '<p class="empty">Photos of our work are coming soon.</p>'}
</section>`;
  const sentences = [
    (b.tagline || `Woodwork, painting and repairs by ${b.name}`).replace(/[.!]+$/, ''),
    b.areas.length ? `Serving ${b.areas.join(', ')}` : '',
    ctx.projects.length ? `See ${plural(ctx.projects.length, 'project')} with photos${ctx.projects.some((p) => p.price) ? ' and prices' : ''}` : '',
  ];
  const description = `${sentences.filter(Boolean).join('. ')}.`;
  return layout(ctx, h, { page: 'gallery', title: '', description, path: '', share: ctx.projects[0]?.share, body, head: `<script type="application/ld+json">${scriptJson(jsonLd)}</script>` });
}

function tileHtml(h, project, photo, first) {
  const sizes = first ? '(min-width: 1024px) 290px, (min-width: 640px) 33vw, 100vw' : '(min-width: 1024px) 290px, (min-width: 640px) 33vw, 50vw';
  return `<figure class="ptile"><a href="${esc(h.photo(photo.l.name))}" data-lb="${photo.index}" aria-label="${esc(`Open photo: ${h.alt(photo, project)}`)}">${img(h, photo, { sizes })}${photo.label ? `<span class="ptag">${photo.label}</span>` : ''}</a>${photo.caption ? `<figcaption>${esc(photo.caption)}</figcaption>` : ''}</figure>`;
}

function beforeAfterHtml(h, pair) {
  const caption = pair.after.caption || pair.before.caption;
  return `<figure class="ba" data-ba>
<div class="ba-frame" style="aspect-ratio:${pair.after.l.w} / ${pair.after.l.h}">
${img(h, pair.after, { large: true, sizes: BA_SIZES, alt: caption ? `After: ${caption}` : 'After', cls: 'ba-after' })}
${img(h, pair.before, { large: true, sizes: BA_SIZES, alt: caption ? `Before: ${caption}` : 'Before', cls: 'ba-before' })}
<span class="ba-tag ba-tag-b" aria-hidden="true">Before</span><span class="ba-tag ba-tag-a" aria-hidden="true">After</span>
<span class="ba-handle" aria-hidden="true"></span>
</div>
<input class="ba-range" type="range" min="0" max="100" step="1" value="50" aria-label="Slide to compare before and after" data-js-only hidden>
${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
</figure>`;
}

function chapterHtml(h, project, chapter) {
  const count = chapter.photos.length + chapter.pairs.length * 2;
  const sub = [chapter.sub, plural(count, 'photo')].filter(Boolean).join(' · ');
  const grid = chapter.photos.length ? `<div class="grid">${chapter.photos.map((photo, i) => tileHtml(h, project, photo, i === 0)).join('')}</div>` : '';
  return `<section class="chap" id="${chapter.id}" aria-labelledby="${chapter.id}-h">
<div class="wrap">
<h2 id="${chapter.id}-h">${esc(chapter.title)}</h2>
<p class="chap-sub">${esc(sub)}</p>
${chapter.pairs.map((pair) => beforeAfterHtml(h, pair)).join('')}
${grid}
</div>
</section>`;
}

function projectPage(ctx, h, p, position) {
  const b = ctx.business;
  const next = ctx.projects.length > 1 ? ctx.projects[(position + 1) % ctx.projects.length] : null;
  const label = [p.title || (p.num ? '' : p.folderTitle), p.area].filter(Boolean).join(', ');
  const waHref = h.wa(`Hi ${b.name}, I saw ${p.num ? `Project ${p.num}` : 'your project'}${label ? ` (${label})` : ''} on your website. I'd like a quote for something similar.`);
  const meta = [p.area, p.size, p.days, p.finished && `Finished ${p.finished}`].filter(Boolean);
  const total = p.allPhotos.length;
  const navItems = [
    ...p.chapters.map((c) => [c.id, NAV_SHORT[c.key] || c.title]),
    (p.videoId || p.videoUrl) && ['ch-video', 'Video'],
    p.review && ['ch-review', 'Review'],
    p.price && ['ch-price', 'Price'],
  ].filter(Boolean);
  const nextUrl = next ? h.u(`project/${next.slug}/`) : '';
  const story = `<button type="button" class="btn primary" data-story data-js-only hidden data-title="${esc(h.projectName(p))}" data-wa="${esc(waHref)}" data-tel="${esc(b.tel ? `tel:${b.tel}` : '')}" data-price="${p.price ? '#ch-price' : ''}" data-next="${esc(nextUrl)}" data-next-label="${esc(next ? h.projectName(next) : '')}">${icon('play')}<span>Watch as story</span></button>`;

  let video = '';
  if (p.videoId) {
    video = `<section class="chap" id="ch-video" aria-labelledby="ch-video-h"><div class="wrap"><h2 id="ch-video-h">Video</h2><div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(p.videoId)}" title="${esc(`Video of ${h.ref(p)}`)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div></section>`;
  } else if (p.videoUrl) {
    video = `<section class="chap" id="ch-video" aria-labelledby="ch-video-h"><div class="wrap"><h2 id="ch-video-h">Video</h2><p><a class="btn" href="${esc(p.videoUrl)}" target="_blank" rel="noopener">${icon('play')}<span>Watch the video</span></a></p></div></section>`;
  }

  const review = p.review
    ? `<section class="chap" id="ch-review" aria-labelledby="ch-review-h"><div class="wrap"><h2 id="ch-review-h">What the client said</h2><blockquote class="review"><p>${esc(p.review)}</p>${p.reviewBy ? `<footer>${esc(p.reviewBy)}</footer>` : ''}</blockquote></div></section>`
    : '';

  let price = '';
  if (p.price) {
    const rows = p.price.items.map((item) => `<tr><th scope="row">${esc(item.item)}</th><td>${h.money(item.amount)}</td></tr>`).join('');
    const table = rows
      ? `<table class="ptable"><tbody>${rows}</tbody><tfoot><tr><th scope="row">Total</th><td>${h.money(p.price.total)}</td></tr></tfoot></table>`
      : `<p class="price-total"><span>Total</span><strong>${h.money(p.price.total)}</strong></p>`;
    price = `<section class="chap" id="ch-price" aria-labelledby="ch-price-h"><div class="wrap"><h2 id="ch-price-h">Price for this project</h2>
<div class="card price-card">${table}
${p.price.note ? `<p class="note price-note">${esc(p.price.note)}</p>` : ''}
<p class="note">${p.finished ? `Prices as of ${esc(p.finished)}. ` : ''}Your price depends on sizes, materials and site conditions.</p>
<div class="btn-row">${waButton(waHref, 'Get a quote like this') || callButton(b, 'Call for a quote')}${h.showPricing ? `<a class="btn" href="${esc(h.u('pricing/'))}">${icon('tag')}<span>See all our rates</span></a>` : ''}</div>
</div></div></section>`;
  }

  const endButtons = [waButton(waHref, 'Get a quote on WhatsApp'), callButton(b, 'Call us')].join('');
  const nextCard = next
    ? `<a class="next-card" href="${esc(nextUrl)}"><span class="next-img">${img(h, next.cover, { sizes: '120px' })}</span><span class="next-txt"><span class="next-k">Next project</span><span class="next-t">${esc(h.projectName(next))}</span>${next.area ? `<span class="next-m">${esc(next.area)}</span>` : ''}</span>${icon('arrowR')}</a>`
    : '';

  const body = `<div class="wrap"><nav class="crumb" aria-label="Breadcrumb"><a href="${esc(h.u(''))}">${icon('chevL')}<span>All projects</span></a></nav></div>
<section class="p-hero wrap">
<figure class="p-cover">${img(h, p.cover, { large: true, eager: true, sizes: '(min-width: 1024px) 640px, 100vw', alt: h.alt(p.cover, p) })}</figure>
<div class="p-intro">
${(p.num && p.title) || p.sample ? `<p class="p-num">${p.num && p.title ? `Project ${p.num}` : ''}${p.sample ? ' <span class="badge">Sample</span>' : ''}</p>` : ''}
<h1>${esc(p.title || (p.num ? `Project ${p.num}` : p.folderTitle))}</h1>
${meta.length ? `<ul class="p-meta">${meta.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
${p.about ? `<p class="p-about">${esc(p.about)}</p>` : ''}
<p class="p-count">${plural(total, 'photo')}${p.chapters.length > 1 ? ` in ${plural(p.chapters.length, 'chapter')}` : ''}</p>
<div class="btn-row">${story}${waButton(waHref, 'Ask about this project')}</div>
</div>
</section>
${navItems.length > 1 ? `<nav class="chap-nav" aria-label="Chapters"><div class="chap-in">${navItems.map(([id, text]) => `<a href="#${id}">${esc(text)}</a>`).join('')}</div></nav>` : ''}
${p.chapters.map((c) => chapterHtml(h, p, c)).join('\n')}
${video}
${review}
${price}
<section class="p-end"><div class="wrap">
<div class="cta-card"><h2>Like this project?</h2><p>Send us a message and we'll get back to you with a quote.</p>${endButtons ? `<div class="btn-row">${endButtons}</div>` : `<p><a class="btn primary" href="${esc(h.u('contact/'))}">Contact us</a></p>`}</div>
${nextCard}
<p class="back-all"><a href="${esc(h.u(''))}">${icon('chevL')}<span>All projects</span></a></p>
</div></section>
<script type="application/json" id="photos-data">${scriptJson(p.allPhotos.map((photo) => h.item(photo, p)))}</script>`;

  const description = `${h.projectName(p)}${p.area ? ` in ${p.area}` : ''}: ${plural(total, 'photo')} of ${p.chapters.map((c) => c.title.toLowerCase()).join(', ')}.`;
  return layout(ctx, h, { page: 'gallery', title: h.projectName(p), description, path: `project/${p.slug}/`, share: p.share, body });
}

function pricingPage(ctx, h) {
  const b = ctx.business;
  const { services, asOf } = ctx.rates;
  const anyPremium = services.some((s) => s.prem != null);
  const rateCell = (amount, unit) => `${h.money(amount)}<span class="unit"> / ${esc(unit)}</span>`;
  const rows = services.map((s) => {
    if (s.note != null) return `<tr><th scope="row">${esc(s.name)}</th><td colspan="${anyPremium ? 2 : 1}">${esc(s.note)}</td></tr>`;
    const premium = anyPremium ? `<td>${s.prem != null ? rateCell(s.prem, s.unit) : '<span class="muted">Not offered</span>'}</td>` : '';
    return `<tr><th scope="row">${esc(s.name)}</th><td>${rateCell(s.std, s.unit)}</td>${premium}</tr>`;
  }).join('');
  const rateTable = services.length
    ? `<section class="card" aria-labelledby="rates-h"><h2 id="rates-h">Our rates</h2>${asOf ? `<p class="note">Rates as of ${esc(asOf)}.</p>` : ''}
<div class="table-wrap"><table class="rtable"><thead><tr><th scope="col">Service</th><th scope="col">${anyPremium ? 'Standard' : 'Price'}</th>${anyPremium ? '<th scope="col">Premium</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div></section>`
    : '';

  const estimable = services.filter((s) => s.note == null);
  const first = estimable[0];
  const estimator = first
    ? `<section class="card" aria-labelledby="est-h"><h2 id="est-h">Estimate your job</h2>
<form class="est-form" id="estimator" data-wa-base="${esc(b.wa ? `https://wa.me/${b.wa}?text=` : '')}" data-name="${esc(b.name)}" novalidate>
<div class="field"><label for="est-svc">What do you need?</label><select id="est-svc">${estimable.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('')}</select></div>
<fieldset class="field tiers"><legend>Finish</legend>
<label class="tier"><input type="radio" name="tier" value="std" checked><span>Standard</span></label>
<label class="tier"><input type="radio" name="tier" value="prem"${first.prem == null ? ' disabled' : ''}><span>Premium</span></label>
</fieldset>
<div class="field"><label for="est-qty" id="est-qty-label">How many ${esc(first.unit)}?</label>
<input id="est-qty" type="number" inputmode="decimal" min="0" step="any" placeholder="For example 60" aria-describedby="est-help est-err">
<p class="hint" id="est-help">Not sure? A rough guess is fine. We measure on the site visit.</p>
<p class="err" id="est-err" hidden>Enter a number above 0.</p></div>
<div class="est-result" aria-live="polite"><p class="est-k">Approximate cost</p><p class="est-out" id="est-out">Enter a size to see an estimate</p><p class="note">Final price after a site visit.</p></div>
${b.wa ? `<a class="btn wa" id="est-wa" href="${esc(h.wa(`Hi ${b.name}, I'd like an estimate for my home.`))}">${icon('wa')}<span>Send this on WhatsApp</span></a>` : callButton(b, 'Call us with this estimate')}
</form>
<script type="application/json" id="rates-data">${scriptJson({ symbol: b.currency, services: estimable.map((s) => ({ name: s.name, std: s.std, prem: s.prem, unit: s.unit })) })}</script>
</section>`
    : '';

  const past = ctx.projects.filter((p) => p.price);
  const pastTable = past.length
    ? `<section class="card" aria-labelledby="past-h"><h2 id="past-h">What our past projects cost</h2>
<div class="table-wrap"><table class="ptable past"><thead><tr><th scope="col">Project</th><th scope="col">Cost</th></tr></thead><tbody>
${past.map((p) => `<tr><th scope="row"><a href="${esc(h.u(`project/${p.slug}/`))}">${esc(h.projectName(p))}</a>${p.area || p.finished ? `<span class="sub">${esc([p.area, p.finished].filter(Boolean).join(' · '))}</span>` : ''}</th><td>${h.money(p.price.total)}</td></tr>`).join('')}
</tbody></table></div></section>`
    : '';

  const body = `<section class="page-head wrap"><h1>Pricing</h1><p>Clear rates, an estimate in seconds, and what our past projects really cost.</p></section>
<div class="wrap pricing">${rateTable}${estimator}${pastTable}</div>`;
  return layout(ctx, h, { page: 'pricing', title: 'Pricing', description: `Rates, a quick cost estimate and past project prices from ${b.name}.`, path: 'pricing/', share: ctx.projects[0]?.share, body });
}

function showcaseGrid(h, photos, cls) {
  return `<div class="${cls}">${photos.map((photo) => `<figure class="mcard"><a href="${esc(h.photo(photo.l.name))}" data-lb="${photo.index}" aria-label="${esc(`Open photo: ${photo.caption || 'photo'}`)}">${img(h, photo, { sizes: '(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw' })}</a><figcaption>${photo.title ? `<strong>${esc(photo.title)}</strong>` : ''}${photo.desc ? `<span>${esc(photo.desc)}</span>` : ''}</figcaption></figure>`).join('')}</div>`;
}

function materialsPage(ctx, h) {
  const body = `<section class="page-head wrap"><h1>Materials we use</h1><p>The boards, finishes and fittings that go into our work. Ask us about grades and options.</p></section>
<section class="wrap">${showcaseGrid(h, ctx.materials, 'mgrid')}</section>
<script type="application/json" id="photos-data">${scriptJson(ctx.materials.map((photo) => h.item(photo)))}</script>`;
  return layout(ctx, h, { page: 'materials', title: 'Materials we use', description: `The materials ${ctx.business.name} uses: boards, finishes and fittings.`, path: 'materials/', share: ctx.projects[0]?.share, body });
}

function contactPage(ctx, h) {
  const b = ctx.business;
  const buttons = [
    waButton(h.wa(`Hi ${b.name}, I found your website and I'd like to ask about work for my home.`), 'WhatsApp us', ' big'),
    callButton(b, b.phone ? `Call ${b.phone}` : 'Call us', ' big'),
    b.email ? `<a class="btn big" href="mailto:${esc(b.email)}">${icon('mail')}<span>${esc(b.email)}</span></a>` : '',
  ].join('');
  const facts = [
    b.hours && `<div><dt>${icon('clock')}Working hours</dt><dd>${esc(b.hours)}</dd></div>`,
    b.areas.length && `<div><dt>${icon('map')}Areas we serve</dt><dd>${esc(b.areas.join(', '))}</dd></div>`,
    (b.address || b.map) && `<div><dt>${icon('pin')}Find us</dt><dd>${b.address ? esc(b.address) : ''}${b.map ? `${b.address ? '<br>' : ''}<a href="${esc(b.map)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ''}</dd></div>`,
  ].filter(Boolean).join('');
  const social = [
    b.instagram && `<a class="btn" href="${esc(b.instagram)}" target="_blank" rel="noopener">${icon('instagram')}<span>Instagram</span></a>`,
    b.facebook && `<a class="btn" href="${esc(b.facebook)}" target="_blank" rel="noopener">${icon('facebook')}<span>Facebook</span></a>`,
    b.youtube && `<a class="btn" href="${esc(b.youtube)}" target="_blank" rel="noopener">${icon('youtube')}<span>YouTube</span></a>`,
  ].filter(Boolean).join('');
  const body = `<section class="page-head wrap"><h1>Contact us</h1><p>Tell us about your home. We'll reply with a quote.</p></section>
<div class="wrap contact">
${buttons ? `<div class="contact-btns">${buttons}</div>` : ''}
${facts ? `<div class="card"><dl class="facts">${facts}</dl></div>` : ''}
${b.about ? `<section class="card" aria-labelledby="about-h"><h2 id="about-h">About us</h2><p>${esc(b.about)}</p></section>` : ''}
${ctx.team.length ? `<section aria-labelledby="team-h"><h2 id="team-h" class="sec-h">Our team</h2>${showcaseGrid(h, ctx.team, 'mgrid team')}</section>` : ''}
${social ? `<div class="btn-row social">${social}</div>` : ''}
</div>
${ctx.team.length ? `<script type="application/json" id="photos-data">${scriptJson(ctx.team.map((photo) => h.item(photo)))}</script>` : ''}`;
  return layout(ctx, h, { page: 'contact', title: 'Contact us', description: `Call or WhatsApp ${b.name}${b.areas.length ? `, serving ${b.areas.join(', ')}` : ''}.`, path: 'contact/', share: ctx.projects[0]?.share, body });
}

function notFoundPage(ctx, h) {
  const body = `<section class="page-head wrap"><h1>Page not found</h1><p>This page doesn't exist. It may have been moved or removed.</p><p><a class="btn primary" href="${esc(h.u(''))}">${icon('grid')}<span>See all projects</span></a></p></section>`;
  return layout(ctx, h, { page: '404', title: 'Page not found', description: 'Page not found.', body });
}

export function renderSite(ctx) {
  const h = helpers(ctx);
  const pages = [{ file: 'index.html', content: galleryPage(ctx, h) }];
  ctx.projects.forEach((project, position) => {
    pages.push({ file: `project/${project.slug}/index.html`, content: projectPage(ctx, h, project, position) });
    pages.push({ file: `project/${project.slug}/photos.json`, content: JSON.stringify(project.allPhotos.map((photo) => h.item(photo, project))) });
  });
  if (h.showPricing) pages.push({ file: 'pricing/index.html', content: pricingPage(ctx, h) });
  if (ctx.materials.length) pages.push({ file: 'materials/index.html', content: materialsPage(ctx, h) });
  pages.push({ file: 'contact/index.html', content: contactPage(ctx, h) });
  pages.push({ file: '404.html', content: notFoundPage(ctx, h) });
  pages.push({ file: '.nojekyll', content: '' });
  pages.push({ file: 'robots.txt', content: `User-agent: *\nAllow: /\n${ctx.siteUrl ? `Sitemap: ${h.abs('sitemap.xml')}\n` : ''}` });
  if (ctx.siteUrl) {
    const paths = ['', ...ctx.projects.map((p) => `project/${p.slug}/`), h.showPricing && 'pricing/', ctx.materials.length && 'materials/', 'contact/'].filter((p) => p !== false && p !== 0);
    pages.push({ file: 'sitemap.xml', content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `<url><loc>${esc(h.abs(p))}</loc></url>`).join('\n')}\n</urlset>\n` });
  }
  return pages;
}
