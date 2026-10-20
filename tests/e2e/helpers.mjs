// Shared checks for the browser tests.
import { expect } from '@playwright/test';

export const PAGES = ['', 'project/1/', 'project/10/', 'project/2/', 'pricing/', 'materials/', 'contact/'];

/** Records console errors, script errors and failed requests to our own site. */
export function watchForProblems(page, { expect404 = false } = {}) {
  const problems = [];
  page.on('console', (msg) => {
    const expected = expect404 && /\b404\b/.test(msg.text());
    if (msg.type() === 'error' && !expected) problems.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`script error: ${err.message}`));
  page.on('response', (res) => {
    const url = res.url();
    if (url.startsWith('http://127.0.0.1') && res.status() >= 400 && !url.includes('/does-not-exist')) problems.push(`HTTP ${res.status()} ${url}`);
  });
  page.on('requestfailed', (req) => {
    const error = req.failure()?.errorText || '';
    if (req.url().startsWith('http://127.0.0.1') && !/abort|cancel/i.test(error)) problems.push(`failed request ${req.url()} (${error})`);
  });
  return problems;
}

/** Loads every lazy photo on the page and checks that each one really shows a picture. */
export async function expectAllImagesLoaded(page) {
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.loading = 'eager';
    });
  });
  // Images inside the closed photo viewer have no picture yet; only check photos on the page.
  await page.waitForFunction(() => [...document.images].filter((img) => img.getAttribute('src')).every((img) => img.complete), null, { timeout: 15_000 });
  const broken = await page.evaluate(() => [...document.images].filter((img) => img.getAttribute('src') && !img.naturalWidth).map((img) => img.currentSrc || img.src));
  expect(broken).toEqual([]);
}

/** Fails if anything makes the page wider than the screen (sideways scrolling on phones). */
export async function expectNoSidewaysScroll(page) {
  const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(sizes.page, `page is ${sizes.page}px wide on a ${sizes.screen}px screen`).toBeLessThanOrEqual(sizes.screen);
}

export const isPhoneSize = (page) => page.viewportSize().width < 768;
