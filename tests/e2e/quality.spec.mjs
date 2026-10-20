import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PAGES, watchForProblems, expectAllImagesLoaded } from './helpers.mjs';

const runsAccessibility = (name) => name === 'laptop-chrome' || name === 'phone-android';
const axeIssues = async (page, include) => {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

test.describe('quality on every page', () => {
  for (const path of [...PAGES, 'does-not-exist/']) {
    test(`no errors, all photos load, accessible: /${path}`, async ({ page }, testInfo) => {
      const problems = watchForProblems(page, { expect404: path === 'does-not-exist/' });
      await page.goto(path);
      await expectAllImagesLoaded(page);
      if (runsAccessibility(testInfo.project.name)) expect(await axeIssues(page)).toEqual([]);
      expect(problems).toEqual([]);
    });
  }
});

test('the photo viewer and the story are accessible too', async ({ page }, testInfo) => {
  test.skip(!runsAccessibility(testInfo.project.name), 'checked in Chrome only');
  await page.goto('project/1/');
  await page.locator('#ch-woodwork a[data-lb]').first().click();
  await expect(page.getByRole('dialog', { name: 'Photo viewer' })).toBeVisible();
  expect(await axeIssues(page, 'dialog[open]')).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Watch as story' }).click();
  await expect(page.getByRole('dialog', { name: 'Project story' })).toBeVisible();
  expect(await axeIssues(page, 'dialog[open]')).toEqual([]);
});

test('the keyboard can reach everything, starting with "Skip to content"', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile, 'phones have no Tab key');
  test.skip(browserName === 'webkit', 'Safari only tabs to links when "Press Tab to highlight each item" is turned on');
  await page.goto('./');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
