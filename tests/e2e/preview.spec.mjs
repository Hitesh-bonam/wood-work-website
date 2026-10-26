// The live preview: drop photos into a folder and the open page updates by itself.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture, writePhoto, writeText } from '../helpers/fixture.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function waitForServer(url, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`preview did not start at ${url}`);
}

test('adding, changing and removing photos and projects shows up by itself', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'laptop-chrome', 'runs once');
  test.setTimeout(150_000);
  const root = path.join(projectRoot, 'tests', '.tmp', `preview-${Date.now()}`);
  await makeFixture(root);
  const port = 4410;
  const child = spawn(process.execPath, ['src/dev.mjs', '--root', root, '--port', String(port), '--no-open', '--quiet'], { cwd: projectRoot, stdio: 'ignore' });
  try {
    await waitForServer(`http://127.0.0.1:${port}/`);
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator('#project-1 .pj-meta')).toContainText('11 photos');

    await writePhoto(root, 'images/project-1/after/04-new-shelf.jpg', 'wardrobe');
    await expect(page.locator('#project-1 .pj-meta')).toContainText('12 photos', { timeout: 20_000 });

    // A new project folder with only before and after photos (no info.txt) shows up by itself.
    await writePhoto(root, 'images/project-20/before/IMG_20261020_090000.jpg', 'empty');
    await writePhoto(root, 'images/project-20/after/IMG_20261025_170000.jpg', 'kitchen');
    await expect(page.locator('.pj-title').first()).toHaveText('Project 20', { timeout: 20_000 });
    await expect(page.locator('#project-20 .pj-meta')).toContainText('2 photos');
    await writePhoto(root, 'images/project-20/after/IMG_20261025_170500.jpg', 'wardrobe');
    await expect(page.locator('#project-20 .pj-meta')).toContainText('3 photos', { timeout: 20_000 });

    // A title is optional, and can be added or changed later.
    await writeText(root, 'images/project-20/info.txt', 'Title: Fresh kitchen\nArea: East\n');
    await expect(page.locator('.pj-title').first()).toHaveText('Project 20 · Fresh kitchen', { timeout: 20_000 });
    await writeText(root, 'images/project-20/info.txt', 'Title: Fresh kitchen, renamed\n');
    await expect(page.locator('.pj-title').first()).toHaveText('Project 20 · Fresh kitchen, renamed', { timeout: 20_000 });

    await fs.rm(path.join(root, 'images', 'project-20'), { recursive: true, force: true });
    await expect(page.locator('#project-20')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.pj-title').first()).toHaveText('Project 10 · Pooja room and wardrobes');
    await expect(page.locator('.dev-notes summary')).toContainText('about your files');
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
