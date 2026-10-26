// Phone and computer are one project: photos added on either side end up in both, through GitHub.
// A local bare repository stands in for GitHub here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pullLatest, publish } from '../../src/sync.mjs';
import { writeText } from '../helpers/fixture.mjs';

function run(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function identity(cwd) {
  run(cwd, 'config', 'user.name', 'Test');
  run(cwd, 'config', 'user.email', 'test@example.com');
  run(cwd, 'config', 'core.autocrlf', 'false');
}

async function setup() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-sync-'));
  const github = path.join(base, 'github.git');
  run(base, 'init', '--quiet', '--bare', '-b', 'main', github);
  const computer = path.join(base, 'computer');
  await fs.mkdir(computer);
  run(computer, 'init', '--quiet', '-b', 'main');
  identity(computer);
  await writeText(computer, 'images/project-1/info.txt', 'Title: First\n');
  await writeText(computer, 'site/business.txt', 'Business name: Test\n');
  run(computer, 'add', '-A');
  run(computer, 'commit', '--quiet', '-m', 'start');
  run(computer, 'remote', 'add', 'origin', github);
  run(computer, 'push', '--quiet', '-u', 'origin', 'main');
  const phone = path.join(base, 'phone');
  run(base, 'clone', '--quiet', github, phone);
  identity(phone);
  return { base, github, computer, phone };
}

async function phoneUploads(phone, rel, text) {
  await writeText(phone, rel, text);
  run(phone, 'add', '-A');
  run(phone, 'commit', '--quiet', '-m', 'Add photos from phone');
  run(phone, 'push', '--quiet', 'origin', 'main');
}

test('photos added from the phone come down to this computer when the preview starts', async () => {
  const { base, computer, phone } = await setup();
  assert.equal(pullLatest(computer).status, 'up-to-date');
  await phoneUploads(phone, 'images/project-2/woodwork/kitchen.jpg', 'photo from phone');
  const result = pullLatest(computer);
  assert.equal(result.status, 'updated');
  assert.match(result.message, /project-2/);
  assert.ok(existsSync(path.join(computer, 'images', 'project-2', 'woodwork', 'kitchen.jpg')));
  await fs.rm(base, { recursive: true, force: true });
});

test('publishing sends computer photos and keeps the phone photos: one project', async () => {
  const { base, github, computer, phone } = await setup();
  await phoneUploads(phone, 'images/project-2/woodwork/kitchen.jpg', 'photo from phone');
  await writeText(computer, 'images/project-1/woodwork/wardrobe.jpg', 'photo from computer');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), true, messages.join('\n'));
  const online = run(base, `--git-dir=${github}`, 'ls-tree', '-r', '--name-only', 'main').split('\n');
  assert.ok(online.includes('images/project-1/woodwork/wardrobe.jpg'));
  assert.ok(online.includes('images/project-2/woodwork/kitchen.jpg'));
  assert.ok(existsSync(path.join(computer, 'images', 'project-2', 'woodwork', 'kitchen.jpg')));
  assert.ok(messages.some((m) => m.includes('project-2')));
  assert.ok(messages.at(-1).startsWith('Done.'));
  assert.equal(pullLatest(phone).status, 'updated');
  assert.ok(existsSync(path.join(phone, 'images', 'project-1', 'woodwork', 'wardrobe.jpg')));
  await fs.rm(base, { recursive: true, force: true });
});

test('the same file changed on both sides is reported and nothing is lost', async () => {
  const { base, computer, phone } = await setup();
  await phoneUploads(phone, 'images/project-1/info.txt', 'Title: Changed on the phone\n');
  await writeText(computer, 'images/project-1/info.txt', 'Title: Changed on the computer\n');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), false);
  assert.ok(messages.some((m) => m.includes('images/project-1/info.txt')), messages.join('\n'));
  assert.equal(existsSync(path.join(computer, '.git', 'rebase-merge')) || existsSync(path.join(computer, '.git', 'rebase-apply')), false);
  assert.equal(await fs.readFile(path.join(computer, 'images', 'project-1', 'info.txt'), 'utf8'), 'Title: Changed on the computer\n');
  assert.equal(run(computer, 'log', '-1', '--format=%s'), 'Update projects and photos');
  await fs.rm(base, { recursive: true, force: true });
});

test('no GitHub connection, or no internet, never stops the preview', async () => {
  const { base, computer } = await setup();
  run(computer, 'remote', 'set-url', 'origin', path.join(base, 'missing.git'));
  assert.equal(pullLatest(computer).status, 'offline');
  run(computer, 'remote', 'remove', 'origin');
  assert.equal(pullLatest(computer).status, 'no-remote');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), false);
  assert.match(messages[0], /not connected to GitHub/);
  await fs.rm(base, { recursive: true, force: true });
});
