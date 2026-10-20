// The upload page's rules (src/assets/admin-core.js): they must name photos, read and edit info.txt and
// number projects exactly like the website does, and save everything as one commit on GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjects } from '../../src/content.mjs';
import { captionFromFilename, isCameraName, parseAmount, parsePriceLine } from '../../src/util.mjs';
import { adminConfig } from '../../src/admin.mjs';
import { build, readGitHubRepo } from '../../src/build.mjs';
import { checkSite } from '../../src/check.mjs';
import { writePhoto, writeText } from '../helpers/fixture.mjs';
import { FakeGitHub, TEST_KEY, READ_ONLY_KEY, TEST_REPO } from '../helpers/fake-github.mjs';
import '../../src/assets/admin-core.js';

const core = globalThis.WoodworkUpload;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = adminConfig({ repo: TEST_REPO, base: '/woodwork-test/' });
const SHA = 'a'.repeat(40);
const entries = (paths) => paths.map((p) => ({ path: p, sha: SHA }));
const noWait = async () => {};

/** Runs the website's own reader (src/content.mjs) over a set of files. */
async function websiteProjects(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-admin-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(dir, ...rel.split('/'));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content);
    }
    const warnings = [];
    const projects = await loadProjects(dir, (w) => warnings.push(w));
    return { projects, warnings };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** What the website shows for an info.txt (with one photo next to it). */
async function shown(infoText) {
  const { projects } = await websiteProjects({ 'projects/project-1/info.txt': infoText, 'projects/project-1/woodwork/01-a.jpg': 'x' });
  const p = projects[0];
  return { title: p.title, area: p.area, size: p.size, days: p.days, finished: p.finished, types: p.types, about: p.about, review: p.review, reviewBy: p.reviewBy, videoId: p.videoId, videoUrl: p.videoUrl, price: p.price };
}

const FIXTURE_INFO = 'Title: Kitchen & "Dining" <Room>\nArea: North\nDays: 10\nFinished: Sep 2026\nType: Kitchens, Painting\nReview: Very good work.\nReview by: A client\nPrice:\nCabinets = 1,20,000\nPaint = ₹ 30k\nHardware: 15000\nthis line is wrong\n';

test('captions, camera names and prices are read exactly like the website reads them', () => {
  const names = ['01-master-wardrobe-sliding-doors.jpg', 'IMG_2041.jpg', 'WhatsApp Image 2026-10-12 at 14.32.12.jpeg', '03-tv-unit.png', 'kitchen.jpg',
    '1-Pooja room, teak finish.jpg', '12-3bhk hall.jpg', '07 Kitchen - after polish.jpg', '1000012345.jpg', 'image.jpg', 'photo 1.jpg', '0 defects.jpg',
    '2-Kitchen 10x12.jpg', '10-Flat 2026 kitchen.jpg', 'a_b c.jpg', '1-పూజ గది.jpg', 'cover.JPG', '.jpg', 'p1.jpg', '5.jpg', '20261012_101010.jpg'];
  for (const name of names) {
    assert.equal(core.captionFromFilename(name), captionFromFilename(name), name);
    assert.equal(core.isCameraName(name.replace(/\.[^.]*$/, '')), isCameraName(name.replace(/\.[^.]*$/, '')), name);
  }
  const amounts = ['1,92,000', '₹ 1,92,000', 'Rs. 8,000/-', 'INR 5000', '1.92 lakh', '1.5L', '65k', '2 crore', 'abc', '', '12 apples', '30k', 'constructor', '4.5 lakh'];
  for (const a of amounts) assert.equal(core.parseAmount(a), parseAmount(a), a);
  const lines = ['Wardrobes (3) = 1,92,000', 'Hardware: 15000', '- Door polish = 8000', '1. Door polish = 8000', 'Time: 10 = 500', 'Painting 2 coats 39000', '3 wardrobes = 90k', 'this line is wrong', '= 500', 'Wardrobe = lots', 'Total = 10'];
  for (const line of lines) assert.deepEqual(core.parsePriceLine(line), parsePriceLine(line), line);
});

test('projects are numbered from the files on GitHub exactly like the website numbers them', async () => {
  const folders = ['project-1', 'project-2', 'Project 10', 'p7', 'proj-003', 'new villa', '12 kitchen', 'project-1 copy', 'Templates', '_template', '.hidden', '~old'];
  const files = Object.fromEntries(folders.map((f) => [`projects/${f}/woodwork/01-a.jpg`, 'x']));
  const { projects } = await websiteProjects(files);
  const state = core.listProjects(entries([...Object.keys(files), 'projects/README.txt', 'site/business.txt', 'README.md']), config);
  const website = Object.fromEntries(projects.map((p) => [p.folder, p.num]));
  assert.deepEqual(Object.fromEntries(state.projects.map((p) => [p.folder, p.num])), website);
  assert.equal(state.next, Math.max(...projects.map((p) => p.num || 0)) + 1);
  assert.equal(state.next, 13);
  assert.deepEqual(state.projects.map((p) => p.folder), projects.map((p) => p.folder), 'same order as the gallery');
  assert.deepEqual(core.listProjects(entries(['README.md']), config), { projects: [], next: 1 });
});

