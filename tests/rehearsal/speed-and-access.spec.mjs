// Slow mobile internet, accessibility, and screenshots of every kind of page for a by-eye review.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.tmp', 'rehearsal', 'shots');

test('on slow mobile internet the gallery appears quickly and downloads little', async ({ page, browserName, isMobile }, testInfo) => {
  test.skip(browserName !== 'chromium' || !isMobile || testInfo.project.name.includes('landscape') || testInfo.project.name.includes('tab'), 'Chrome phones only');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // Roughly a weak 3G/4G signal: 1.6 Mbit/s down, 750 kbit/s up, 150 ms delay.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 94_000 });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
  });
  const started = Date.now();
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toBeVisible();
  const textMs = Date.now() - started;
  await page.waitForLoadState('load');
  const loadMs = Date.now() - started;
  const firstLoadKB = Math.round(bytes / 1024);
  console.log(`${testInfo.project.name}: text after ${textMs} ms, page loaded after ${loadMs} ms, ${firstLoadKB} KB downloaded`);
  expect(textMs).toBeLessThan(4000);
  expect(firstLoadKB).toBeLessThan(2500);
  await page.locator('.pj a.tile').first().click();
  const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
  await expect(viewer.locator('.v-img')).toHaveJSProperty('complete', true, { timeout: 20_000 });
  expect(await viewer.locator('.v-img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
});

test('accessibility checks pass on every kind of page', async ({ page }, testInfo) => {
  test.skip(!['pixel-7', 'laptop-1280-chrome'].includes(testInfo.project.name), 'two screens are enough for this check');
  for (const url of ['./', 'project/1/', 'project/2/', 'project/7/', 'pricing/', 'materials/', 'contact/', 'admin/', 'does-not-exist/']) {
    await page.goto(url);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${url} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});

test('screenshots of every kind of page for review', async ({ page }, testInfo) => {
  const wanted = ['iphone-se', 'iphone-14-landscape', 'galaxy-s9', 'ipad-mini', 'laptop-1366-firefox', 'desktop-1920-chrome'];
  test.skip(!wanted.includes(testInfo.project.name), 'six screens are enough for the review');
  const name = testInfo.project.name;
  await fs.mkdir(shots, { recursive: true });
  const snap = async (label) => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shots, `${name}--${label}.png`) });
  };
  const loadAll = () => page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.loading = 'eager';
    });
    await Promise.all([...document.images].filter((i) => i.getAttribute('src') && !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await page.goto('./');
  await loadAll();
  await snap('1-gallery-top');
  await page.locator('#project-1').scrollIntoViewIfNeeded();
  await snap('2-gallery-project');
  await page.goto('project/1/');
  await loadAll();
  await snap('3-project-top');
  await page.locator('#ch-before-after').scrollIntoViewIfNeeded();
  await snap('4-project-before-after');
  await page.locator('#ch-woodwork a[data-lb]').first().click();
  await page.getByRole('dialog', { name: 'Photo viewer' }).locator('.v-img').evaluate((img) => img.complete || new Promise((r) => { img.onload = r; }));
  await snap('5-photo-viewer');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Watch as story' }).click();
  await page.getByRole('dialog', { name: 'Project story' }).getByRole('button', { name: 'Pause' }).click();
  await snap('6-story');
  await page.keyboard.press('Escape');
  await page.locator('#ch-price').scrollIntoViewIfNeeded();
  await snap('7-project-price');
  await page.goto('pricing/');
  await page.locator('#est-qty').fill('60');
  await snap('8-pricing');
  await page.goto('materials/');
  await loadAll();
  await snap('9-materials');
  await page.goto('contact/');
  await loadAll();
  await snap('10-contact');
  await page.goto('admin/');
  await snap('11-upload-page');
  await page.goto('does-not-exist/');
  await snap('12-not-found');
});
