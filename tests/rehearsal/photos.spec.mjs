// Checks that run once (they don't depend on the screen): photos upright, no hidden data in anything
// served, GitHub's warning about untidied originals, and the build report.
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const work = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.tmp', 'rehearsal');

test('full-size sideways phone photos show the right way up', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop-1280-chrome', 'runs once');
  const xml = await (await request.get('sitemap.xml')).text();
  const projects = [...xml.matchAll(/<loc>([^<]+\/project\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  let checked = 0;
  for (const url of projects) {
    await page.goto(url);
    const tiles = page.locator('a[data-lb][aria-label*="pright"]');
    for (const tile of await tiles.all()) {
      const label = await tile.getAttribute('aria-label');
      await tile.scrollIntoViewIfNeeded();
      const img = tile.locator('img');
      await expect(img).toHaveJSProperty('complete', true);
      const { w, h } = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
      if (/portrait/i.test(label)) expect(h, label).toBeGreaterThan(w);
      else expect(w, label).toBeGreaterThan(h);
      checked++;
    }
  }
  expect(checked).toBe(12);
});

test('nothing served contains GPS location or camera details', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop-1280-chrome', 'runs once');
  const dir = path.join(work, 'repo', 'dist', 'assets', 'photos');
  const files = (await fs.readdir(dir)).filter((f) => /\.(webp|jpe?g|png)$/i.test(f));
  expect(files.length).toBeGreaterThan(500);
  const withData = [];
  for (const file of files) {
    const meta = await sharp(path.join(dir, file)).metadata();
    if (meta.exif || meta.xmp || meta.iptc) withData.push(file);
  }
  expect(withData).toEqual([]);
});

test('the build report: timings, size and the warnings the owner would see', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop-1280-chrome', 'runs once');
  const report = JSON.parse(await fs.readFile(path.join(work, 'report.json'), 'utf8'));
  console.log(JSON.stringify({ commit: report.commit, content: report.content, site: report.site, seconds: Object.fromEntries(Object.entries(report.steps).map(([k, v]) => [k, +(v.ms / 1000).toFixed(1)])) }, null, 2));
  expect(report.ok).toBe(true);
  expect(report.content.bigPhotos).toBe(12);
  expect(report.warnings.some((w) => w.includes('IMG_4567.HEIC') && w.includes('HEIC'))).toBe(true);
  expect(report.warnings.some((w) => w.includes('VID_20261012.mp4') && w.includes('YouTube'))).toBe(true);
  expect(report.warnings.some((w) => w.startsWith('::warning') && w.includes('GPS'))).toBe(true);
  expect(report.steps.build.ms).toBeLessThan(10 * 60 * 1000);
});
