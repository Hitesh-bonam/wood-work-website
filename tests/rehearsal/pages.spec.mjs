// Every page of the rehearsal website, on every screen in playwright.rehearsal.config.mjs.
import { test, expect } from '@playwright/test';
import { watchForProblems, expectAllImagesLoaded, expectNoSidewaysScroll, textLines } from '../e2e/helpers.mjs';

const ORIGIN = 'http://127.0.0.1:4500';

async function allPages(request) {
  const xml = await (await request.get('sitemap.xml')).text();
  const pages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return [...pages, `${ORIGIN}/website/admin/`, `${ORIGIN}/website/does-not-exist/`];
}

test('every page loads fully, fits the screen and shows the right menu', async ({ page, request }) => {
  const pages = await allPages(request);
  expect(pages.length).toBeGreaterThanOrEqual(40);
  const problems = watchForProblems(page, { expect404: true });
  const { width, height } = page.viewportSize();
  // Phones held sideways show the menu in the header instead of the bottom bar.
  const bottomMenu = width < 768 && !(width > height && height <= 500);
  for (const url of pages) {
    await test.step(url.replace(ORIGIN, ''), async () => {
      const response = await page.goto(url);
      expect(response.status(), url).toBe(url.includes('does-not-exist') ? 404 : 200);
      await expect(page.locator('h1').first()).toBeVisible();
      if (url.includes('/project/')) await expect(page.locator('main h1'), `${url}: the project title is on the first screen`).toBeInViewport({ ratio: 1 });
      await expectNoSidewaysScroll(page);
      await expectAllImagesLoaded(page);
      if (!url.includes('/admin/')) {
        const tabbar = page.locator('nav.tabbar');
        if (bottomMenu) await expect(tabbar).toBeVisible();
        else await expect(tabbar).toBeHidden();
        const text = await textLines(page);
        expect(text.menus.filter((m) => m.lines !== 1), `${url}: menu items on one line`).toEqual([]);
        expect(text.brand, `${url}: business name uses at most two lines`).toBeLessThanOrEqual(2);
        expect(text.brandWidth, `${url}: the business name has room to be read`).toBeGreaterThanOrEqual(100);
        const header = await page.locator('header.top').boundingBox();
        const title = await page.locator('main h1').boundingBox();
        expect(title.y, `${url}: title below the header`).toBeGreaterThanOrEqual(header.y + header.height - 1);
      }
    });
  }
  expect(problems).toEqual([]);
});