test('new photos are named so the website shows the typed caption, and names are safe on Windows', () => {
  const empty = core.listProjects([], config);
  const project = { folder: 'project-1', num: 1, info: null, dirs: [], filesIn: new Map(), names: [], hasCover: false };
  const cases = [
    ['Master wardrobe sliding doors', 'Master wardrobe sliding doors'],
    ['tv unit with led strip', 'TV unit with LED strip'],
    ['Pooja room: teak / brass', 'Pooja room teak brass'],
    ['2 wardrobes', '2 wardrobes'],
    ['3bhk hall', '3BHK hall'],
    ['Kitchen 10x12', 'Kitchen 10x12'],
    ['Kitchen - after polish', 'Kitchen - after polish'],
    ['  spaces   everywhere  ', 'Spaces everywhere'],
    ['Wardrobe "premium" <laminate>?*|', 'Wardrobe premium laminate'],
    ['ends with dots...', 'Ends with dots'],
    ['photo 1 of the kitchen', 'Photo 1 of the kitchen'],
    ['shelf.jpg', 'Shelf'],
    ['पूजा कक्ष', 'पूजा कक्ष'],
    ['Kitchen 👍', 'Kitchen 👍'],
    ['A very long caption that goes on and on about the wardrobe and the kitchen and the hall', 'A very long caption that goes on and on about the wardrobe'],
  ];
  for (const [typed, expected] of cases) {
    const [name] = core.namePhotos({ project, folder: 'woodwork', photos: [{ caption: typed }], config });
    assert.equal(captionFromFilename(name), expected, `${typed} → ${name}`);
    assert.doesNotMatch(name, /[\\/:*?"<>|\u0000-\u001f]/, name);
    assert.doesNotMatch(name.replace(/\.jpg$/, ''), /[. ]$/, name);
    assert.ok(name.length <= 70, name);
    assert.equal(core.captionProblem(typed, name), '');
  }
  assert.equal(empty.next, 1);
  const [plain] = core.namePhotos({ project, folder: 'woodwork', photos: [{ caption: '' }], config });
  assert.equal(plain, '1.jpg');
  assert.equal(captionFromFilename(plain), '');

  // 6 or more digits in a name reads as a phone's camera name: the page warns instead of losing the caption silently.
  const nine = { ...project, dirs: ['woodwork'], filesIn: new Map([['woodwork', ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg', '06.jpg', '07.jpg', '08.jpg', '09.jpg']]]) };
  const [tenth] = core.namePhotos({ project: nine, folder: 'woodwork', photos: [{ caption: 'Flat 2026 kitchen' }], config });
  assert.equal(tenth, '10-Flat 2026 kitchen.jpg');
  assert.equal(captionFromFilename(tenth), '');
  assert.match(core.captionProblem('Flat 2026 kitchen', tenth), /too many numbers/);
});

test('photos go into the project\'s own chapter folders and continue their numbering', () => {
  const state = core.listProjects(entries([
    'projects/project-2/info.txt',
    'projects/project-2/1-Wood work/01-a.jpg',
    'projects/project-2/1-Wood work/02-b.jpg',
    'projects/project-2/1-Wood work/IMG_1234.jpg',
    'projects/project-2/1-Wood work/20261012_101010.jpg',
    'projects/project-2/1-Wood work/old/09-deep.jpg',
    'projects/project-2/Pooja Room/1.jpg',
    'projects/project-2/_drafts/1.jpg',
  ]), config);
  const project = state.projects[0];
  assert.deepEqual(project.dirs, ['1-Wood work', 'Pooja Room']);
  const plan = (chapter, photos) => core.planUpload({ state, request: { project: 'project-2', chapter, photos, changes: {} }, config });
  assert.deepEqual(plan({ key: 'woodwork' }, [{ caption: 'Shelf' }, { caption: '' }]).paths, ['projects/project-2/1-Wood work/3-Shelf.jpg', 'projects/project-2/1-Wood work/4.jpg']);
  assert.deepEqual(plan({ key: 'custom', name: 'pooja room' }, [{ caption: '' }]).paths, ['projects/project-2/Pooja Room/2.jpg']);
  assert.deepEqual(plan({ key: 'dir:Pooja Room' }, [{ caption: 'Bells' }]).paths, ['projects/project-2/Pooja Room/2-Bells.jpg']);
  assert.deepEqual(plan({ key: 'custom', name: ' 2 - Wood work ' }, [{ caption: '' }]).paths, ['projects/project-2/1-Wood work/3.jpg']);
  assert.deepEqual(plan({ key: 'custom', name: '_Balcony/../x:' }, [{ caption: '' }]).paths, ['projects/project-2/Balcony .. x/1.jpg']);
  assert.deepEqual(plan({ key: 'painting' }, [{ caption: '' }]).paths, ['projects/project-2/painting/1.jpg']);
  assert.deepEqual(plan({ key: 'photos' }, [{ caption: '' }]).paths, ['projects/project-2/photos/1.jpg']);
  assert.throws(() => plan(null, [{ caption: '' }]), (err) => err.kind === 'chapter');
  assert.throws(() => plan({ key: 'custom', name: '  ' }, [{ caption: '' }]), (err) => err.kind === 'chapter-name');
  assert.throws(() => core.planUpload({ state, request: { project: 'project-9', chapter: { key: 'woodwork' }, photos: [{}], changes: {} }, config }), (err) => err.kind === 'gone');
});

test('an after photo with the same caption as a before photo gets its name, so the website shows a slider', async () => {
  const before = ['01-Kitchen wall.jpg', '02-hall.jpg', 'extra-corner.jpg'];
  const files = Object.fromEntries(before.map((n) => [`projects/project-5/before/${n}`, 'x']));
  const state = core.listProjects(entries(Object.keys(files)), config);
  const project = state.projects[0];
  assert.deepEqual(core.partnerCaptions(project, 'after', config), ['Kitchen wall', 'Hall', 'Extra corner']);
  const plan = core.planUpload({ state, request: { project: 'project-5', chapter: { key: 'after' }, photos: [{ caption: 'kitchen wall' }, { caption: 'Hall' }, { caption: 'Extra corner' }, { caption: 'New angle' }], changes: {} }, config });
  assert.deepEqual(plan.names, ['01-Kitchen wall.jpg', '02-hall.jpg', 'extra-corner.jpg', '3-New angle.jpg']);
  for (const p of plan.paths) files[p] = 'x';
  const { projects } = await websiteProjects(files);
  const chapter = projects[0].chapters.find((c) => c.key === 'before-after');
  assert.equal(chapter.pairs.length, 3);
  assert.deepEqual(chapter.photos.map((p) => p.name), ['3-New angle.jpg']);

  // A name that is already used, whatever its capitals, is never reused.
  const taken = core.listProjects(entries(['projects/project-5/before/Kitchen.jpg', 'projects/project-5/after/kitchen.JPG']), config);
  assert.deepEqual(core.planUpload({ state: taken, request: { project: 'project-5', chapter: { key: 'after' }, photos: [{ caption: 'Kitchen' }], changes: {} }, config }).names, ['1-Kitchen.jpg']);
});

test('a new project gets the next number, its photos, an info.txt and a cover the website finds', async () => {
  const existing = { 'projects/project-1/woodwork/01-a.jpg': 'x', 'projects/Project 10/info.txt': 'Title: Ten\n', 'projects/Project 10/woodwork/1.jpg': 'x', 'projects/new villa/woodwork/01.jpg': 'x', 'projects/_template/info.txt': 'Title:\n', 'projects/README.txt': 'x' };
  const state = core.listProjects(entries(Object.keys(existing)), config);
  assert.equal(state.next, 11);
  const request = {
    project: core.NEW,
    chapter: { key: 'woodwork' },
    photos: [{ caption: 'Tall unit' }, { caption: '', cover: true }],
    changes: { title: 'Kitchen & <dining>', area: 'North', days: '12', type: 'Kitchens, Wardrobes', price: 'Cabinets = 1,20,000\nPaint = 30k', priceNote: 'GST extra' },
  };
  const plan = core.planUpload({ state, request, config });
  assert.equal(plan.folder, 'project-11');
  assert.deepEqual(plan.paths, ['projects/project-11/woodwork/1-Tall unit.jpg', 'projects/project-11/woodwork/2.jpg']);
  assert.equal(plan.info.path, 'projects/project-11/info.txt');
  assert.equal(plan.message, 'Add photos from phone: project-11 (new project, 2 photos in woodwork)');
  assert.equal(plan.info.text, 'Title: Kitchen & <dining>\nArea: North\nSize:\nDays: 12\nFinished:\nType: Kitchens, Wardrobes\nAbout:\n\nReview:\nReview by:\nVideo:\nCover: 2.jpg\n\nPrice:\nCabinets = 1,20,000\nPaint = 30k\nNote: GST extra\n');

  const files = { ...existing, [plan.info.path]: plan.info.text };
  for (const p of plan.paths) files[p] = 'x';
  const { projects, warnings } = await websiteProjects(files);
  const p11 = projects.find((p) => p.num === 11);
  assert.equal(projects[0], p11, 'shown first');
  assert.equal(p11.title, 'Kitchen & <dining>');
  assert.equal(p11.days, '12 days');
  assert.deepEqual(p11.types, ['Kitchens', 'Wardrobes']);
  assert.deepEqual(p11.price, { items: [{ item: 'Cabinets', amount: 120000 }, { item: 'Paint', amount: 30000 }], total: 150000, note: 'GST extra' });
  assert.equal(p11.cover.name, '2.jpg');
  assert.deepEqual(p11.chapters[0].photos.map((p) => p.caption), ['Tall unit', '']);
  assert.deepEqual(warnings.filter((w) => w.includes('project-11')), []);
});

test('a cover photo gets a name no other photo in the project has', () => {
  const state = core.listProjects(entries(['projects/project-3/woodwork/1.jpg', 'projects/project-3/woodwork/2.jpg']), config);
  const plan = core.planUpload({ state, request: { project: 'project-3', chapter: { key: 'painting' }, photos: [{ caption: '' }, { caption: '', cover: true }], changes: {} }, infoText: '', config });
  assert.deepEqual(plan.names, ['1.jpg', '3.jpg']);
  assert.match(plan.info.text, /\nCover: 3\.jpg\n/);
  // A project with a cover.jpg already keeps it.
  const withCover = core.listProjects(entries(['projects/project-3/cover.jpg', 'projects/project-3/woodwork/1.jpg']), config);
  assert.equal(withCover.projects[0].hasCover, true);
  assert.equal(core.planUpload({ state: withCover, request: { project: 'project-3', chapter: { key: 'woodwork' }, photos: [{ caption: '', cover: true }], changes: {} }, config }).info, null);
});

test('the form shows what the website shows from info.txt, and writing it back changes nothing on the website', async () => {
  const template = await fs.readFile(path.join(projectRoot, 'projects', '_template', 'info.txt'), 'utf8');
  const samples = [
    FIXTURE_INFO,
    template,
    'Project name: Old\nTitle:\nLocation = Green Park\nDuration: 6 weeks\nCompleted on: Jan 2026\nTags: Kitchens / Wardrobes\nDescription: Two rooms.\nTestimonial: Great.\nClient: Owner\nYoutube: https://youtu.be/abcdefghijk\nCost: 4.5 lakh\n',
    '﻿Title: BOM file\r\nArea: X\r\nPrice:\r\nKitchen = 1,00,000\r\nNote: GST extra\r\nExtra work = 5000\r\n',
    'Title: Only a title',
    '',
    '# just a note\n',
    'Title: A\nTitle: B\nPrices:\nA = 1\nPrice:\nB = 2\nTotal = 10\n',
    'Title: Video link\nVideo: https://example.com/walkthrough\nPrice: 4,80,000\n',
  ];
  for (const original of samples) {
    const values = core.readInfo(original, config);
    assert.deepEqual(await shown(core.newInfo(values)), await shown(original), JSON.stringify(original));
  }
  const fixture = core.readInfo(FIXTURE_INFO, config);
  assert.equal(fixture.title, 'Kitchen & "Dining" <Room>');
  assert.equal(fixture.reviewBy, 'A client');
  assert.equal(fixture.price, 'Cabinets = 1,20,000\nPaint = ₹ 30k\nHardware: 15000\nthis line is wrong');
  assert.equal(core.readInfo('Title: X\nPrice: 4,80,000\n', config).price, 'Total = 4,80,000');
});

test('changing a detail edits only that line of info.txt', async () => {
  assert.equal(core.updateInfo(FIXTURE_INFO, { area: 'North East' }, config), FIXTURE_INFO.replace('Area: North\n', 'Area: North East\n'));

  // Notes, the owner's own spelling, "=" and Windows line endings all stay.
  const windows = 'Project name = Old kitchen\r\n# a note\r\nLocation: Green Park\r\nCost: 4.5 lakh\r\n';
  const edited = core.updateInfo(windows, { title: 'New kitchen', area: '', price: 'Kitchen = 1,00,000' }, config);
  assert.equal(edited, 'Project name = New kitchen\r\n# a note\r\nLocation:\r\nCost:\r\nKitchen = 1,00,000\r\n');
  const site = await shown(edited);
  assert.equal(site.title, 'New kitchen');
  assert.equal(site.area, '');
  assert.deepEqual(site.price, { items: [{ item: 'Kitchen', amount: 100000 }], total: 100000, note: '' });

  // Missing lines are added where they belong; a note goes under the price.
  assert.equal(core.updateInfo('Title: A', { area: 'B', priceNote: 'GST extra', price: 'X = 5' }, config), 'Title: A\nArea: B\n\nPrice:\nX = 5\nNote: GST extra');

  // Clearing a field clears every spelling of it, so the website really shows nothing.
  const cleared = core.updateInfo('Title: A\nName: B\n', { title: '' }, config);
  assert.equal(cleared, 'Title:\nName:\n');
  assert.equal((await shown(cleared)).title, '');

  // The template keeps its notes; the price list replaces the old one; price lines after a Note go too.
  const template = await fs.readFile(path.join(projectRoot, 'projects', '_template', 'info.txt'), 'utf8');
  const filled = core.updateInfo(template, { title: 'Kitchen', cover: '2.jpg', priceNote: 'GST extra', price: 'Cabinets = 1,20,000\nPaint = 30k' }, config);
  const lines = filled.split(/\r?\n/);
  assert.ok(lines.includes('Title: Kitchen'));
  assert.equal(lines[lines.indexOf('Video:') + 1], 'Cover: 2.jpg');
  const price = lines.indexOf('Price:');
  assert.deepEqual(lines.slice(price, price + 4), ['Price:', 'Cabinets = 1,20,000', 'Paint = 30k', 'Note: GST extra']);
  for (const note of template.split(/\r?\n/).filter((l) => l.startsWith('#'))) assert.ok(lines.includes(note), note);
  const repriced = core.updateInfo('Title: T\nPrice:\nA = 1\nNote: GST\nB = 2\n', { price: 'C = 3' }, config);
  assert.equal(repriced, 'Title: T\nPrice:\nC = 3\nNote: GST\n');
  assert.deepEqual((await shown(repriced)).price, { items: [{ item: 'C', amount: 3 }], total: 3, note: 'GST' });
  assert.equal(core.updateInfo('Title: T\nPrice: 5000\n', { price: '' }, config), 'Title: T\n');
  assert.equal(core.updateInfo('', { title: 'Fresh' }, config), core.newInfo({ title: 'Fresh' }));
  assert.equal(core.updateInfo('Title: Same\n', { title: 'Same' }, config), 'Title: Same\n');
});

test('a price list that the website couldn\'t read is pointed out before publishing', () => {
  assert.deepEqual(core.checkPrice('Wardrobes = 1,92,000\n\n# a note\nPainting 2 coats 39000\nTotal = 2,31,000', config), []);
  const problems = core.checkPrice('Kitchen = 1 lakh\nthis line is wrong\nTime = 500', config);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /line 2: write it like/);
  assert.match(problems[1], /line 3: “Time” can't be used/);
});

test('photos are made at most 2000 px, never bigger, and odd files are refused with a reason', () => {
  assert.deepEqual(core.fitInside(3000, 2000, 2000), { width: 2000, height: 1333 });
  assert.deepEqual(core.fitInside(2000, 3000, 2000), { width: 1333, height: 2000 });
  assert.deepEqual(core.fitInside(4032, 3024, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(core.fitInside(1500, 1000, 2000), { width: 1500, height: 1000 });
  assert.deepEqual(core.fitInside(8000, 100, 2000), { width: 2000, height: 25 });
  assert.deepEqual(core.fitInside(40000, 10, 2000), { width: 2000, height: 1 });
  assert.equal(core.checkFile({ name: 'IMG_1.jpg', type: 'image/jpeg', size: 5e6 }), null);
  assert.equal(core.checkFile({ name: '1000012345.jpg', type: '', size: 5e6 }), null);
  assert.equal(core.checkFile({ name: 'clip.mp4', type: 'video/mp4', size: 5e6 }).kind, 'video');
  assert.equal(core.checkFile({ name: 'clip.MOV', type: '', size: 5e6 }).kind, 'video');
  const big = core.checkFile({ name: 'huge.jpg', type: 'image/jpeg', size: 52 * 1024 * 1024 });
  assert.equal(big.kind, 'toobig');
  assert.match(big.text, /too big \(52 MB/);
  assert.equal(core.checkFile({ name: 'list.pdf', type: 'application/pdf', size: 1e5 }).kind, 'notphoto');
  assert.match(core.unreadableText({ name: 'IMG_1.HEIC', type: '' }), /HEIC/);
  assert.match(core.tooManyPixelsText(12000, 9000), /108 megapixels/);
});

test('the key is checked for its shape, and the repository is known even on a plain github.io address', () => {
  assert.equal(core.checkKeyFormat(TEST_KEY), '');
  assert.equal(core.checkKeyFormat('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), '');
  assert.match(core.checkKeyFormat(''), /Paste/);
  assert.match(core.checkKeyFormat('my password'), /doesn’t look like a GitHub key/);
  assert.equal(core.findRepo({ repo: 'me/site', base: '/' }, { hostname: 'example.com' }), 'me/site');
  assert.equal(core.findRepo({ repo: '', base: '/website/' }, { hostname: 'yourwoodworks.github.io' }), 'yourwoodworks/website');
  assert.equal(core.findRepo({ repo: '', base: '/' }, { hostname: 'yourwoodworks.github.io' }), 'yourwoodworks/yourwoodworks.github.io');
  assert.equal(core.findRepo({ repo: '', base: '/' }, { hostname: 'yourwoodworks.in' }), '');
  assert.equal(core.findRepo({ repo: 'bad repo/x', base: '/' }, { hostname: 'localhost' }), '');
});

test('text from GitHub is read in any encoding and sent back as UTF-8', () => {
  const text = 'Title: Rs ₹ 1,20,000 — पूजा\nArea: X\n';
  assert.equal(core.decodeText(core.base64ToBytes(core.textToBase64(text))), text);
  assert.equal(Buffer.from(core.textToBase64(text), 'base64').toString('utf8'), text);
  assert.equal(core.decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]))), text);
  assert.equal(core.decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]))), text);
  assert.equal(core.decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]))), text);
  const big = new Uint8Array(200000).map((_, i) => i % 251);
  assert.deepEqual(core.base64ToBytes(core.bytesToBase64(big)), big);
});

