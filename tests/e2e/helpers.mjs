// Shared checks for the browser tests.
import { expect } from '@playwright/test';

export const PAGES = ['', 'project/1/', 'project/10/', 'project/2/', 'pricing/', 'materials/', 'contact/'];

/** Records console errors, script errors and failed requests to our own site. */
export function watchForProblems(page, { expect404 = false } = {}) {
  const problems = [];
  page.on('console', (msg) => {
    // Messages from other websites shown inside the page (like a YouTube video) are theirs, not ours.
    const from = (msg.location() && msg.location().url) || '';
    if (from && !from.startsWith('http://127.0.0.1')) return;
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

/** Waits until the page has not moved for 1.2 seconds (longer than any pause inside a smooth scroll). */
export async function waitForScrollToStop(page) {
  await page.waitForFunction(() => new Promise((resolve) => {
    let last = window.scrollY;
    let still = 0;
    const timer = setInterval(() => {
      if (window.scrollY === last) still += 100;
      else {
        still = 0;
        last = window.scrollY;
      }
      if (still >= 1200) {
        clearInterval(timer);
        resolve(true);
      }
    }, 100);
  }), null, { timeout: 15_000 });
}

/**
 * Menu items, labels and the business name, with how many lines of text each shows on screen (lines a
 * long business name hides behind its "…" don't count), and how wide the business name's room is.
 */
export function textLines(page) {
  return page.evaluate(() => {
    const lines = (el) => {
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0 && r.bottom <= box.bottom + 1).map((r) => r.top).sort((a, b) => a - b);
      let count = 0;
      let last = -Infinity;
      for (const top of tops) {
        if (top - last > 6) count++;
        last = top;
      }
      return count;
    };
    const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    return {
      menus: [...document.querySelectorAll('.nav-desk a, .tabbar a span, .chip, .chap-in a, .pj-all, .top-wa .lbl')].filter(visible).map((el) => ({ text: el.textContent.trim(), lines: lines(el) })),
      brand: [...document.querySelectorAll('.brand span')].filter(visible).map((el) => lines(el))[0] || 1,
      brandWidth: Math.round(document.querySelector('.brand span').getBoundingClientRect().width),
    };
  });
}
