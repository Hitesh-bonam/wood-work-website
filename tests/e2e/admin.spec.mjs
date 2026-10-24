// The phone upload page (admin/), in every browser and screen of the test list. GitHub is answered by
// a fake (tests/helpers/fake-github.mjs) that starts with the same files as the test website.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FakeGitHub, routeGitHub, TEST_KEY, READ_ONLY_KEY, SECOND_KEY, TEST_REPO } from '../helpers/fake-github.mjs';
import { writePhoto } from '../helpers/fixture.mjs';
import { expectNoSidewaysScroll, watchForProblems } from './helpers.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_SITE = path.join(projectRoot, 'tests', '.tmp', 'fixture-site');
const KEY_NAME = `woodwork-upload-key:${TEST_REPO}`;
const GPS = { IFD0: { Make: 'PhoneCam', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '17/1 24/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '78/1 28/1 0/1' } };

/** The test website's folders, as they would be on GitHub (.gitignore keeps videos and HEIC photos off it). */
async function repoFiles() {
  const files = { 'README.md': '# Woodwork website\n' };
  for (const folder of ['projects', 'site']) {
    for (const entry of await fs.readdir(path.join(FIXTURE_SITE, folder), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || /\.(heic|mp4)$/i.test(entry.name)) continue;
      const file = path.join(entry.parentPath ?? entry.path, entry.name);
      files[path.relative(FIXTURE_SITE, file).split(path.sep).join('/')] = await fs.readFile(file);
    }
  }
  return files;
}

async function fakeGitHub(page) {
  const files = await repoFiles();
  const fake = new FakeGitHub({ files });
  await routeGitHub(page, fake);
  return { fake, files };
}

/** This phone already has the key, like after connecting once. */
async function rememberKey(page) {
  await page.addInitScript(([name, key]) => window.localStorage.setItem(name, key), [KEY_NAME, TEST_KEY]);
}

/** What the page keeps on the phone (IndexedDB): how many waiting photos, and the rest of the page. */
function keptOnPhone(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const open = window.indexedDB.open('woodwork-upload', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('items');
    open.onerror = () => resolve({ photos: -1, draft: null });
    open.onsuccess = () => {
      const all = open.result.transaction('items', 'readonly').objectStore('items').getAll();
      all.onsuccess = () => {
        open.result.close();
        resolve({ photos: all.result.filter((item) => item.kind === 'photo').length, draft: all.result.find((item) => item.kind === 'draft') || null });
      };
      all.onerror = () => resolve({ photos: -1, draft: null });
    };
  }));
}