/* ---------- Saving to GitHub (against the fake GitHub in tests/helpers/fake-github.mjs) ---------- */

const REPO_FILES = {
  'README.md': '# Woodwork website\n',
  'projects/README.txt': 'How to add a project\n',
  'projects/_template/info.txt': 'Title:\n',
  'projects/project-1/info.txt': 'Title: First\n',
  'projects/project-1/woodwork/01-a.jpg': 'jpeg-a',
  'projects/project-2/info.txt': '# notes stay\nTitle: Second\nArea: North\n\nPrice:\nKitchen = 1,00,000\n',
  'projects/project-2/woodwork/01-unit.jpg': 'jpeg-b',
  'projects/project-2/before/kitchen.jpg': 'jpeg-c',
};
const readBase64 = async (photo) => Buffer.from(photo.bytes).toString('base64');
const photos = (...texts) => texts.map((t) => ({ bytes: t }));
const shape = (log) => log.map((r) => `${r.method} ${r.path.replace(`/repos/${TEST_REPO}`, '').replace(/[0-9a-f]{40}/, '<sha>').replace(/\?fresh=\w+$/, '')}`);

test('a new project is saved as ONE commit: photos, then tree, commit and branch', async () => {
  const fake = new FakeGitHub({ files: REPO_FILES });
  const client = core.createClient({ token: TEST_KEY, repo: TEST_REPO, fetchImpl: fake.fetch, wait: noWait });
  const progress = [];
  const request = { project: core.NEW, chapter: { key: 'painting' }, photos: [{ caption: 'Accent wall' }, { caption: '' }], changes: { title: 'Fresh paint', price: 'Painting = 39000' } };
  const result = await core.publish({ client, config, request, photos: photos('one', 'two'), readBase64, onProgress: (p) => progress.push(`${p.stage} ${p.done}/${p.total}`) });
  assert.equal(result.num, 3);
  assert.deepEqual(progress, ['send 0/2', 'send 1/2', 'save 2/2']);
  const history = fake.history();
  assert.equal(history.length, 2);
  assert.deepEqual(history[0].parents, [fake.firstCommit]);
  assert.equal(history[0].message, 'Add photos from phone: project-3 (new project, 2 photos in painting)');
  assert.equal(result.commit, fake.head);
  const files = fake.files();
  assert.equal(files['projects/project-3/painting/1-Accent wall.jpg'].toString(), 'one');
  assert.equal(files['projects/project-3/painting/2.jpg'].toString(), 'two');
  assert.equal(fake.text('projects/project-3/info.txt'), core.newInfo({ title: 'Fresh paint', price: 'Painting = 39000' }));
  for (const [p, content] of Object.entries(REPO_FILES)) assert.equal(files[p].toString(), content, `${p} untouched`);
  assert.equal(Object.keys(files).length, Object.keys(REPO_FILES).length + 3);
  assert.deepEqual(shape(fake.log), [
    'POST /git/blobs',
    'POST /git/blobs',
    'GET /git/ref/heads/main',
    'GET /git/commits/<sha>',
    'GET /git/trees/<sha>?recursive=1',
    'POST /git/blobs',
    'POST /git/trees',
    'POST /git/commits',
    'PATCH /git/refs/heads/main',
  ]);
  assert.ok(fake.log.every((r) => r.auth && !r.urlHasKey), 'the key is only ever in the Authorization header');
});

