// The home page sections (What we do, How we work, Questions) and the Telugu website, built from
// YOUR site/ folder, on every screen in the test list.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { watchForProblems, expectAllImagesLoaded, expectNoSidewaysScroll, textLines } from './helpers.mjs';

const REAL = 'http://127.0.0.1:4401/';
const TELUGU_PAGES = ['te/', 'te/pricing/', 'te/contact/', 'te/materials/'];
const runsAccessibility = (name) => name === 'laptop-chrome' || name === 'phone-android';

test('every Telugu page works, is in Telugu, fits the screen and is accessible', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const problems = watchForProblems(page);
  await page.goto(`${REAL}te/`);
  const projects = await page.locator('.pj-title a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  for (const path of [...TELUGU_PAGES, ...projects.slice(0, 2)]) {
    await page.goto(new URL(path, REAL).href);
    await expect(page.locator('html'), path).toHaveAttribute('lang', 'te');
    await expect(page.locator('main h1'), path).toBeVisible();
    // Every menu link stays on the Telugu website.
    const menu = await page.locator('nav.tabbar a, .nav-desk a').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(menu.filter((href) => !href.includes('/te/')), `${path}: menu links stay in Telugu`).toEqual([]);
    await expectNoSidewaysScroll(page);
    await expectAllImagesLoaded(page);
    if (runsAccessibility(testInfo.project.name)) {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  }
  expect(problems).toEqual([]);
});

test('the language button switches the same page between English and Telugu', async ({ page }) => {
  await page.goto(`${REAL}pricing/`);
  await page.locator('a.lang').click();
  await expect(page).toHaveURL(`${REAL}te/pricing/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await page.locator('a.lang').click();
  await expect(page).toHaveURL(`${REAL}pricing/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the home page shows what we do, how we work and the questions, and answers open', async ({ page }) => {
  const problems = watchForProblems(page);
  await page.goto(REAL);
  await expect(page.locator('.svc')).not.toHaveCount(0);
  await expect(page.locator('.step')).not.toHaveCount(0);
  const first = page.locator('.faq-item').first();
  const answer = first.locator('p');
  await expect(answer).toBeHidden();
  await first.locator('summary').click();
  await expect(answer).toBeVisible();
  await first.locator('summary').click();
  await expect(answer).toBeHidden();
  // Search engines get the same questions.
  const faqData = await page.locator('script[type="application/ld+json"]').evaluateAll((s) => s.map((el) => el.textContent).join(''));
  expect(faqData).toContain('FAQPage');
  // Sections slide in as you scroll; after scrolling to the bottom, everything has arrived.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await expect(page.locator('.reveal:not(.shown)')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('without scripts the home page still shows everything, and answers still open', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(REAL);
  for (const part of ['.svc', '.step', '.faq-item', '.pj', '.cta-band']) await expect(page.locator(part).first(), part).toBeVisible();
  const transform = await page.locator('.pj').first().evaluate((el) => getComputedStyle(el).transform);
  expect(transform, 'nothing is waiting to slide in').toBe('none');
  await page.locator('.faq-item summary').first().click();
  await expect(page.locator('.faq-item p').first()).toBeVisible();
  await context.close();
});

test('with "reduce motion" turned on, nothing slides', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(REAL);
  await expect(page.locator('html.js-reveal, body.js-reveal')).toHaveCount(0);
  await context.close();
});

test.describe('Telugu words fit on every screen size', () => {
  test.skip(({ isMobile }) => isMobile, 'the size sweep runs in the laptop browsers');
  for (const width of [320, 360, 412, 768, 1024, 1440]) {
    test(`Telugu pages at ${width}px wide`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      for (const path of TELUGU_PAGES) {
        await page.goto(new URL(path, REAL).href);
        await expectNoSidewaysScroll(page);
        const text = await textLines(page);
        expect(text.menus.filter((m) => m.lines !== 1), `${path}: menu items on one line`).toEqual([]);
        expect(text.brand, `${path}: business name uses at most two lines`).toBeLessThanOrEqual(2);
        const heading = await page.locator('main h1').boundingBox();
        const header = await page.locator('header.top').boundingBox();
        expect(heading.y, `${path}: the title is not under the header`).toBeGreaterThanOrEqual(header.y + header.height - 1);
      }
    });
  }
});
