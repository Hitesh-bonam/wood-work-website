// Keeps this folder and GitHub in step, so the website is ONE project whether you add photos
// on this computer or from your phone.
//   node src/sync.mjs pull      → bring down anything added on GitHub (from the phone). PREVIEW.cmd runs this.
//   node src/sync.mjs publish   → save your changes, bring down phone uploads, then send everything. PUBLISH.cmd runs this.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function git(cwd, args, { inherit = false, timeout = 120_000 } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout, stdio: inherit ? 'inherit' : 'pipe', windowsHide: true });
  return { ok: result.status === 0, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() };
}

const lines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/** "projects/project-5/woodwork/a.jpg" → "project-5" (for friendly summaries). */
function projectsIn(files) {
  return [...new Set(files.filter((f) => f.startsWith('projects/')).map((f) => f.split('/')[1]).filter(Boolean))];
}

function rebaseInProgress(cwd) {
  const gitDir = git(cwd, ['rev-parse', '--git-dir']).out;
  const dir = path.resolve(cwd, gitDir);
  return fs.existsSync(path.join(dir, 'rebase-merge')) || fs.existsSync(path.join(dir, 'rebase-apply'));
}

/**
 * Brings down what was added on GitHub (for example from the phone).
 * Returns { status, message, files } where status is one of:
 * no-remote, offline, nothing-online, up-to-date, updated, conflict, blocked.
 */
export function pullLatest(cwd) {
  if (!git(cwd, ['remote', 'get-url', 'origin']).ok) {
    return { status: 'no-remote', message: 'This folder is not connected to GitHub yet.', files: [] };
  }
  if (!git(cwd, ['fetch', '--quiet', 'origin'], { timeout: 60_000 }).ok) {
    return { status: 'offline', message: "Couldn't reach GitHub (no internet?). Using what is on this computer.", files: [] };
  }
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).out || 'main';
  const remote = `origin/${branch}`;
  if (!git(cwd, ['rev-parse', '--verify', '--quiet', remote]).ok) {
    return { status: 'nothing-online', message: 'Nothing is on GitHub yet.', files: [] };
  }
  const incoming = Number(git(cwd, ['rev-list', '--count', `HEAD..${remote}`]).out || 0);
  if (!incoming) return { status: 'up-to-date', message: 'Already up to date with GitHub.', files: [] };

  const base = git(cwd, ['merge-base', 'HEAD', remote]).out;
  const files = base ? lines(git(cwd, ['diff', '--name-only', base, remote]).out) : [];
  const pulled = git(cwd, ['pull', '--rebase', '--autostash', '--quiet', 'origin', branch]);
  if (pulled.ok) {
    const projects = projectsIn(files);
    return {
      status: 'updated',
      message: `Brought in ${files.length} new or changed file${files.length === 1 ? '' : 's'} from GitHub${projects.length ? ` (${projects.join(', ')})` : ''}.`,
      files,
    };
  }
  if (rebaseInProgress(cwd)) {
    const clashes = lines(git(cwd, ['diff', '--name-only', '--diff-filter=U']).out);
    git(cwd, ['rebase', '--abort']);
    return {
      status: 'conflict',
      message: `The same file was changed both here and on GitHub (from the phone): ${clashes.join(', ') || 'unknown file'}. Nothing was lost. Rename your copy (for example add "-2" to the photo name) and try again.`,
      files: clashes,
    };
  }
  return { status: 'blocked', message: `Couldn't bring in the changes from GitHub: ${lines(pulled.err)[0] || 'unknown problem'}`, files: [] };
}

/** Saves projects/ and site/, brings down phone uploads, then sends everything to GitHub. */
export function publish(cwd, log = console.log) {
  if (!git(cwd, ['remote', 'get-url', 'origin']).ok) {
    log('This folder is not connected to GitHub yet. See "Put the website online" in README.md.');
    return false;
  }
  if (!git(cwd, ['config', 'user.email']).out || !git(cwd, ['config', 'user.name']).out) {
    log('First time only: open GitHub Desktop and sign in (File > Options > Accounts), then try again.');
    return false;
  }
  log('Saving your projects and photos...');
  const folders = ['projects', 'site'].filter((name) => fs.existsSync(path.join(cwd, name)));
  if (folders.length) git(cwd, ['add', '-A', '--', ...folders]);
  if (!git(cwd, ['diff', '--cached', '--quiet']).ok) {
    if (!git(cwd, ['commit', '--quiet', '-m', 'Update projects and photos'], { inherit: true }).ok) {
      log('Nothing was published. Read the message above, fix it, then try again.');
      return false;
    }
  } else {
    log('No new changes to save.');
  }
  log('Bringing in anything added from your phone...');
  const pulled = pullLatest(cwd);
  if (['conflict', 'blocked', 'offline'].includes(pulled.status)) {
    log(pulled.message);
    return false;
  }
  if (pulled.status === 'updated') log(pulled.message);
  log('Sending to GitHub...');
  if (!git(cwd, ['push', '--quiet', '-u', 'origin', 'HEAD'], { inherit: true, timeout: 300_000 }).ok) {
    log('Sending failed. Check your internet connection and try again.');
    return false;
  }
  log('Done. Your website updates in about 2 minutes.');
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const command = process.argv[2];
  if (command === 'pull') {
    const result = pullLatest(root);
    if (result.status !== 'no-remote' && result.status !== 'nothing-online') console.log(result.message);
  } else if (command === 'publish') {
    if (!publish(root)) process.exitCode = 1;
  } else {
    console.log('Use: node src/sync.mjs pull | publish');
    process.exitCode = 1;
  }
}