test('the key goes only to api.github.com, in the Authorization header', async () => {
  const fake = new FakeGitHub({ files: REPO_FILES });
  const seen = [];
  const spy = async (url, init) => {
    seen.push({ url, init });
    return fake.fetch(url, init);
  };
  const client = core.createClient({ token: TEST_KEY, repo: TEST_REPO, fetchImpl: spy, wait: noWait });
  await client.checkAccess();
  await core.publish({ client, config, request: { project: 'project-1', chapter: { key: 'woodwork' }, photos: [{ caption: '' }], changes: {} }, photos: photos('x'), readBase64 });
  assert.ok(seen.length > 5);
  for (const { url, init } of seen) {
    assert.ok(url.startsWith('https://api.github.com/repos/test-owner/woodwork-test'), url);
    assert.ok(!url.includes(TEST_KEY));
    assert.equal(init.headers.Authorization, `Bearer ${TEST_KEY}`);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, undefined, 'no cache setting: some browsers then add headers GitHub refuses');
    assert.ok(!(init.body || '').includes(TEST_KEY));
    // Only headers GitHub allows from a web page (a different one would make every phone request fail).
    assert.deepEqual(Object.keys(init.headers).filter((h) => !['Accept', 'Authorization', 'Content-Type'].includes(h)), []);
  }
  // Where the branch is now is asked at a new address every time, so a browser never answers from its cache.
  const branchAsks = seen.filter(({ url }) => url.includes('/git/ref/heads/main'));
  assert.ok(branchAsks.length >= 1);
  await client.head();
  await client.head();
  const urls = seen.filter(({ url }) => url.includes('/git/ref/heads/main')).map(({ url }) => url);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((url) => /\/git\/ref\/heads\/main\?fresh=[0-9a-z]+$/.test(url)), urls.join(' '));
});

