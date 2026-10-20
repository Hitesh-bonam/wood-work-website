import { test, expect } from '@playwright/test';
import { PAGES, expectNoSidewaysScroll } from './helpers.mjs';

const WIDTHS = [320, 360, 375, 390, 412, 480, 600, 768, 820, 1024, 1280, 1440, 1920, 2560];

test.describe('every screen size', () => {
  test.skip(({ isMobile }) => isMobile, 'the size sweep runs in the laptop browsers');

  for (const width of WIDTHS) {
    test(`nothing spills sideways or hides behind the menu at ${width}px wide`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: 900 });
      for (const path of [...PAGES, 'does-not-exist/']) {
        await page.goto(path);
        await expectNoSidewaysScroll(page);
        const tabbar = page.locator('nav.tabbar');
        if (width < 768) await expect(tabbar).toBeVisible();
        else await expect(tabbar).toBeHidden();
        const heading = await page.locator('main h1').boundingBox();
        const header = await page.locator('header.top').boundingBox();
        expect(heading.y, `${path}: the title is not under the header`).toBeGreaterThanOrEqual(header.y + header.height - 1);
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
