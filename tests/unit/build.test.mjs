import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { build, sizeReport } from '../../src/build.mjs';
import { checkSite } from '../../src/check.mjs';
import { makeFixture, writePhoto, writeText, FIXTURE_BASE } from '../helpers/fixture.mjs';

let root;
let out;
let result;
const SITE = 'https://example.github.io/woodwork-test';
const read = (rel) => fs.readFile(path.join(out, ...rel.split('/')), 'utf8');
const exists = (rel) => fs.access(path.join(out, ...rel.split('/'))).then(() => true, () => false);

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-build-'));
  await makeFixture(root);
  out = path.join(root, 'dist');
  result = await build({ root, out, base: FIXTURE_BASE, siteUrl: SITE });
});
after(() => fs.rm(root, { recursive: true, force: true }));

test('every page is built and every link and photo works', async () => {
  assert.equal(result.projects, 5);
  for (const rel of ['index.html', 'pricing/index.html', 'materials/index.html', 'contact/index.html', '404.html', 'robots.txt', 'sitemap.xml', '.nojekyll']) {
    assert.ok(await exists(rel), rel);
  }
  for (const slug of ['10', '4', '2', '1', 'new-villa']) {
    assert.ok(await exists(`project/${slug}/index.html`), `project ${slug}`);
    assert.ok(Array.isArray(JSON.parse(await read(`project/${slug}/photos.json`))));
  }
  const { problems, pages } = await checkSite(out, FIXTURE_BASE);
  assert.deepEqual(problems, []);
  assert.equal(pages, 11, 'ten public pages and the upload page (admin/)');
});

test('a damaged photo is skipped with a clear message and the rest still shows', async () => {
  assert.ok(result.warnings.some((w) => w.includes('images/project-4/woodwork/broken.jpg was skipped')));
  const list = JSON.parse(await read('project/4/photos.json'));
  assert.equal(list.length, 1);
});

test('the gallery lists projects newest first and nothing from the owner can break the page', async () => {
  const html = await read('index.html');
  const order = ['10', '4', '2', '1', 'new-villa'].map((n) => html.indexOf(`id="project-${n}"`));
  assert.ok(order.every((pos, i) => pos > 0 && (i === 0 || pos > order[i - 1])), `order ${order}`);
  assert.ok(html.includes('Kitchen &amp; &quot;Dining&quot; &lt;Room&gt;'));
  assert.ok(!html.includes('<Room>'));
  assert.ok(html.includes('Fine woodwork &lt;tested&gt;'));
  assert.ok(!html.includes('__dev'), 'no preview code on the real site');
});

test('links work under the GitHub Pages folder and link previews use full addresses', async () => {
  const html = await read('project/1/index.html');
  assert.ok(html.includes(`<link rel="stylesheet" href="${FIXTURE_BASE}assets/app.css?v=`));
  assert.match(html, new RegExp(`<meta property="og:image" content="${SITE}/assets/photos/[0-9a-f]{16}-share\\.jpg">`));
  assert.ok(html.includes(`<link rel="canonical" href="${SITE}/project/1/">`));
  const sitemap = await read('sitemap.xml');
  assert.ok(sitemap.includes(`<loc>${SITE}/project/10/</loc>`));
  const list = JSON.parse(await read('project/1/photos.json'));
  assert.equal(list.length, 11);
  assert.ok(list.every((p) => p.s.startsWith(`${FIXTURE_BASE}assets/photos/`) && p.l.startsWith(`${FIXTURE_BASE}assets/photos/`)));
});

