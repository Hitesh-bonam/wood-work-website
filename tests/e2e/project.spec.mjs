import { test, expect } from '@playwright/test';
import { watchForProblems, waitForScrollToStop } from './helpers.mjs';

test.describe('project page', () => {
  test('tells the project as chapters, with a menu that follows the page', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto('project/1/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kitchen & "Dining" <Room>');
    await expect(page.locator('.p-meta li')).toHaveText(['North', '10 days', 'Finished Sep 2026']);
    const nav = page.getByRole('navigation', { name: 'Chapters' });
    await expect(nav.getByRole('link')).toHaveText(['Before/after', 'Woodwork', 'Painting', 'Team', 'Review', 'Price']);
    await expect(page.locator('main section.chap h2')).toHaveText(['Before and after', 'Woodwork', 'Painting', 'Our team at work', 'What the client said', 'Price for this project']);
    await expect(nav.locator('[aria-current]')).toHaveCount(0);
    await nav.getByRole('link', { name: 'Painting' }).click();
    await expect(page.locator('#ch-painting h2')).toBeInViewport();
    await expect(nav.getByRole('link', { name: 'Painting' })).toHaveAttribute('aria-current', 'true');
    await expect(nav.locator('[aria-current]')).toHaveCount(1);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(nav.getByRole('link', { name: 'Price' })).toHaveAttribute('aria-current', 'true');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(nav.locator('[aria-current]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('on tall screens the chapter you tap is the one highlighted', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    const sizes = [{ width: 834, height: 1194 }, { width: 712, height: 1138 }];
    // A tall computer screen; phones and tablets never have a window this big.
    if (!isMobile) sizes.push({ width: 1440, height: 2200 });
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto('project/1/');
      const nav = page.getByRole('navigation', { name: 'Chapters' });
      for (const name of ['Painting', 'Team', 'Woodwork', 'Before/after']) {
        await nav.getByRole('link', { name }).click();
        await expect(nav.getByRole('link', { name }), `${name} at ${size.width}x${size.height}`).toHaveAttribute('aria-current', 'true');
        // Still the same chapter once the page has finished gliding and gone quiet.
        await waitForScrollToStop(page);
        await expect(nav.getByRole('link', { name }), `${name} at ${size.width}x${size.height} after the page stops`).toHaveAttribute('aria-current', 'true');
        await expect(nav.locator('[aria-current]')).toHaveCount(1);
      }
    }
  });

  test('the before and after slider compares the two photos', async ({ page }) => {
    await page.goto('project/1/');
    const figure = page.locator('[data-ba]').first();
    await expect(figure.locator('img.ba-before')).toHaveAttribute('alt', 'Before: Hall');
    await expect(figure.locator('img.ba-after')).toHaveAttribute('alt', 'After: Hall');
    const slider = figure.getByRole('slider', { name: 'Slide to compare before and after' });
    await slider.fill('20');
    await expect(figure).toHaveAttribute('style', /--pos:\s*20%/);
    await figure.locator('.ba-frame').scrollIntoViewIfNeeded();
    const box = await figure.locator('.ba-frame').boundingBox();
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
    await expect(slider).toHaveValue('75');
    await expect(page.locator('#ch-before-after .ptag')).toHaveText(['Before']);
  });

  test('scrolling with a finger over the before/after photo does not move the line', async ({ page }) => {
    await page.goto('project/1/');
    const figure = page.locator('[data-ba]').first();
    await figure.locator('.ba-frame').scrollIntoViewIfNeeded();
    const finger = (moves) => figure.locator('.ba-frame').evaluate((frame, steps) => {
      const r = frame.getBoundingClientRect();
      const fire = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + x * r.width, clientY: r.top + y * r.height, bubbles: true }));
      const [first, ...rest] = steps;
      fire('pointerdown', first[0], first[1], frame);
      for (const [x, y] of rest) fire('pointermove', x, y, frame);
      const last = steps[steps.length - 1];
      fire('pointerup', last[0], last[1], window);
    }, moves);
    const slider = figure.getByRole('slider', { name: 'Slide to compare before and after' });
    await finger([[0.8, 0.5], [0.8, 0.6], [0.8, 0.75]]);
    await expect(slider).toHaveValue('50');
    await finger([[0.5, 0.5], [0.6, 0.5], [0.3, 0.52]]);
    await expect(slider).toHaveValue('30');
  });

  test('photos open full screen with their chapter and caption', async ({ page }) => {
    await page.goto('project/1/');
    await page.locator('#ch-woodwork a[data-lb]').first().click();
    const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
    await expect(viewer.locator('.v-title')).toHaveText('Kitchen & "Dining" <Room> · 6 / 11');
    await expect(viewer.locator('.v-cap .v-ch')).toHaveText('Woodwork');
    await expect(viewer.locator('.v-cap')).toContainText('Tall unit');
    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer).toBeHidden();
  });

  test('story mode plays every photo and ends with the next steps', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto('project/1/');
    await page.getByRole('button', { name: 'Watch as story' }).click();
    const story = page.getByRole('dialog', { name: 'Project story' });
    await expect(story).toBeVisible();
    await expect(story.locator('.s-bar')).toHaveCount(11);
    // Pause first: on a busy computer the story may already have moved on by itself.
    await story.getByRole('button', { name: 'Pause' }).click();
    await expect(story.getByRole('button', { name: 'Play' })).toBeVisible();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await expect(story.locator('.s-cap .v-ch')).toHaveText('Before');
    await story.getByRole('button', { name: 'Next photo' }).click();
    await expect(story.locator('.s-cap .v-ch')).toHaveText('After');
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    const end = story.locator('.s-end');
    await expect(end).toBeVisible();
    await expect(end.getByRole('link', { name: 'Get a quote on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919000000001\?text=.*Project%201/);
    await expect(end.getByRole('link', { name: 'Next: New villa' })).toHaveAttribute('href', '/woodwork-test/project/new-villa/');
    await end.getByRole('link', { name: 'See the price' }).click();
    await expect(story).toBeHidden();
    await expect(page.locator('#ch-price h2')).toBeInViewport();
    expect(problems).toEqual([]);
  });

  test('story mode moves on by itself, even after a press released outside the photo', async ({ page }) => {
    await page.goto('project/2/');
    await page.getByRole('button', { name: 'Watch as story' }).click();
    const story = page.getByRole('dialog', { name: 'Project story' });
    await expect(story.locator('.s-bar')).toHaveCount(3);
    const stage = await story.locator('.s-stage').boundingBox();
    const top = await story.locator('.v-bar').boundingBox();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.move(top.x + 20, top.y + top.height / 2);
    await page.mouse.up();
    await expect(story.locator('.s-bar i').first()).toHaveAttribute('style', /width: 100%/, { timeout: 15_000 });
  });

  test("the phone's Back button closes the story", async ({ page }) => {
    await page.goto('project/10/');
    await page.getByRole('button', { name: 'Watch as story' }).click();
    const story = page.getByRole('dialog', { name: 'Project story' });
    await expect(story).toBeVisible();
    await page.goBack();
    await expect(story).toBeHidden();
    await expect(page).toHaveURL(/project\/10\/$/);
  });

  test('price, WhatsApp and the next project are at the end', async ({ page }) => {
    await page.goto('project/1/');
    const price = page.locator('#ch-price');
    await expect(price.locator('tbody tr')).toHaveText([/Cabinets\s*₹1,20,000/, /Paint\s*₹30,000/, /Hardware\s*₹15,000/]);
    await expect(price.locator('tfoot')).toContainText('₹1,65,000');
    const ask = page.locator('.p-intro').getByRole('link', { name: 'Ask about this project' });
    const message = decodeURIComponent((await ask.getAttribute('href')).split('text=')[1]);
    expect(message).toBe('Hi Test Woodworks & Sons, I saw Project 1 (Kitchen & "Dining" <Room>, North) on your website. I\'d like a quote for something similar.');
    const next = page.locator('a.next-card');
    await expect(next).toContainText('New villa');
    await next.click();
    await expect(page).toHaveURL(/project\/new-villa\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New villa');
    await expect(page.locator('a.next-card')).toContainText('Project 10');
  });

  test('a project without details or price still looks complete', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto('project/2/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Project 2');
    await expect(page.locator('#ch-price')).toHaveCount(0);
    await expect(page.locator('.chap-nav')).toHaveCount(0);
    await expect(page.locator('#ch-photos h2')).toHaveText('Photos');
    expect(problems).toEqual([]);
  });
});
