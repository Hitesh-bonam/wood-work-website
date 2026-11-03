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

const online = (base, github) => run(base, `--git-dir=${github}`, 'ls-tree', '-r', '--name-only', 'main').split('\n');
const onlineText = (base, github, file) => run(base, `--git-dir=${github}`, 'show', `main:${file}`);

test('the same info.txt changed on both sides: this computer wins, the phone version is kept beside it', async () => {
  const { base, github, computer, phone } = await setup();
  await phoneUploads(phone, 'images/project-1/info.txt', 'Title: Changed on the phone\n');
  await writeText(computer, 'images/project-1/info.txt', 'Title: Changed on the computer\n');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), true, messages.join('\n'));
  assert.equal(await fs.readFile(path.join(computer, 'images', 'project-1', 'info.txt'), 'utf8'), 'Title: Changed on the computer\n');
  assert.equal(await fs.readFile(path.join(computer, 'images', 'project-1', 'info (from phone).txt'), 'utf8'), 'Title: Changed on the phone\n');
  assert.ok(messages.some((m) => m.includes('info (from phone).txt')), messages.join('\n'));
  assert.equal(onlineText(base, github, 'images/project-1/info.txt'), 'Title: Changed on the computer');
  assert.ok(!online(base, github).some((f) => f.includes('(from phone)')), 'the side copy stays on this computer');
  assert.equal(run(computer, 'status', '--porcelain', '--', 'images/project-1/info.txt'), '');
  await fs.rm(base, { recursive: true, force: true });
});

test('the same photo name added on both sides: both photos are kept', async () => {
  const { base, github, computer, phone } = await setup();
  await phoneUploads(phone, 'images/project-1/after/kitchen.jpg', 'phone photo');
  await writeText(computer, 'images/project-1/after/kitchen.jpg', 'computer photo');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), true, messages.join('\n'));
  assert.equal(onlineText(base, github, 'images/project-1/after/kitchen.jpg'), 'phone photo');
  assert.equal(onlineText(base, github, 'images/project-1/after/kitchen-pc.jpg'), 'computer photo');
  assert.ok(messages.some((m) => m.includes('kitchen-pc.jpg')), messages.join('\n'));
  await fs.rm(base, { recursive: true, force: true });
});

test('a new project made on the phone and one made here with the same number are both kept', async () => {
  const { base, github, computer, phone } = await setup();
  await phoneUploads(phone, 'images/project-2/after/1.jpg', 'phone home');
  await writeText(computer, 'images/project-2/after/1.jpg', 'computer home');
  await writeText(computer, 'images/project-2/info.txt', 'Title: Computer home\n');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), true, messages.join('\n'));
  assert.equal(onlineText(base, github, 'images/project-2/after/1.jpg'), 'phone home');
  assert.equal(onlineText(base, github, 'images/project-3/after/1.jpg'), 'computer home');
  assert.equal(onlineText(base, github, 'images/project-3/info.txt'), 'Title: Computer home');
  assert.ok(messages.some((m) => m.includes('project-3')), messages.join('\n'));
  await fs.rm(base, { recursive: true, force: true });
});

test('an old save that never reached GitHub no longer blocks publishing', async () => {
  const { base, github, computer, phone } = await setup();
  // Left behind by an earlier version, or by a publish that stopped halfway.
  await writeText(computer, 'images/project-1/info.txt', 'Title: Saved here earlier\n');
  run(computer, 'add', '-A');
  run(computer, 'commit', '--quiet', '-m', 'Update projects and photos');
  await phoneUploads(phone, 'images/project-1/info.txt', 'Title: From the phone\n');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), true, messages.join('\n'));
  assert.equal(onlineText(base, github, 'images/project-1/info.txt'), 'Title: Saved here earlier');
  assert.equal(await fs.readFile(path.join(computer, 'images', 'project-1', 'info (from phone).txt'), 'utf8'), 'Title: From the phone\n');
  await fs.rm(base, { recursive: true, force: true });
});

test('leftover sync markers and huge files are never published', async () => {
  const { base, github, computer } = await setup();
  await writeText(computer, 'images/project-1/info.txt', '<<<<<<< Updated upstream\nTitle: A\n=======\nTitle: B\n>>>>>>> Stashed changes\n');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), false);
  assert.ok(messages.some((m) => m.includes('<<<<<<<')), messages.join('\n'));
  assert.equal(onlineText(base, github, 'images/project-1/info.txt'), 'Title: First');

  await writeText(computer, 'images/project-1/info.txt', 'Title: Fixed\n');
  await fs.mkdir(path.join(computer, 'images', 'project-1', 'after'), { recursive: true });
  await fs.writeFile(path.join(computer, 'images', 'project-1', 'after', 'huge.jpg'), Buffer.alloc(51 * 1024 * 1024));
  messages.length = 0;
  assert.equal(publish(computer, (m) => messages.push(m)), true, messages.join('\n'));
  assert.ok(messages.some((m) => m.includes('huge.jpg') && m.includes('too big')), messages.join('\n'));
  assert.ok(!online(base, github).includes('images/project-1/after/huge.jpg'));
  assert.equal(onlineText(base, github, 'images/project-1/info.txt'), 'Title: Fixed');
  await fs.rm(base, { recursive: true, force: true });
});

test('no GitHub connection, or no internet, never stops the preview', async () => {
  const { base, computer } = await setup();
  run(computer, 'remote', 'set-url', 'origin', path.join(base, 'missing.git'));
  assert.match(pullLatest(computer).status, /^(offline|blocked)$/);
  run(computer, 'remote', 'remove', 'origin');
  assert.equal(pullLatest(computer).status, 'no-remote');
  const messages = [];
  assert.equal(publish(computer, (m) => messages.push(m)), false);
  assert.match(messages[0], /not connected to GitHub/);
  await fs.rm(base, { recursive: true, force: true });
});
