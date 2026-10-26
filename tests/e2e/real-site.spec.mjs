// Checks the website built from YOUR images/ and site/ folders, on every screen in the test list.
import { test, expect } from '@playwright/test';
import { watchForProblems, expectAllImagesLoaded, expectNoSidewaysScroll } from './helpers.mjs';

const REAL = 'http://127.0.0.1:4401/';

test('every page of your website works and fits the screen', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watchForProblems(page);
  await page.goto(REAL);
  const projectLinks = await page.locator('.pj-title a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  const menuLinks = await page.locator('nav.tabbar a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  const pages = [...new Set([...menuLinks, ...projectLinks])];
  expect(pages.length).toBeGreaterThan(1);
  for (const path of pages) {
    await page.goto(new URL(path, REAL).href);
    await expect(page.locator('main h1')).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectAllImagesLoaded(page);
  }
  expect(problems).toEqual([]);
});

test('the story and photo viewer work on your first project', async ({ page }) => {
  await page.goto(REAL);
  const first = page.locator('.pj-title a').first();
  await first.click();
  await page.getByRole('button', { name: 'Watch as story' }).click();
  const story = page.getByRole('dialog', { name: 'Project story' });
  await expect(story).toBeVisible();
  await expect(story.locator('.v-img')).toHaveJSProperty('complete', true);
  await story.getByRole('button', { name: 'Close story' }).click();
  await expect(story).toBeHidden();
  await page.locator('main a[data-lb]').first().click();
  await expect(page.getByRole('dialog', { name: 'Photo viewer' })).toBeVisible();
});