async function photoDir(testInfo) {
  const dir = testInfo.outputPath('photos');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const chapter = (page, name) => page.locator('#up-chips label.tier', { hasText: new RegExp(`^${name}$`) });
const publish = (page) => page.getByRole('button', { name: 'Publish' });
const runsAxe = (name) => name === 'laptop-chrome' || name === 'phone-android';
/** Preparing photos and saving them through the stand-in for GitHub can take a while in a busy test browser. */
const SLOW = { timeout: 30_000 };

test.describe('phone upload page', () => {
  test.describe.configure({ timeout: 120_000 });

  test('adds a new project with photos, captions and details as one commit', async ({ page }, testInfo) => {
    const problems = watchForProblems(page);
    const { fake, files: before } = await fakeGitHub(page);
    const requests = [];
    page.on('request', (req) => requests.push({ url: req.url(), auth: req.headers().authorization || '' }));
    const consoleText = [];
    page.on('console', (msg) => consoleText.push(msg.text()));
    const dir = await photoDir(testInfo);
    const sideways = await writePhoto(dir, 'IMG_2041.JPG', 'wardrobe', { width: 3000, height: 2000, exif: GPS, orientation: 6 });
    const small = await writePhoto(dir, 'kitchen.png', 'kitchen', { width: 800, height: 600 });

    await page.goto('admin/');
    await expect(page.getByRole('heading', { name: 'Connect this phone' })).toBeVisible();
    await page.getByLabel('Your GitHub key').fill(TEST_KEY);
    await page.getByRole('button', { name: 'Connect' }).click();
    const project = page.getByLabel('Project', { exact: true });
    await expect(project.locator('option'), 'the projects on GitHub').toHaveText([
      'New project (Project 11)',
      'Project 10 · Pooja room and wardrobes',
      'Project 4 · Single photo',
      'Project 2',
      'Project 1 · Kitchen & "Dining" <Room>',
      'New villa',
    ], SLOW);
    await expect(project).toHaveValue('new');
    expect(await page.evaluate((name) => window.localStorage.getItem(name), KEY_NAME)).toBe(TEST_KEY);

    await chapter(page, 'Woodwork').click();
    await page.locator('#up-gallery').setInputFiles([sideways, small]);
    const rows = page.locator('.up-photo');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('#up-photo-status')).toHaveText('2 photos ready.', SLOW);
    await expect(rows.locator('img.up-thumb:visible')).toHaveCount(2);
    await rows.nth(0).getByLabel('Caption for photo 1 (optional)').fill('Tall unit');
    await rows.nth(1).getByRole('checkbox', { name: 'Cover photo' }).check();
    await page.getByLabel('Title', { exact: true }).fill('Phone test & <kitchen>');
    await page.getByLabel('Area', { exact: true }).fill('North');
    await page.getByLabel('Days it took').fill('5');
    await page.getByLabel('Type of work').fill('Kitchens');
    await page.getByLabel('Price list').fill('Cabinets = 1,20,000\nPaint = 30k');
    await page.getByLabel('Price note').fill('GST extra');
    await publish(page).click();

    await expect(page.getByRole('heading', { name: 'Done!' })).toBeVisible(SLOW);
    await expect(page.locator('#up-done-text')).toHaveText('Project 11 is saved with 2 photos. It will be on your website in about 2 minutes.', SLOW);
    await expect(page.getByRole('link', { name: 'See Project 11 on your website' })).toHaveAttribute('href', '/woodwork-test/project/11/');

    // One commit on top of what was there, with exactly the new files.
    const history = fake.history();
    expect(history).toHaveLength(2);
    expect(history[0].parents).toEqual([fake.firstCommit]);
    expect(history[0].message).toBe('Add photos from phone: project-11 (new project, 2 photos in woodwork)');
    const files = fake.files();
    expect(Object.keys(files).filter((p) => !(p in before)).sort()).toEqual(['projects/project-11/info.txt', 'projects/project-11/woodwork/1-Tall unit.jpg', 'projects/project-11/woodwork/2.jpg']);
    for (const [p, content] of Object.entries(before)) expect(files[p].equals(Buffer.from(content)), `${p} is untouched`).toBe(true);
    expect(fake.text('projects/project-11/info.txt')).toBe('Title: Phone test & <kitchen>\nArea: North\nSize:\nDays: 5\nFinished:\nType: Kitchens\nAbout:\n\nReview:\nReview by:\nVideo:\nCover: woodwork/2.jpg\n\nPrice:\nCabinets = 1,20,000\nPaint = 30k\nNote: GST extra\n');

    // The photos were made at most 2000 px, upright, as JPEG, with no GPS or camera details left in them.
    const tall = await sharp(files['projects/project-11/woodwork/1-Tall unit.jpg']).metadata();
    expect([tall.format, tall.width, tall.height]).toEqual(['jpeg', 1333, 2000]);
    const second = await sharp(files['projects/project-11/woodwork/2.jpg']).metadata();
    expect([second.format, second.width, second.height]).toEqual(['jpeg', 800, 600]);
    for (const meta of [tall, second]) {
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }

    // The key only ever went to api.github.com, in the Authorization header.
    const withKey = requests.filter((r) => r.auth);
    expect(withKey.length).toBeGreaterThan(5);
    for (const r of withKey) {
      expect(r.url.startsWith('https://api.github.com/repos/test-owner/woodwork-test')).toBe(true);
      expect(r.auth).toBe(`Bearer ${TEST_KEY}`);
    }
    expect(requests.filter((r) => r.url.includes(TEST_KEY))).toEqual([]);
    expect(fake.log.every((r) => r.auth && !r.urlHasKey)).toBe(true);
    expect(consoleText.filter((t) => t.includes(TEST_KEY))).toEqual([]);

    // "Add more photos" carries on with the same project, and its details are read back from GitHub.
    await page.getByRole('button', { name: 'Add more photos' }).click();
    await expect(project).toHaveValue('project-11');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Phone test & <kitchen>', SLOW);
    await expect(page.locator('input[name="chapter"]:checked')).toHaveCount(0);

    // The phone remembers the key, and "Forget this phone" removes it.
    await page.reload();
    await expect(project.locator('option').first()).toHaveText('New project (Project 12)', SLOW);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Forget this phone' }).click();
    await expect(page.getByRole('heading', { name: 'Connect this phone' })).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
    expect(problems).toEqual([]);
  });

  test('adds an after photo to an existing project and changes only the edited detail', async ({ page }, testInfo) => {
    const problems = watchForProblems(page);
    await rememberKey(page);
    const { fake, files: before } = await fakeGitHub(page);
    const photo = await writePhoto(await photoDir(testInfo), 'IMG_9999.jpg', 'kitchen', { width: 1200, height: 900, exif: GPS });

    await page.goto('admin/');
    const project = page.getByLabel('Project', { exact: true });
    await project.selectOption('project-1');
    const title = page.getByLabel('Title', { exact: true });
    await expect(title).toHaveValue('Kitchen & "Dining" <Room>', SLOW);
    await expect(page.getByLabel('Price list')).toHaveValue('Cabinets = 1,20,000\nPaint = ₹ 30k\nHardware: 15000\nthis line is wrong');
    await expect(page.locator('#up-details')).not.toHaveAttribute('open');
    await page.locator('#up-details summary').click();
    await page.getByLabel('Area', { exact: true }).fill('North East');

    await chapter(page, 'After').click();
    await expect(page.locator('#up-chapter-hint')).toContainText('same caption as its before photo');
    expect(await page.locator('#up-captions option').evaluateAll((options) => options.map((o) => o.value))).toEqual(['Extra corner', 'Hall', 'Kitchen']);
    await page.locator('#up-gallery').setInputFiles(photo);
    await expect(page.locator('#up-photo-status')).toHaveText('1 photo ready.', SLOW);
    await page.getByLabel('Caption for photo 1 (optional)').fill('Extra corner');
    await publish(page).click();

    await expect(page.locator('#up-done-text')).toHaveText('1 photo saved to Project 1. It will be on your website in about 2 minutes.', SLOW);
    await expect(page.getByRole('link', { name: 'See Project 1 on your website' })).toHaveAttribute('href', '/woodwork-test/project/1/');
    expect(fake.history()[0].message).toBe('Add photos from phone: project-1 (1 photo in after, details updated)');
    const files = fake.files();
    // Same name as the before photo, so the website shows the two as a slider.
    expect(Object.keys(files).filter((p) => !(p in before))).toEqual(['projects/project-1/after/extra-corner.jpg']);
    const original = before['projects/project-1/info.txt'].toString('utf8');
    expect(fake.text('projects/project-1/info.txt')).toBe(original.replace('Area: North\n', 'Area: North East\n'));
    expect((await sharp(files['projects/project-1/after/extra-corner.jpg']).metadata()).exif).toBeUndefined();
    expect(problems).toEqual([]);
  });

  test('a wrong key, no internet and unusable photos each get a clear message', async ({ page, browserName }, testInfo) => {
    const { fake } = await fakeGitHub(page);
    await page.goto('admin/');
    const key = page.getByLabel('Your GitHub key');
    const connect = page.getByRole('button', { name: 'Connect' });
    const keyError = page.locator('#up-key-err');
    await key.fill('my password');
    await connect.click();
    await expect(keyError).toContainText('doesn’t look like a GitHub key');
    await key.fill(`${TEST_KEY}x`);
    await connect.click();
    await expect(keyError).toContainText('GitHub says this key is wrong or has expired', SLOW);
    await key.fill(READ_ONLY_KEY);
    await connect.click();
    await expect(keyError).toContainText('isn\'t allowed to save to test-owner/woodwork-test', SLOW);
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
    await key.fill(` ${TEST_KEY}\n`);
    await connect.click();
    await expect(page.getByLabel('Project', { exact: true })).toBeVisible(SLOW);

    const dir = await photoDir(testInfo);
    const broken = path.join(dir, 'broken.jpg');
    await fs.writeFile(broken, 'this is not a jpeg');
    const clip = path.join(dir, 'clip.mp4');
    await fs.writeFile(clip, 'not really a video');
    const good = await writePhoto(dir, 'good.jpg', 'door', { width: 900, height: 600 });
    await page.locator('#up-gallery').setInputFiles([broken, clip, good]);
    const photoError = page.locator('#up-photo-err');
    await expect(photoError).toContainText('clip.mp4: Videos are too big for the website.');
    await expect(photoError).toContainText('broken.jpg: This photo couldn’t be opened.');
    await expect(page.locator('.up-photo')).toHaveCount(1);
    if (browserName === 'chromium') {
      const huge = path.join(dir, 'huge.jpg');
      await fs.writeFile(huge, Buffer.alloc(41 * 1024 * 1024));
      await page.locator('#up-gallery').setInputFiles(huge);
      await expect(photoError).toContainText('huge.jpg: This photo is too big (41 MB');
      await expect(page.locator('.up-photo')).toHaveCount(1);
    }

    await publish(page).click();
    await expect(page.locator('#up-send-err')).toHaveText('Choose what the photos are of (step 2).');
    await chapter(page, 'Repairs').click();

    // No signal: every request to GitHub fails, as on a phone with no internet. (context.setOffline is
    // not used: toggling it while requests are routed can leave the browser unable to close.)
    fake.offline = true;
    await publish(page).click();
    await expect(page.locator('#up-send-err')).toContainText(/internet connection[\s\S]*Your photos are still here/, SLOW);
    await expect(page.locator('.up-photo')).toHaveCount(1);
    expect(fake.history()).toHaveLength(1);
    fake.offline = false;
    await publish(page).click();
    await expect(page.locator('#up-done-text')).toHaveText('Project 11 is saved with 1 photo. It will be on your website in about 2 minutes.', SLOW);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith('projects/project-11/')).sort()).toEqual(['projects/project-11/info.txt', 'projects/project-11/repairs/1.jpg']);
  });

  test('when the computer saves at the same moment, the phone\'s photos become the next project', async ({ page }, testInfo) => {
    await rememberKey(page);
    const { fake } = await fakeGitHub(page);
    fake.beforeMove = (gh) => gh.pushFromElsewhere({ 'projects/project-11/info.txt': 'Title: Made on the computer\n', 'projects/project-11/woodwork/1.jpg': 'x' });
    await page.goto('admin/');
    await expect(page.getByLabel('Project', { exact: true }).locator('option').first()).toHaveText('New project (Project 11)', SLOW);
    await chapter(page, 'Painting').click();
    await page.locator('#up-gallery').setInputFiles(await writePhoto(await photoDir(testInfo), 'wall.jpg', 'paint'));
    await expect(page.locator('#up-photo-status')).toHaveText('1 photo ready.', SLOW);
    await publish(page).click();
    await expect(page.locator('#up-done-text')).toHaveText('Project 12 is saved with 1 photo. It will be on your website in about 2 minutes.', SLOW);
    expect(fake.history().map((c) => c.message)).toEqual(['Add photos from phone: project-12 (new project, 1 photo in painting)', 'Update projects and photos', 'First version']);
    expect(fake.text('projects/project-11/info.txt')).toBe('Title: Made on the computer\n');
  });

  test('fits the screen, has big buttons and is accessible', async ({ page, isMobile }, testInfo) => {
    const { fake } = await fakeGitHub(page);
    const expectBigTargets = async () => {
      const small = await page.locator('#main').evaluate((main) => [...main.querySelectorAll('button, a.btn, label.btn, .tier span, .up-cover, summary, input[type="text"], input[type="password"], input[type="url"], select, textarea')]
        .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => ({ what: el.outerHTML.slice(0, 80), height: el.getBoundingClientRect().height }))
        .filter((t) => t.height < 44));
      expect(small).toEqual([]);
    };
    const axe = async () => {
      if (!runsAxe(testInfo.project.name)) return;
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    };

    await page.goto('admin/');
    await expect(page.getByRole('heading', { name: 'Connect this phone' })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectBigTargets();
    await axe();

    await page.getByLabel('Your GitHub key').fill(TEST_KEY);
    await page.getByRole('button', { name: 'Connect' }).click();
    await page.getByLabel('Project', { exact: true }).selectOption('project-1');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Kitchen & "Dining" <Room>', SLOW);
    await page.locator('#up-details summary').click();
    await chapter(page, 'New chapter…').click();
    await expect(page.getByLabel('Name of the new chapter')).toBeFocused();
    await page.getByLabel('Name of the new chapter').fill('Balcony');
    await page.locator('#up-gallery').setInputFiles(await writePhoto(await photoDir(testInfo), 'IMG_1.jpg', 'tvunit', { width: 640, height: 960 }));
    await expect(page.locator('#up-photo-status')).toHaveText('1 photo ready.', SLOW);
    await page.getByLabel('Caption for photo 1 (optional)').fill('Averyveryveryverylongcaptionwithoutanyspacesthatcouldpushthepagesideways');
    await expectNoSidewaysScroll(page);
    await expectBigTargets();
    await axe();
    if (!isMobile) {
      for (const width of [320, 375, 768, 1024, 1440, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoSidewaysScroll(page);
      }
    }

    await publish(page).click();
    await expect(page.locator('#up-done')).toBeFocused(SLOW);
    expect(Object.keys(fake.files()).filter((p) => p.includes('/Balcony/'))).toEqual(['projects/project-1/Balcony/1-Averyveryveryverylongcaptionwithoutanyspacesthatcouldpushthe.jpg']);
    await expectNoSidewaysScroll(page);
    await expectBigTargets();
    await axe();
  });

  test('photos, captions and details wait on the phone if the page is closed, and Clear removes them', async ({ page }, testInfo) => {
    await rememberKey(page);
    const { fake } = await fakeGitHub(page);
    const dir = await photoDir(testInfo);
    const wall = await writePhoto(dir, 'IMG_1.jpg', 'paint', { width: 1200, height: 900 });
    const door = await writePhoto(dir, 'IMG_2.jpg', 'door', { width: 900, height: 1200 });
    await page.goto('admin/');
    await expect(page.getByLabel('Project', { exact: true })).toHaveValue('new', SLOW);
    await chapter(page, 'Painting').click();
    await page.locator('#up-gallery').setInputFiles([wall, door]);
    await expect(page.locator('#up-photo-status')).toHaveText('2 photos ready.', SLOW);
    await page.getByLabel('Caption for photo 1 (optional)').fill('Accent wall');
    await page.locator('.up-photo').nth(1).getByRole('checkbox', { name: 'Cover photo' }).check();
    await page.getByLabel('Title', { exact: true }).fill('Kept on the phone');
    await expect.poll(async () => (await keptOnPhone(page)).photos, SLOW).toBe(2);
    await expect.poll(async () => (await keptOnPhone(page)).draft?.edits?.title, SLOW).toBe('Kept on the phone');

    // The phone closes the page (low memory while the camera is open) and it is opened again.
    await page.reload();
    await expect(page.locator('.up-photo')).toHaveCount(2, SLOW);
    await expect(page.locator('#up-restored')).toContainText('Your photos from last time are back');
    await expect(page.locator('img.up-thumb:visible')).toHaveCount(2);
    await expect(page.getByLabel('Caption for photo 1 (optional)')).toHaveValue('Accent wall');
    await expect(page.locator('.up-photo').nth(1).getByRole('checkbox', { name: 'Cover photo' })).toBeChecked();
    await expect(page.locator('#up-chips input[value="painting"]')).toBeChecked();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Kept on the phone');
    await publish(page).click();
    await expect(page.locator('#up-done-text')).toHaveText('Project 11 is saved with 2 photos. It will be on your website in about 2 minutes.', SLOW);
    expect(fake.text('projects/project-11/info.txt')).toContain('Title: Kept on the phone\n');
    expect(fake.text('projects/project-11/info.txt')).toContain('Cover: painting/2.jpg\n');
    expect(Object.keys(fake.files()).filter((p) => p.startsWith('projects/project-11/painting/')).sort()).toEqual(['projects/project-11/painting/1-Accent wall.jpg', 'projects/project-11/painting/2.jpg']);

    // Published photos aren't kept any more.
    await expect.poll(async () => (await keptOnPhone(page)).photos, SLOW).toBe(0);
    await page.reload();
    await expect(page.getByLabel('Project', { exact: true }).locator('option').first()).toHaveText('New project (Project 12)', SLOW);
    await expect(page.locator('.up-photo')).toHaveCount(0);

    // "Clear all photos" removes waiting photos from the phone too.
    await chapter(page, 'Woodwork').click();
    await page.locator('#up-gallery').setInputFiles(wall);
    await expect(page.locator('#up-photo-status')).toHaveText('1 photo ready.', SLOW);
    await expect.poll(async () => (await keptOnPhone(page)).photos, SLOW).toBe(1);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Clear all photos' }).click();
    await expect(page.locator('.up-photo')).toHaveCount(0);
    await expect.poll(async () => (await keptOnPhone(page)).photos, SLOW).toBe(0);
    await page.reload();
    await expect(page.getByLabel('Project', { exact: true })).toBeVisible(SLOW);
    await expect(page.locator('.up-photo')).toHaveCount(0);
  });

  test('a key GitHub refuses stays on the phone until a new key works', async ({ page }) => {
    const fake = new FakeGitHub({ files: await repoFiles(), keys: [TEST_KEY, SECOND_KEY] });
    await routeGitHub(page, fake);
    await page.goto('admin/');
    await page.evaluate(([name, key]) => window.localStorage.setItem(name, key), [KEY_NAME, TEST_KEY]);
    const savedKey = () => page.evaluate((name) => window.localStorage.getItem(name), KEY_NAME);

    // A moment's trouble on GitHub (or the key was deleted there): the key is not thrown away.
    fake.keys.delete(TEST_KEY);
    await page.reload();
    const again = page.locator('#up-key-again');
    await expect(again).toBeVisible(SLOW);
    await expect(again).toContainText('GitHub didn’t accept the key saved on this phone');
    expect(await savedKey()).toBe(TEST_KEY);
    fake.keys.add(TEST_KEY);
    await again.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByLabel('Project', { exact: true })).toBeVisible(SLOW);

    // This time the key really is gone: a new key replaces it, but only once the new key works.
    fake.keys.delete(TEST_KEY);
    await page.reload();
    await expect(again).toBeVisible(SLOW);
    await again.getByRole('button', { name: 'Paste a new key' }).click();
    const input = page.getByLabel('Your GitHub key');
    await expect(input).toBeFocused();
    await input.fill(`${SECOND_KEY}x`);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('#up-key-err')).toContainText('wrong or has expired', SLOW);
    expect(await savedKey()).toBe(TEST_KEY);
    await input.fill(SECOND_KEY);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByLabel('Project', { exact: true })).toBeVisible(SLOW);
    expect(await savedKey()).toBe(SECOND_KEY);
  });

  test('a project that disappears from GitHub is taken off the list, and the photos stay', async ({ page }, testInfo) => {
    await rememberKey(page);
    const { fake } = await fakeGitHub(page);
    await page.goto('admin/');
    const project = page.getByLabel('Project', { exact: true });
    await project.selectOption('project-4');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Single photo', SLOW);
    await chapter(page, 'Woodwork').click();
    await page.locator('#up-gallery').setInputFiles(await writePhoto(await photoDir(testInfo), 'shelf.jpg', 'wardrobe'));
    await expect(page.locator('#up-photo-status')).toHaveText('1 photo ready.', SLOW);

    // Meanwhile, on the computer, project-4 was renamed to project-14.
    const files = fake.files();
    const renamed = {};
    for (const p of Object.keys(files).filter((name) => name.startsWith('projects/project-4/'))) {
      renamed[p] = null;
      renamed[p.replace('projects/project-4/', 'projects/project-14/')] = files[p];
    }
    fake.pushFromElsewhere(renamed);
    await publish(page).click();
    await expect(page.locator('#up-send-err')).toContainText('choose the project again, then tap Publish. Your photos are still here.', SLOW);
    await expect(project).toHaveValue('');
    const choices = await project.locator('option').evaluateAll((options) => options.map((o) => o.value));
    expect(choices).not.toContain('project-4');
    expect(choices).toContain('project-14');
    await expect(page.locator('.up-photo')).toHaveCount(1);

    await project.selectOption('project-14');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Single photo', SLOW);
    await publish(page).click();
    await expect(page.locator('#up-done-text')).toHaveText('1 photo saved to Project 14. It will be on your website in about 2 minutes.', SLOW);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith('projects/project-14/woodwork/')).sort()).toEqual(['projects/project-14/woodwork/1.jpg', 'projects/project-14/woodwork/broken.jpg', 'projects/project-14/woodwork/good.jpg']);
  });

  test('when the signal goes just as GitHub saves, the reopened page finds that save instead of saving twice', async ({ page }, testInfo) => {
    await rememberKey(page);
    const { fake } = await fakeGitHub(page);
    await page.goto('admin/');
    await expect(page.getByLabel('Project', { exact: true })).toHaveValue('new', SLOW);
    await chapter(page, 'Repairs').click();
    await page.locator('#up-gallery').setInputFiles(await writePhoto(await photoDir(testInfo), 'IMG_7.jpg', 'damaged'));
    await expect(page.locator('#up-photo-status')).toHaveText('1 photo ready.', SLOW);
    fake.loseAnswerTo = 'PATCH';
    await publish(page).click();
    await expect(page.locator('#up-send-err')).toContainText('internet connection', { timeout: 60_000 });
    expect(fake.history()).toHaveLength(2);

    // The signal is back, and the phone had closed the page in the meantime.
    fake.offline = false;
    await page.reload();
    await expect(page.locator('.up-photo')).toHaveCount(1, SLOW);
    await publish(page).click();
    await expect(page.locator('#up-done-text')).toHaveText('Your last publish arrived after all. Project 11 is saved with 1 photo. It will be on your website in about 2 minutes.', SLOW);
    expect(fake.history()).toHaveLength(2);
    expect(Object.keys(fake.files()).filter((p) => p.startsWith('projects/project-12/'))).toEqual([]);
    await expect(page.locator('.up-photo')).toHaveCount(0);
  });

  test('is not linked from the website and asks search engines not to list it', async ({ page }) => {
    for (const path of ['./', 'project/1/', 'contact/']) {
      await page.goto(path);
      expect(await page.locator('a[href*="admin"]').count()).toBe(0);
    }
    await page.goto('admin/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page).toHaveTitle('Add photos | Test Woodworks & Sons');
  });
});
