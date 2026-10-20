import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadContent, parseRate } from '../../src/content.mjs';
import { makeFixture, writeText, writePhoto } from '../helpers/fixture.mjs';

let root;
let content;
const warnings = [];

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-content-'));
  await makeFixture(root);
  content = await loadContent(root, (w) => warnings.push(w));
});
after(() => fs.rm(root, { recursive: true, force: true }));

const project = (num) => content.projects.find((p) => p.num === num);

test('projects are numbered from their folder names and shown newest first', () => {
  assert.deepEqual(content.projects.map((p) => p.num), [10, 4, 2, 1, null]);
  assert.deepEqual(content.projects.map((p) => p.slug), ['10', '4', '2', '1', 'new-villa']);
  assert.ok(warnings.some((w) => w.includes('"projects/new villa" has no number, so it is shown at the end') && w.includes('project-11')));
});

test('a folder without a number never changes the numbers of the others', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-numbers-'));
  await writePhoto(dir, 'projects/project-1/woodwork/a.jpg', 'wardrobe');
  await writePhoto(dir, 'projects/project-1 copy/woodwork/a.jpg', 'wardrobe');
  await writePhoto(dir, 'projects/Kondapur villa/woodwork/a.jpg', 'wardrobe');
  await writePhoto(dir, 'projects/పూజ/woodwork/a.jpg', 'wardrobe');
  const w = [];
  const c = await loadContent(dir, (m) => w.push(m));
  assert.deepEqual(c.projects.map((p) => [p.num, p.slug, p.folderTitle]), [
    [1, '1', 'Project 1'],
    [null, 'kondapur-villa', 'Kondapur villa'],
    [null, 'project-1-copy', 'Project-1 copy'],
    [null, c.projects[3].slug, 'పూజ'],
  ]);
  assert.match(c.projects[3].slug, /^p-[0-9a-f]{8}$/);
  assert.ok(w.some((m) => m.includes('Two project folders use the number 1')));
  await writePhoto(dir, 'projects/project-7/woodwork/a.jpg', 'wardrobe');
  const c2 = await loadContent(dir, () => {});
  assert.deepEqual(c2.projects.map((p) => p.slug), ['7', '1', 'kondapur-villa', 'project-1-copy', c.projects[3].slug]);
  await fs.rm(dir, { recursive: true, force: true });
});

test('folders that start with _ and projects without usable photos are left out', () => {
  assert.equal(content.projects.some((p) => p.folder === '_template'), false);
  assert.equal(project(3), undefined);
  assert.ok(warnings.some((w) => w.includes('projects/project-3 has no photos yet')));
  assert.ok(warnings.some((w) => w.includes('photo.heic') && w.includes('HEIC')));
  assert.ok(warnings.some((w) => w.includes('video.mp4') && w.includes('YouTube')));
});

test('chapters follow the story order and before/after photos pair up by name', () => {
  const p = project(1);
  assert.deepEqual(p.chapters.map((c) => c.key), ['before-after', 'woodwork', 'painting', 'team']);
  const ba = p.chapters[0];
  assert.deepEqual(ba.pairs.map((pair) => [pair.before.name, pair.after.name]), [['hall.jpg', 'hall.jpg'], ['kitchen.jpg', 'kitchen.jpg']]);
  assert.deepEqual(ba.photos.map((photo) => [photo.name, photo.label]), [['extra-corner.jpg', 'Before']]);
  assert.equal(p.allPhotos.length, 11);
  assert.deepEqual(p.chapters[1].photos.map((photo) => photo.name), ['01-tall-unit.jpg', '03-tv-unit.png', 'IMG_20261012_101010.jpg']);
  assert.deepEqual(p.chapters[1].photos.map((photo) => photo.caption), ['Tall unit', 'TV unit', '']);
});

