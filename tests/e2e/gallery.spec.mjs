import { test, expect } from '@playwright/test';
import { watchForProblems } from './helpers.mjs';

test.describe('gallery', () => {
  test('shows every project as a row of photos, newest first', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto('./');
    await expect(page.locator('.pj-title')).toHaveText([
      'Project 10 · Pooja room and wardrobes',
      'Project 4 · Single photo',
      'Project 2',
      'Project 1 · Kitchen & "Dining" <Room>',
      'New villa',
    ]);
    await expect(page.locator('#project-1 .pj-meta')).toHaveText('North · 10 days · 11 photos');
    await expect(page.locator('.gal-count')).toHaveText('5 projects');
    expect(problems).toEqual([]);
  });

  test('the "+" tile counts the photos that do not fit on this screen', async ({ page }) => {
    await page.goto('./');
    const width = page.viewportSize().width;
    const shown = width >= 1024 ? 5 : width >= 640 ? 4 : 3;
    for (const [num, total] of [[1, 11], [10, 6], [2, 3]]) {
      const row = page.locator(`#project-${num} .pj-row`);
      await expect(row.locator('a.tile:not(.more):visible')).toHaveCount(Math.min(shown, total));
      const more = row.locator('a.more');
      if (total > shown) {
        await expect(more).toBeVisible();
        await expect(more.locator('[aria-hidden="true"]:visible')).toHaveText(`+${total - shown}`);
        await expect(more).toHaveAccessibleName(`See all ${total} photos of project ${num}`);
      } else {
        await expect(more).toBeHidden();
      }
    }
  });

  test('filters show only the matching projects', async ({ page }) => {
    await page.goto('./');
    const filters = page.getByRole('group', { name: 'Show projects by type' });
    await expect(filters.getByRole('button')).toHaveText(['All', 'Kitchens', 'Wardrobes', 'Woodwork', 'Painting']);
    await filters.getByRole('button', { name: 'Woodwork' }).click();
    await expect(page.locator('.pj:visible')).toHaveCount(2);
    await expect(page.locator('#project-new-villa')).toBeVisible();
    await expect(page.locator('#project-4')).toBeVisible();
    await expect(filters.getByRole('button', { name: 'Woodwork' })).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: 'Kitchens' }).click();
    await expect(page.locator('.pj:visible')).toHaveCount(1);
    await expect(page.locator('#project-1')).toBeVisible();
    await filters.getByRole('button', { name: 'All' }).click();
    await expect(page.locator('.pj:visible')).toHaveCount(5);
  });

  test('tapping a photo opens all of that project\'s photos in the viewer', async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto('./');
    const tile = page.locator('#project-10 a.tile').first();
    await tile.click();
    const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('.v-title')).toHaveText('Project 10 · Pooja room and wardrobes · 1 / 6');
    await expect(viewer.locator('.v-cap')).toContainText('Woodwork');
    await viewer.getByRole('button', { name: 'Next photo' }).click();
    await expect(viewer.locator('.v-title')).toHaveText(/ 2 \/ 6$/);
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.locator('.v-title')).toHaveText(/ 1 \/ 6$/);
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.locator('.v-title')).toHaveText(/ 6 \/ 6$/);
    await expect(viewer.locator('.v-cap')).toContainText('Pooja room');

    const stage = await viewer.locator('.v-stage').boundingBox();
    await page.mouse.move(stage.x + stage.width * 0.7, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width * 0.2, stage.y + stage.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(viewer.locator('.v-title')).toHaveText(/ 1 \/ 6$/);

    await expect(viewer.locator('.v-img')).toHaveJSProperty('complete', true);
    expect(await viewer.locator('.v-img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await expect(tile).toBeFocused();
    expect(problems).toEqual([]);
  });

  test("the phone's Back button closes the viewer and stays on the page", async ({ page }) => {
    await page.goto('./');
    await page.locator('#project-1 a.tile').first().click();
    const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
    await expect(viewer).toBeVisible();
    await page.goBack();
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/woodwork-test\/$/);
    await expect(page.locator('#project-1')).toBeVisible();
    await page.locator('#project-1 a.tile').nth(1).click();
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/woodwork-test\/$/);
  });

  test('Back still works after the page reloads while a photo is open', async ({ page }) => {
    await page.goto('./');
    await page.goto('project/1/');
    await page.locator('#ch-woodwork a[data-lb]').first().click();
    await expect(page.getByRole('dialog', { name: 'Photo viewer' })).toBeVisible();
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(history.state && history.state.woodworkOverlay))).toBe(false);
    await expect(page).toHaveURL(/project\/1\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/woodwork-test\/$/);
  });

  test('"See the full project" in the viewer opens the project page', async ({ page }) => {
    await page.goto('./');
    await page.locator('#project-10 a.tile').nth(1).click();
    const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
    await viewer.getByRole('link', { name: 'See the full project' }).click();
    await expect(page).toHaveURL(/\/woodwork-test\/project\/10\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pooja room and wardrobes');
    await page.goBack();
    await expect(page).toHaveURL(/\/woodwork-test\/$/);
    await expect(page.getByRole('dialog', { name: 'Photo viewer' })).toBeHidden();
  });

  test('"See all" opens the project page', async ({ page }) => {
    await page.goto('./');
    await page.locator('#project-1').getByRole('link', { name: 'See all photos of project 1' }).click();
    await expect(page).toHaveURL(/\/project\/1\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kitchen & "Dining" <Room>');
  });
});
