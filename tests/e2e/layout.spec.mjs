import { test, expect } from '@playwright/test';
import { PAGES, expectNoSidewaysScroll, textLines } from './helpers.mjs';

const WIDTHS = [320, 360, 375, 390, 412, 480, 600, 768, 820, 1024, 1280, 1440, 1920, 2560];

test.describe('phones held sideways', () => {
  test.skip(({ isMobile }) => isMobile, 'runs in the laptop browsers with phone-sized windows');
  for (const size of [{ width: 750, height: 340 }, { width: 863, height: 360 }, { width: 915, height: 412 }]) {
    test(`the page gets most of a ${size.width}x${size.height} screen`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('project/1/');
      await expect(page.locator('main h1'), 'the project title is on the first screen, beside its photo').toBeInViewport({ ratio: 1 });
      await expect(page.locator('nav.tabbar')).toBeHidden();
      const menu = page.getByRole('navigation', { name: 'Main', exact: true });
      await expect(menu).toBeVisible();
      // Down to the first chapter, so the chapter menu is stuck however tall the cover photo is.
      await page.evaluate(() => window.scrollTo({ top: document.querySelector('section.chap').getBoundingClientRect().top + window.scrollY, behavior: 'instant' }));
      await expect(page.locator('header.top')).not.toBeInViewport();
      const stuck = await page.locator('.chap-nav').boundingBox();
      expect(stuck.y, 'the chapter menu sticks to the very top').toBeLessThan(2);
      expect(stuck.height / size.height, 'menus cover less than a quarter of the screen').toBeLessThan(0.25);
      await page.getByRole('navigation', { name: 'Chapters' }).getByRole('link', { name: 'Painting' }).click();
      await expect(page.locator('#ch-painting h2')).toBeInViewport();
      const title = await page.locator('#ch-painting h2').boundingBox();
      expect(title.y, 'the chapter title is not hidden under the chapter menu').toBeGreaterThanOrEqual(stuck.height - 1);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await menu.getByRole('link', { name: 'Pricing' }).click();
      await expect(page).toHaveURL(/pricing\/$/);
    });
  }
});

test.describe('every screen size', () => {
  test.skip(({ isMobile }) => isMobile, 'the size sweep runs in the laptop browsers');

  for (const width of WIDTHS) {
    test(`nothing spills sideways or hides behind the menu at ${width}px wide`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: 900 });
      for (const path of [...PAGES, 'does-not-exist/']) {
        await page.goto(path);
        await expectNoSidewaysScroll(page);
        if (path.startsWith('project/')) await expect(page.locator('main h1'), `${path}: the project title is on the first screen`).toBeInViewport({ ratio: 1 });
        const tabbar = page.locator('nav.tabbar');
        if (width < 768) await expect(tabbar).toBeVisible();
        else await expect(tabbar).toBeHidden();
        const heading = await page.locator('main h1').boundingBox();
        const header = await page.locator('header.top').boundingBox();
        expect(heading.y, `${path}: the title is not under the header`).toBeGreaterThanOrEqual(header.y + header.height - 1);
        // Menu words must never be chopped into pieces (one line each); the business name takes at most two.
        const text = await textLines(page);
        expect(text.menus.filter((m) => m.lines !== 1), `${path}: menu items on one line`).toEqual([]);
        expect(text.brand, `${path}: business name uses at most two lines`).toBeLessThanOrEqual(2);
        expect(text.brandWidth, `${path}: the business name has room to be read`).toBeGreaterThanOrEqual(100);
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        if (width < 768) {
          const last = await page.locator('.foot-small').evaluate((el) => el.getBoundingClientRect().bottom);
          const menuTop = await tabbar.evaluate((el) => el.getBoundingClientRect().top);
          expect(last, `${path}: the footer is not hidden behind the bottom menu`).toBeLessThanOrEqual(menuTop + 1);
        }
      }
    });
  }
});