test('if something else is saved at the same moment, the upload is worked out again on top of it', async () => {
  const fake = new FakeGitHub({ files: REPO_FILES });
  fake.beforeMove = (gh) => gh.pushFromElsewhere({ 'projects/project-3/info.txt': 'Title: From the computer\n', 'projects/project-3/woodwork/1.jpg': 'pc' });
  const client = core.createClient({ token: TEST_KEY, repo: TEST_REPO, fetchImpl: fake.fetch, wait: noWait });
  const sent = photos('one');
  const result = await core.publish({ client, config, request: { project: core.NEW, chapter: { key: 'woodwork' }, photos: [{ caption: '' }], changes: {} }, photos: sent, readBase64 });
  assert.equal(result.num, 4, 'project 3 was taken in the meantime');
  const history = fake.history();
  assert.deepEqual(history.map((c) => c.message), ['Add photos from phone: project-4 (new project, 1 photo in woodwork)', 'Update projects and photos', 'First version']);
  assert.equal(fake.text('projects/project-3/info.txt'), 'Title: From the computer\n', 'the other save is kept');
  assert.equal(fake.files()['projects/project-4/woodwork/1.jpg'].toString(), 'one');
  assert.equal(fake.log.filter((r) => r.method === 'POST' && r.path.endsWith('/git/blobs')).length, 3, 'the photo was sent once (plus info.txt twice)');
});