test('project details, price and types are read from info.txt', () => {
  const p = project(1);
  assert.equal(p.title, 'Kitchen & "Dining" <Room>');
  assert.equal(p.area, 'North');
  assert.equal(p.days, '10 days');
  assert.equal(p.finished, 'Sep 2026');
  assert.deepEqual(p.types, ['Kitchens', 'Painting']);
  assert.equal(p.review, 'Very good work.');
  assert.deepEqual(p.price.items, [{ item: 'Cabinets', amount: 120000 }, { item: 'Paint', amount: 30000 }, { item: 'Hardware', amount: 15000 }]);
  assert.equal(p.price.total, 165000);
  assert.ok(warnings.some((w) => w.includes('projects/project-1/info.txt line') && w.includes('this line is wrong')));
});

test('a project with no info.txt uses its cover photo and loose photos', () => {
  const p = project(2);
  assert.equal(p.title, '');
  assert.equal(p.price, null);
  assert.equal(p.cover.name, 'cover.jpg');
  assert.equal(p.allPhotos[0], p.cover);
  assert.deepEqual(p.chapters.map((c) => c.key), ['photos']);
  assert.deepEqual(p.chapters[0].photos.map((photo) => photo.caption), ['A side view', '']);
  assert.deepEqual(p.types, []);
});

test('unknown folders become their own chapter, after the known ones', () => {
  const p = project(10);
  assert.deepEqual(p.chapters.map((c) => [c.title, c.id]), [['Woodwork', 'ch-woodwork'], ['Pooja room', 'ch-c1']]);
  assert.deepEqual(p.types, ['Wardrobes']);
  assert.equal(p.row.length, 5);
  assert.deepEqual(content.projects.find((x) => x.slug === 'new-villa').types, ['Woodwork']);
});

test('business details, phone numbers and links are tidied', () => {
  const b = content.business;
  assert.equal(b.name, 'Test Woodworks & Sons');
  assert.equal(b.wa, '919000000001');
  assert.equal(b.tel, '+919000000001');
  assert.equal(b.email, 'hello@example.com');
  assert.deepEqual(b.areas, ['North', 'South']);
  assert.equal(b.instagram, 'https://www.instagram.com/testwoodworks');
  assert.equal(b.map, 'https://www.google.com/maps/search/?api=1&query=Testville%20main%20road');
});

test('placeholder numbers hide the contact buttons and warn the owner', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-biz-'));
  await writeText(dir, 'site/business.txt', 'Business name: X\nPhone: +91 00000 00000\nWhatsApp: 91 00000 00000\nEmail: not-an-email\n');
  const w = [];
  const c = await loadContent(dir, (m) => w.push(m));
  assert.equal(c.business.wa, '');
  assert.equal(c.business.tel, '');
  assert.equal(c.business.email, '');
  assert.ok(w.some((m) => m.includes('add your Phone and WhatsApp numbers')));
  assert.ok(w.some((m) => m.includes("doesn't look right")));
  await fs.rm(dir, { recursive: true, force: true });
});

test('rates are read from rates.txt', () => {
  assert.equal(content.rates.asOf, 'Oct 2026');
  assert.deepEqual(content.rates.services, [
    { name: 'Wardrobes', std: 1200, prem: 1700, unit: 'sq ft' },
    { name: 'Painting', std: 18, prem: null, unit: 'sq ft' },
    { name: 'Repairs', note: 'Visit ₹500, then quoted' },
  ]);
  assert.deepEqual(parseRate('18/26 per sq ft'), { std: 18, prem: 26, unit: 'sq ft' });
  assert.deepEqual(parseRate('1,200 per running ft'), { std: 1200, prem: null, unit: 'running ft' });
  assert.deepEqual(parseRate('₹1500/sq ft'), { std: 1500, prem: null, unit: 'sq ft' });
  assert.deepEqual(parseRate('25000 per unit'), { std: 25000, prem: null, unit: 'unit' });
  assert.equal(parseRate('Visit ₹500, then quoted'), null);
});

test('materials and team photos take their name and note from the file name', () => {
  assert.deepEqual(content.materials.map((m) => [m.title, m.desc]), [['BWP ply', 'Strong and waterproof'], ['Laminate', '']]);
  assert.deepEqual(content.team.map((m) => [m.title, m.desc]), [['Lead carpenter', '10 years with us']]);
});