test('WhatsApp and call links carry the project details', async () => {
  const html = await read('project/1/index.html');
  const wa = html.match(/href="(https:\/\/wa\.me\/919000000001\?text=[^"]*Project%201[^"]*)"/);
  assert.ok(wa, 'WhatsApp link for this project present');
  const href = wa[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const message = decodeURIComponent(href.split('text=')[1]);
  assert.equal(message, 'Hi Test Woodworks & Sons, I saw Project 1 (Kitchen & "Dining" <Room>, North) on your website. I\'d like a quote for something similar.');
  assert.ok(html.includes('href="tel:+919000000001"'));
});

test('prices show on the project and on the pricing page in rupees', async () => {
  const project = await read('project/1/index.html');
  assert.ok(project.includes('<th scope="row">Total</th><td>₹1,65,000</td>'));
  assert.ok(project.includes('Prices as of Sep 2026.'));
  const pricing = await read('pricing/index.html');
  assert.ok(pricing.includes('₹1,200<span class="unit"> / sq ft</span>'));
  assert.ok(pricing.includes('Visit ₹500, then quoted'));
  assert.ok(pricing.includes('<td>₹1,65,000</td>'));
  const data = JSON.parse(pricing.match(/<script type="application\/json" id="rates-data">(.*?)<\/script>/)[1]);
  assert.deepEqual(data.services.map((s) => s.name), ['Wardrobes', 'Painting']);
});

test('removed photos disappear from the website folder on the next build', async () => {
  const before = (await fs.readdir(path.join(out, 'assets', 'photos'))).length;
  await fs.rm(path.join(root, 'images', 'project-2'), { recursive: true });
  const again = await build({ root, out, base: FIXTURE_BASE, siteUrl: SITE });
  const after = (await fs.readdir(path.join(out, 'assets', 'photos'))).length;
  assert.equal(again.projects, 4);
  assert.ok(after < before, `${after} < ${before}`);
  assert.equal(await exists('project/2/index.html'), false);
  assert.deepEqual((await checkSite(out, FIXTURE_BASE)).problems, []);
});

test('preview builds tidy new photos and add the auto-refresh script', async () => {
  const file = await writePhoto(root, 'images/project-12/woodwork/IMG_1234.jpg', 'wardrobe', { width: 2400, height: 1600, exif: { IFD0: { Make: 'PhoneCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '17/1 24/1 0/1' } } });
  const devOut = path.join(root, 'preview');
  const r = await build({ root, out: devOut, base: '/', dev: true, cleanSources: true, settleMs: 0 });
  assert.ok(r.cleaned >= 1);
  const meta = await sharp(file).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.width, 2000);
  const html = await fs.readFile(path.join(devOut, 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="/__dev/reload.js"></script>'));
});

test('videos, and a site with nothing in it yet, build without problems', async () => {
  await writeText(root, 'images/Project 10/info.txt', 'Title: Pooja room and wardrobes\nVideo: https://youtu.be/abcdefghijk\n');
  await build({ root, out, base: FIXTURE_BASE, siteUrl: SITE });
  assert.ok((await read('project/10/index.html')).includes('src="https://www.youtube-nocookie.com/embed/abcdefghijk"'));

  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-empty-'));
  const emptyOut = path.join(empty, 'dist');
  const r = await build({ root: empty, out: emptyOut });
  assert.equal(r.projects, 0);
  const html = await fs.readFile(path.join(emptyOut, 'index.html'), 'utf8');
  assert.ok(html.includes('Photos of our work are coming soon.'));
  assert.equal(await fs.access(path.join(emptyOut, 'pricing')).then(() => true, () => false), false);
  assert.deepEqual((await checkSite(emptyOut, '/')).problems, []);
  await fs.rm(empty, { recursive: true, force: true });
});

test('a logo in site/ is used in the header and as the browser icon', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-logo-'));
  await writePhoto(dir, 'site/logo.png', 'plywood', { width: 900, height: 300 });
  await writePhoto(dir, 'images/project-1/woodwork/01-unit.jpg', 'wardrobe');
  const logoOut = path.join(dir, 'dist');
  const r = await build({ root: dir, out: logoOut });
  assert.equal(r.warnings.filter((w) => w.includes('logo')).length, 0);
  const html = await fs.readFile(path.join(logoOut, 'index.html'), 'utf8');
  assert.match(html, /<a class="brand" href="\/"><img src="\/assets\/photos\/[0-9a-f]{16}-logo\.png" width="360" height="120" alt="">/);
  assert.match(html, /<link rel="icon" type="image\/png" href="\/assets\/photos\/[0-9a-f]{16}-icon-64\.png">/);
  assert.deepEqual((await checkSite(logoOut, '/')).problems, []);
  await fs.rm(dir, { recursive: true, force: true });
});

test('the build refuses to write over your own folders', async () => {
  await assert.rejects(() => build({ root, out: root }), /Refusing/);
  await assert.rejects(() => build({ root, out: path.join(root, 'images') }), /Refusing/);
  await assert.rejects(() => build({ root, out: path.join(root, 'images', 'project-1') }), /Refusing/);
  await assert.rejects(() => build({ root, out: path.join(root, 'site', 'out') }), /Refusing/);
  await assert.rejects(() => build({ root, out: path.dirname(root) }), /Refusing/);
  if (process.platform === 'win32') await assert.rejects(() => build({ root, out: path.join(root, 'Projects') }), /Refusing/);
});

test('even the currency sign is written safely into the page', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-currency-'));
  await writeText(dir, 'site/business.txt', 'Business name: X\nCurrency: <b>\n');
  await writeText(dir, 'images/project-1/info.txt', 'Price:\nWork = 5000\n');
  await writePhoto(dir, 'images/project-1/woodwork/a.jpg', 'wardrobe');
  const dirOut = path.join(dir, 'dist');
  await build({ root: dir, out: dirOut });
  const html = await fs.readFile(path.join(dirOut, 'project', '1', 'index.html'), 'utf8');
  assert.ok(html.includes('&lt;b&gt;5,000'));
  assert.ok(!html.includes('<b>5,000'));
  await fs.rm(dir, { recursive: true, force: true });
});

test('the preview server answers strange addresses without crashing', async () => {
  const { createStaticServer, listen } = await import('../../src/serve.mjs');
  const server = createStaticServer({ dir: out, prefix: FIXTURE_BASE });
  const port = await listen(server, 4470);
  try {
    for (const bad of ['/%00', `${FIXTURE_BASE}%00`, `${FIXTURE_BASE}..%2f..%2fpackage.json`, '/%E0%A4%A']) {
      const res = await fetch(`http://127.0.0.1:${port}${bad}`);
      assert.ok([400, 403, 404].includes(res.status), `${bad} -> ${res.status}`);
    }
    const home = await fetch(`http://127.0.0.1:${port}${FIXTURE_BASE}`);
    assert.equal(home.status, 200);
  } finally {
    server.close();
  }
});

test('the build says how full the website and the photos in the repository are', () => {
  assert.ok(result.photoBytes > 0, 'the photos in images/ and site/ are counted');
  const quiet = sizeReport(300 * 1024 ** 2, 500 * 1024 ** 2);
  assert.match(quiet.text, /Website size: 300 MB of 1,024 MB \(29% of the free GitHub space\)\. Photos in the repository: 500 MB of about 1,024 MB \(49%\)\./);
  assert.equal(quiet.warning, '');
  assert.match(sizeReport(500 * 1024 ** 2, 900 * 1024 ** 2).warning, /^The photos in the repository are getting close to the 1 GB free limit/);
  assert.match(sizeReport(900 * 1024 ** 2, 500 * 1024 ** 2).warning, /^The website is getting close/);
  assert.match(sizeReport(1024 * 200, 0).text, /Website size: 0\.2 MB .*\(<1% of the free GitHub space\).*0\.0 MB/);
});