test('an existing project gets its photos and only the changed details', async () => {
  const fake = new FakeGitHub({ files: REPO_FILES });
  const client = core.createClient({ token: TEST_KEY, repo: TEST_REPO, fetchImpl: fake.fetch, wait: noWait });
  const result = await core.publish({ client, config, request: { project: 'project-2', chapter: { key: 'woodwork' }, photos: [{ caption: 'Shelf', cover: true }], changes: { area: 'North East' } }, photos: photos('shelf'), readBase64 });
  assert.equal(result.message, 'Add photos from phone: project-2 (1 photo in woodwork, details updated)');
  assert.equal(fake.text('projects/project-2/info.txt'), '# notes stay\nTitle: Second\nArea: North East\nCover: 2-Shelf.jpg\n\nPrice:\nKitchen = 1,00,000\n');
  assert.equal(fake.files()['projects/project-2/woodwork/2-Shelf.jpg'].toString(), 'shelf');

  const details = await core.publish({ client, config, request: { project: 'project-2', chapter: null, photos: [], changes: { title: 'Second, renamed' } }, photos: [], readBase64 });
  assert.equal(details.message, 'Update details from phone: project-2');
  assert.match(fake.text('projects/project-2/info.txt'), /^# notes stay\nTitle: Second, renamed\n/);

  const before = fake.head;
  const same = await core.publish({ client, config, request: { project: 'project-2', chapter: null, photos: [], changes: { area: 'North East' } }, photos: [], readBase64 });
  assert.equal(same.unchanged, true);
  assert.equal(fake.head, before, 'nothing new, so no commit');
});

test('a lost connection keeps the photos that already arrived, and Publish again finishes the job', async () => {
  const fake = new FakeGitHub({ files: REPO_FILES });
  let offline = false;
  let blobs = 0;
  const flaky = async (url, init) => {
    if (init.method === 'POST' && url.endsWith('/git/blobs') && ++blobs === 2) offline = true;
    if (offline) throw new TypeError('Failed to fetch');
    return fake.fetch(url, init);
  };
  const client = core.createClient({ token: TEST_KEY, repo: TEST_REPO, fetchImpl: flaky, wait: noWait, isOnline: () => !offline });
  const sent = photos('one', 'two');
  const request = { project: core.NEW, chapter: { key: 'woodwork' }, photos: [{ caption: '' }, { caption: '' }], changes: {} };
  await assert.rejects(() => core.publish({ client, config, request, photos: sent, readBase64 }), (err) => err.kind === 'offline');
  assert.ok(sent[0].sha && !sent[1].sha);
  assert.match(core.describeError({ kind: 'offline' }, TEST_REPO), /No internet.*tap Publish again/);
  assert.equal(fake.head, fake.firstCommit, 'nothing half-saved');
  offline = false;
  await core.publish({ client, config, request, photos: sent, readBase64 });
  const photoBlobs = fake.log.filter((r) => r.method === 'POST' && r.path.endsWith('/git/blobs')).length;
  assert.equal(photoBlobs, 3, 'photo one was not sent twice (two photos and info.txt)');
  assert.equal(fake.files()['projects/project-3/woodwork/2.jpg'].toString(), 'two');
});

test('a save whose answer was lost is found again, never saved twice', async () => {
  const fake = new FakeGitHub({ files: REPO_FILES });
  let mode = 'normal';
  const lossy = async (url, init) => {
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    const res = await fake.fetch(url, init);
    if (init.method === 'PATCH' && mode === 'lose the answer') {
      mode = 'offline';
      throw new TypeError('Failed to fetch');
    }
    return res;
  };
  const client = core.createClient({ token: TEST_KEY, repo: TEST_REPO, fetchImpl: lossy, wait: noWait, isOnline: () => mode !== 'offline' });
  const memo = {};
  const sent = photos('one', 'two');
  const request = { project: core.NEW, chapter: { key: 'woodwork' }, photos: [{ caption: '' }, { caption: '' }], changes: { title: 'Lost answer' } };
  mode = 'lose the answer';
  await assert.rejects(() => core.publish({ client, config, request, photos: sent, readBase64, memo }), (err) => err.kind === 'offline');
  assert.equal(fake.history().length, 2, 'GitHub did save it');
  assert.ok(memo.commit, 'the page remembers what it tried to save');
  mode = 'normal';
  const again = await core.publish({ client, config, request, photos: sent, readBase64, memo });
  assert.equal(again.earlier, true);
  assert.equal(again.num, 3);
  assert.deepEqual(again.sent, sent);
  assert.equal(fake.history().length, 2, 'nothing was saved twice');
  assert.deepEqual(memo, {});
  assert.deepEqual(Object.keys(fake.files()).filter((p) => p.startsWith('projects/project-4/')), []);

  // The answer is lost, the repeated request is refused because the branch is already there: still one save.
  let lose = true;
  const blip = async (url, init) => {
    const res = await fake.fetch(url, init);
    if (init.method === 'PATCH' && lose) {
      lose = false;
      fake.failures.push({ method: 'PATCH', path: `/repos/${TEST_REPO}/git/refs/heads/main`, status: 422, json: { message: 'Update is not a fast forward' } });
      throw new TypeError('Failed to fetch');
    }
    return res;
  };
  const client2 = core.createClient({ token: TEST_KEY, repo: TEST_REPO, fetchImpl: blip, wait: noWait });
  const result = await core.publish({ client: client2, config, request: { project: 'project-1', chapter: { key: 'woodwork' }, photos: [{ caption: '' }], changes: {} }, photos: photos('three'), readBase64, memo: {} });
  assert.equal(result.commit, fake.head);
  assert.equal(fake.history().length, 3);
  assert.deepEqual(Object.keys(fake.files()).filter((p) => p.startsWith('projects/project-1/woodwork/')).sort(), ['projects/project-1/woodwork/01-a.jpg', 'projects/project-1/woodwork/2.jpg']);
});

test('every GitHub problem becomes a clear message', async () => {
  const fake = new FakeGitHub({ files: REPO_FILES });
  const make = (token, repo = TEST_REPO, options = {}) => core.createClient({ token, repo, fetchImpl: fake.fetch, wait: noWait, ...options });
  const kind = async (promise) => promise.then(() => 'ok', (err) => err.kind);

  assert.equal(await kind(make(TEST_KEY).checkAccess()), 'ok');
  assert.equal(await kind(make(`${TEST_KEY}x`).checkAccess()), 'auth');
  assert.equal(await kind(make(READ_ONLY_KEY).checkAccess()), 'forbidden');
  assert.equal(await kind(make(TEST_KEY, 'test-owner/other').checkAccess()), 'notfound');
  assert.match(core.describeError({ kind: 'auth' }, TEST_REPO, 'connect'), /wrong or has expired/);
  assert.match(core.describeError({ kind: 'forbidden' }, TEST_REPO, 'connect'), /Contents: Read and write/);
  assert.match(core.describeError({ kind: 'notfound' }, TEST_REPO, 'connect'), /can't find test-owner\/woodwork-test/);

  // GitHub having a bad moment: tried again after a short wait.
  const waits = [];
  fake.failures.push({ method: 'GET', path: `/repos/${TEST_REPO}/git/ref/heads/main`, status: 502 }, { method: 'GET', path: `/repos/${TEST_REPO}/git/ref/heads/main`, status: 503 });
  assert.equal(await kind(make(TEST_KEY, TEST_REPO, { wait: async (ms) => waits.push(ms) }).head()), 'ok');
  assert.deepEqual(waits, [1000, 4000]);
  fake.failures.push(...[1, 2, 3].map(() => ({ method: 'GET', path: `/repos/${TEST_REPO}/git/ref/heads/main`, status: 500 })));
  assert.equal(await kind(make(TEST_KEY).head()), 'server');

  // Too many requests: wait when GitHub says how long, otherwise stop and say so.
  fake.failures.push({ method: 'GET', path: `/repos/${TEST_REPO}`, status: 403, json: { message: 'You have exceeded a secondary rate limit.' }, headers: { 'retry-after': '3' } });
  const rateWaits = [];
  assert.equal(await kind(make(TEST_KEY, TEST_REPO, { wait: async (ms) => rateWaits.push(ms) }).checkAccess()), 'ok');
  assert.deepEqual(rateWaits, [3000]);
  fake.failures.push({ method: 'GET', path: `/repos/${TEST_REPO}`, status: 403, json: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0' } });
  assert.equal(await kind(make(TEST_KEY).checkAccess()), 'rate');

  // A dropped connection is tried again; with no internet at all, the page says so at once.
  let drops = 2;
  const dropping = async (url, init) => {
    if (drops-- > 0) throw new TypeError('Failed to fetch');
    return fake.fetch(url, init);
  };
  assert.equal(await kind(make(TEST_KEY, TEST_REPO, { fetchImpl: dropping }).checkAccess()), 'ok');
  assert.equal(await kind(make(TEST_KEY, TEST_REPO, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }).head()), 'network');
  assert.equal(await kind(make(TEST_KEY, TEST_REPO, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, isOnline: () => false }).head()), 'offline');

  // An empty repository, and someone else saving every single time.
  fake.failures.push({ method: 'GET', path: `/repos/${TEST_REPO}/git/ref/heads/main`, status: 409, json: { message: 'Git Repository is empty.' } });
  assert.equal(await kind(make(TEST_KEY).head()), 'empty');
  fake.failures.push(...[1, 2, 3].map(() => ({ method: 'PATCH', path: `/repos/${TEST_REPO}/git/refs/heads/main`, status: 422, json: { message: 'Update is not a fast forward' } })));
  const busy = core.publish({ client: make(TEST_KEY), config, request: { project: 'project-1', chapter: { key: 'woodwork' }, photos: [{ caption: '' }], changes: {} }, photos: photos('x'), readBase64 });
  assert.equal(await kind(busy), 'conflict');
  assert.equal(fake.head, fake.firstCommit);
  for (const k of ['offline', 'network', 'timeout', 'auth', 'forbidden', 'notfound', 'rate', 'conflict', 'toolarge', 'server', 'empty', 'gone', 'toomany', 'chapter', 'chapter-name', 'odd']) {
    const text = core.describeError({ kind: k, message: 'detail' }, TEST_REPO);
    assert.ok(text.length > 20 && !text.includes(TEST_KEY), k);
  }
});

/* ---------- The page in the built website ---------- */

test('the upload page is built at admin/, never linked, not indexed, and only talks to GitHub', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-admin-site-'));
  try {
    await writeText(dir, 'site/business.txt', 'Business name: Test & Sons\nPhone: 90000 00001\n');
    await writeText(dir, 'site/rates.txt', 'Wardrobes = 1200 per sq ft\n');
    await writeText(dir, 'projects/project-1/info.txt', 'Title: First </script><b>\n');
    await writePhoto(dir, 'projects/project-1/woodwork/01-a.jpg', 'wardrobe');
    await writePhoto(dir, 'projects/new villa/woodwork/01.jpg', 'kitchen');
    const out = path.join(dir, 'dist');
    await build({ root: dir, out, base: '/website/', siteUrl: 'https://me.github.io/website', repo: 'me/website' });
    const html = await fs.readFile(path.join(out, 'admin', 'index.html'), 'utf8');
    assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
    assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*connect-src &#39;self&#39; https:\/\/api\.github\.com;/);
    assert.ok(html.includes('<script src="/website/assets/admin-core.js?v='));
    assert.ok(!html.includes('<b>'), 'text from the owner is escaped');
    const data = JSON.parse(html.match(/<script type="application\/json" id="up-config">(.*?)<\/script>/s)[1]);
    assert.equal(data.repo, 'me/website');
    assert.equal(data.branch, 'main');
    assert.equal(data.base, '/website/');
    assert.equal(data.maxSide, 2000);
    assert.equal(data.quality, 0.84);
    assert.deepEqual(data.projects, [{ folder: 'project-1', slug: '1', title: 'First </script><b>' }, { folder: 'new villa', slug: 'new-villa', title: '' }]);
    for (const page of ['index.html', 'project/1/index.html', 'pricing/index.html', 'contact/index.html', '404.html', 'sitemap.xml', 'robots.txt']) {
      assert.ok(!(await fs.readFile(path.join(out, ...page.split('/')), 'utf8')).includes('admin'), `${page} doesn't mention the upload page`);
    }
    assert.deepEqual((await checkSite(out, '/website/')).problems, []);

    // The preview's auto-refresh would interrupt an upload, so the upload page never has it.
    await build({ root: dir, out, base: '/', dev: true });
    const dev = await fs.readFile(path.join(out, 'admin', 'index.html'), 'utf8');
    assert.ok(!dev.includes('__dev'));
    assert.ok((await fs.readFile(path.join(out, 'index.html'), 'utf8')).includes('/__dev/reload.js'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('the repository is read from this folder\'s GitHub connection', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-git-'));
  try {
    assert.equal(await readGitHubRepo(dir), '');
    const urls = {
      'https://github.com/yourwoodworks/website.git': 'yourwoodworks/website',
      'https://github.com/yourwoodworks/website': 'yourwoodworks/website',
      'git@github.com:yourwoodworks/website.git': 'yourwoodworks/website',
      'ssh://git@github.com/yourwoodworks/my.site.git': 'yourwoodworks/my.site',
      'https://gitlab.com/yourwoodworks/website.git': '',
    };
    for (const [url, expected] of Object.entries(urls)) {
      await writeText(dir, '.git/config', `[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://github.com/someone/else.git\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch "main"]\n\tremote = origin\n`);
      assert.equal(await readGitHubRepo(dir), expected, url);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
