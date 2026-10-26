// Everything a visitor or the owner can do, on every screen in playwright.rehearsal.config.mjs.
import { test, expect } from '@playwright/test';
import { watchForProblems, waitForScrollToStop } from '../e2e/helpers.mjs';

async function expectInsideScreen(page, locator, what) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  expect(box, `${what} is shown`).not.toBeNull();
  expect(box.width, `${what} has a size`).toBeGreaterThan(40);
  expect(box.x, `${what} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${what} top edge`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${what} right edge`).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height, `${what} bottom edge`).toBeLessThanOrEqual(height + 1);
}

test('gallery: filters, photo viewer, swipe and the Back button', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('./');
  const all = await page.locator('.pj').count();
  expect(all).toBeGreaterThanOrEqual(36);
  const filters = page.getByRole('group', { name: 'Show projects by type' });
  await filters.getByRole('button', { name: 'Kitchens' }).click();
  const kitchens = await page.locator('.pj:visible').count();
  expect(kitchens).toBeGreaterThan(0);
  expect(kitchens).toBeLessThan(all);
  await filters.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.pj:visible')).toHaveCount(all);

  // The first photo in the gallery is the project's first after photo; the viewer opens on it, in the
  // middle of the project's photos (its before photos come first).
  const tile = page.locator('.pj a.tile').first();
  await tile.click();
  const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
  const counter = viewer.locator('.v-title');
  await expect(counter).toHaveText(/ \d+ \/ \d+$/);
  const start = Number((await counter.textContent()).match(/ (\d+) \/ \d+$/)[1]);
  await expect(viewer.locator('.v-cap .v-ch')).toHaveText('After');
  const photo = viewer.locator('.v-img');
  await expect(photo).toHaveJSProperty('complete', true);
  await expectInsideScreen(page, photo, 'the photo');
  await expectInsideScreen(page, viewer.getByRole('button', { name: 'Close' }), 'the close button');
  await viewer.getByRole('button', { name: 'Next photo' }).click();
  await expect(counter).toHaveText(new RegExp(` ${start + 1} / \\d+$`));
  const stage = await viewer.locator('.v-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * 0.25, stage.y + stage.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.75, stage.y + stage.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(counter).toHaveText(new RegExp(` ${start} / \\d+$`));
  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(page).toHaveURL(/\/website\/$/);
  expect(problems).toEqual([]);
});

test('project page: chapters, before/after slider, story mode, price and next project', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('project/1/');
  await expect(page.locator('main h1')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Chapters' });
  const links = nav.getByRole('link');
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(5);
  await links.nth(2).click();
  await expect(links.nth(2)).toHaveAttribute('aria-current', 'true');

  const slider = page.getByRole('slider', { name: 'Slide to compare before and after' }).first();
  await slider.fill('25');
  await expect(page.locator('[data-ba]').first()).toHaveAttribute('style', /--pos:\s*25%/);

  await page.locator('#ch-after a[data-lb]').first().click();
  const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
  await expect(viewer.locator('.v-img')).toHaveJSProperty('complete', true);
  await expectInsideScreen(page, viewer.locator('.v-img'), 'the photo');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  await page.getByRole('button', { name: 'Watch as story' }).click();
  const story = page.getByRole('dialog', { name: 'Project story' });
  await story.getByRole('button', { name: 'Pause' }).click();
  await story.getByRole('button', { name: 'Next photo' }).click();
  await expect(story.locator('.v-img')).toHaveJSProperty('complete', true);
  await expectInsideScreen(page, story.locator('.v-img'), 'the story photo');
  await expectInsideScreen(page, story.getByRole('button', { name: 'Close story' }), 'the close button');
  const bars = await story.locator('.s-bar').count();
  for (let i = 0; i < bars; i++) await page.keyboard.press('ArrowRight');
  await expect(story.locator('.s-end')).toBeVisible();
  await expectInsideScreen(page, story.getByRole('link', { name: 'See the price' }), 'the price button');
  await story.getByRole('link', { name: 'See the price' }).click();
  await expect(story).toBeHidden();
  await expect(page.locator('#ch-price h2')).toBeInViewport();
  await expect(page.locator('#ch-price tfoot')).toContainText('₹');

  const next = page.locator('a.next-card');
  await next.scrollIntoViewIfNeeded();
  const before = page.url();
  await next.click();
  await expect(page).not.toHaveURL(before);
  await expect(page.locator('main h1')).toBeVisible();
  expect(problems).toEqual([]);
});

test('project page: the chapter you tap stays highlighted, and the menu then follows the page', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('project/1/');
  const nav = page.getByRole('navigation', { name: 'Chapters' });
  const links = nav.getByRole('link');
  const names = (await links.allTextContents()).map((t) => t.trim());
  expect(names.length).toBeGreaterThanOrEqual(5);
  // The last chapters first (on tall screens they can't reach the top), then back up, then the middle.
  const last = names.length - 1;
  for (const i of [last, last - 1, 0, Math.floor(names.length / 2), 1]) {
    await links.nth(i).click();
    await expect(links.nth(i)).toHaveAttribute('aria-current', 'true');
    await waitForScrollToStop(page);
    await expect(links.nth(i), `"${names[i]}" is still highlighted once the page stops`).toHaveAttribute('aria-current', 'true');
    await expect(nav.locator('[aria-current]')).toHaveCount(1);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(nav.locator('[aria-current]')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect(links.nth(last)).toHaveAttribute('aria-current', 'true');
  expect(problems).toEqual([]);
});

test('pricing estimator, contact links and the phone upload page', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto('pricing/');
  await page.locator('#est-qty').fill('100');
  await expect(page.locator('#est-out')).toHaveText('₹1,08,000 – ₹1,32,000');
  await page.locator('label.tier', { hasText: 'Premium' }).click();
  await expect(page.locator('#est-out')).toHaveText('₹1,53,000 – ₹1,87,000');
  await expect(page.locator('#est-wa')).toHaveAttribute('href', /^https:\/\/wa\.me\/919000000001\?text=.*100%20sq%20ft/);

  await page.goto('contact/');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: /^Call / })).toHaveAttribute('href', 'tel:+919000000001');
  await expect(main.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919000000001/);
  await expect(main.getByRole('link', { name: 'Open in Google Maps' })).toBeVisible();

  await page.goto('admin/');
  await expect(page.getByRole('heading', { name: 'Connect this phone' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('#up-key-err')).not.toBeEmpty();
  await expect(page.locator('#up-key-err')).toBeVisible();
  expect(problems).toEqual([]);
});