test('capital letters, doubled extensions, camera names and odd lines are all handled', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-quirks-'));
  await writeText(dir, 'site/Business.TXT', 'Business name: Caps Co\nPhone: 98765 43210 / 99887 76655\nWhatsApp: 98765 43210\nCurrency: Rs\n');
  await writeText(dir, 'site/rates.txt.txt', 'Doors = 2500 per doors\nPolish = Rs 40 per sq ft\n');
  await writePhoto(dir, 'site/LOGO.PNG', 'plywood', { width: 600, height: 200 });
  await writeText(dir, 'projects/project-1/Info.TXT', 'Title: Caps\nPrice:\nWardrobes = 1,92,000\nNote: GST extra\nKitchen = 1,45,000\nTitel: a typo\n');
  await writePhoto(dir, 'projects/project-1/woodwork/_DSC1234.JPG', 'wardrobe');
  await writePhoto(dir, 'projects/project-1/woodwork/photo.jfif', 'kitchen');
  await writeText(dir, 'projects/project-1/woodwork/quote.pdf', 'not a photo');
  await writePhoto(dir, 'projects/project-1/3D wall panels/01-panel.jpg', 'tvunit');
  const w = [];
  const c = await loadContent(dir, (m) => w.push(m));
  const p = c.projects[0];
  assert.equal(p.title, 'Caps');
  assert.deepEqual(p.price.items.map((i) => i.item), ['Wardrobes', 'Kitchen']);
  assert.equal(p.price.total, 337000);
  assert.equal(p.price.note, 'GST extra');
  assert.equal(p.about, '');
  assert.deepEqual(p.chapters.map((ch) => ch.title), ['Woodwork', '3D wall panels']);
  assert.deepEqual(p.chapters[0].photos.map((x) => x.name).sort(), ['_DSC1234.JPG', 'photo.jfif']);
  assert.ok(w.some((m) => m.includes('quote.pdf') && m.includes("isn't a photo")));
  assert.ok(w.some((m) => m.includes('"Titel"')));
  assert.equal(c.business.name, 'Caps Co');
  assert.equal(c.business.tel, '+919876543210');
  assert.equal(c.business.phone, '98765 43210');
  assert.equal(c.business.wa, '919876543210');
  assert.equal(c.business.currency, '₹');
  assert.ok(w.some((m) => m.includes('only the first phone number')));
  assert.deepEqual(c.rates.services, [{ name: 'Doors', std: 2500, prem: null, unit: 'doors' }, { name: 'Polish', std: 40, prem: null, unit: 'sq ft' }]);
  assert.ok(c.logo.endsWith('LOGO.PNG'));
  await fs.rm(dir, { recursive: true, force: true });
});

test('a WhatsApp number without a country code is refused outside India', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-wa-'));
  await writeText(dir, 'site/business.txt', 'Business name: X\nWhatsApp: 555 123 4567\nCurrency: $\n');
  const w = [];
  const c = await loadContent(dir, (m) => w.push(m));
  assert.equal(c.business.wa, '');
  assert.ok(w.some((m) => m.includes('country code')));
  await fs.rm(dir, { recursive: true, force: true });
});

test('a missing site folder and an empty projects folder do not break anything', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-empty-'));
  const w = [];
  const c = await loadContent(dir, (m) => w.push(m));
  assert.deepEqual(c.projects, []);
  assert.equal(c.business.name, 'Your business name');
  assert.ok(w.some((m) => m.includes('site/business.txt is missing')));
  await writePhoto(dir, 'projects/project-1/WOODWORK/Nested/Deeper/01-shelf.JPG', 'wardrobe');
  const c2 = await loadContent(dir, () => {});
  assert.equal(c2.projects[0].chapters[0].key, 'woodwork');
  assert.equal(c2.projects[0].allPhotos[0].caption, 'Shelf');
  await fs.rm(dir, { recursive: true, force: true });
});
