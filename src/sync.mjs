// Keeps this folder and GitHub in step, so the website is ONE project whether you add photos
// on this computer or from your phone.
//   node src/sync.mjs pull      → bring down anything added on GitHub (from the phone). PREVIEW.cmd runs this.
//   node src/sync.mjs publish   → bring down phone uploads, save your changes, then send everything. PUBLISH.cmd runs this.
// Nothing the owner made is ever thrown away: when the phone and this computer changed the same file,
// both versions are kept and the owner is told where.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS_DIR, PHOTO_EXTS } from './util.mjs';

/** Files bigger than this are never uploaded (GitHub refuses files over 100 MB). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const OWNER_FOLDERS = [PROJECTS_DIR, 'site'];

let gitCommand = null;
/** Git for Windows if it is installed, otherwise the copy of git that comes with GitHub Desktop. */
function gitBinary() {
  if (gitCommand !== null) return gitCommand;
  if (!spawnSync('git', ['--version'], { windowsHide: true }).error) return (gitCommand = 'git');
  const desktop = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'GitHubDesktop');
  if (desktop && fs.existsSync(desktop)) {
    const apps = fs.readdirSync(desktop).filter((d) => /^app-[\d.]+$/.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const app of apps) {
      const exe = path.join(desktop, app, 'resources', 'app', 'git', 'cmd', 'git.exe');
      if (fs.existsSync(exe)) return (gitCommand = exe);
    }
  }
  return (gitCommand = '');
}

function git(cwd, args, { timeout = 120_000 } = {}) {
  const bin = gitBinary();
  if (!bin) return { ok: false, out: '', err: 'git is not installed', missing: true };
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  return { ok: result.status === 0, raw: result.stdout || '', out: (result.stdout || '').trim(), err: (result.stderr || '').trim() || (timedOut ? 'timed out' : ''), timedOut };
}

const lines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const inOwnerFolders = (file) => OWNER_FOLDERS.some((dir) => file === dir || file.startsWith(`${dir}/`));
const isPhoto = (file) => PHOTO_EXTS.has(path.extname(file).toLowerCase());
const NETWORK = /could not resolve|unable to access|timed out|connection (was )?(reset|refused|closed)|network|operation timed out|failed to connect|ssl/i;

/** "images/project-5/after/a.jpg" → "project-5" (for friendly summaries). */
function projectsIn(files) {
  return [...new Set(files.filter((f) => f.startsWith(`${PROJECTS_DIR}/`)).map((f) => f.split('/')[1]).filter(Boolean))];
}

function notConnected(cwd) {
  if (!gitBinary()) return 'Git was not found. Install GitHub Desktop (or Git for Windows) and try again.';
  if (!git(cwd, ['remote', 'get-url', 'origin']).ok) return 'This folder is not connected to GitHub yet. See "Put the website online" in README.md.';
  return '';
}

/** Files changed on this computer since the last save (tracked or new), inside images/ and site/. */
function localChanges(cwd) {
  const out = git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...OWNER_FOLDERS]).raw;
  const changes = new Map();
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    const file = parts[i].slice(3);
    if (code[0] === 'R' || code[0] === 'C') i++; // the old name follows a rename
    changes.set(file, code);
  }
  return changes;
}

const existsAt = (cwd, ref, file) => git(cwd, ['cat-file', '-e', `${ref}:${file}`]).ok;
const topFolders = (cwd, ref) => new Set(lines(git(cwd, ['ls-tree', '--name-only', `${ref}:${PROJECTS_DIR}`]).out));
const numberOf = (folder) => {
  const match = folder.match(/^(?:project|proj|p)?[\s_.-]*(\d{1,3})(?!\d)/i);
  return match ? Number(match[1]) : 0;
};

/** "kitchen.jpg" → "kitchen-pc.jpg" (or "kitchen-pc-2.jpg" when that is taken too). */
function freeName(cwd, file, suffix) {
  const ext = path.extname(file);
  const stem = file.slice(0, file.length - ext.length);
  for (let n = 1; ; n++) {
    const candidate = `${stem}-${suffix}${n === 1 ? '' : `-${n}`}${ext}`;
    if (!fs.existsSync(path.join(cwd, candidate))) return candidate;
  }
}

/**
 * Brings down what was added on GitHub (for example from the phone), before anything here is saved.
 * Returns { status, message, files, notes } where status is one of:
 * no-remote, offline, nothing-online, up-to-date, updated, blocked.
 */
export function pullLatest(cwd) {
  const problem = notConnected(cwd);
  if (problem) return { status: 'no-remote', message: problem, files: [], notes: [] };
  const fetched = git(cwd, ['fetch', '--quiet', 'origin'], { timeout: 300_000 });
  if (!fetched.ok) {
    const offline = fetched.timedOut || NETWORK.test(fetched.err);
    return {
      status: offline ? 'offline' : 'blocked',
      message: offline ? "Couldn't reach GitHub (no internet, or a very slow connection). Using what is on this computer." : `Couldn't talk to GitHub: ${lines(fetched.err)[0] || 'unknown problem'}`,
      files: [],
      notes: [],
    };
  }
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).out || 'main';
  const remote = `origin/${branch}`;
  if (!git(cwd, ['rev-parse', '--verify', '--quiet', remote]).ok) return { status: 'nothing-online', message: 'Nothing is on GitHub yet.', files: [], notes: [] };
  if (!Number(git(cwd, ['rev-list', '--count', `HEAD..${remote}`]).out || 0)) return { status: 'up-to-date', message: 'Already up to date with GitHub.', files: [], notes: [] };

  const notes = [];
  // An earlier publish that never reached GitHub may have left saves of photos and text here. They
  // become plain changes again (nothing is lost), so they can be lined up with what came from GitHub.
  const base = git(cwd, ['merge-base', 'HEAD', remote]).out;
  const ahead = Number(git(cwd, ['rev-list', '--count', `${remote}..HEAD`]).out || 0);
  if (ahead && base) {
    const touched = lines(git(cwd, ['diff', '--name-only', base, 'HEAD']).out);
    if (touched.every(inOwnerFolders)) {
      git(cwd, ['reset', '--quiet', '--soft', base]);
      git(cwd, ['reset', '--quiet']);
    }
  }
  const from = git(cwd, ['merge-base', 'HEAD', remote]).out || 'HEAD';
  const incoming = lines(git(cwd, ['diff', '--name-only', from, remote]).out);

  // 1. A new project made on the phone and another made here got the same number: this one moves on.
  const known = topFolders(cwd, 'HEAD');
  const arriving = new Set(incoming.filter((f) => f.startsWith(`${PROJECTS_DIR}/`)).map((f) => f.split('/')[1]).filter((f) => f && !known.has(f)));
  let local = localChanges(cwd);
  const madeHere = new Set([...local.keys()].filter((f) => f.startsWith(`${PROJECTS_DIR}/`)).map((f) => f.split('/')[1]).filter((f) => f && !known.has(f)));
  const here = fs.existsSync(path.join(cwd, PROJECTS_DIR)) ? fs.readdirSync(path.join(cwd, PROJECTS_DIR), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const used = [...known, ...topFolders(cwd, remote), ...here].map(numberOf);
  let next = Math.max(0, ...used) + 1;
  for (const folder of madeHere) {
    const clash = [...arriving].find((f) => f === folder || (numberOf(f) && numberOf(f) === numberOf(folder)));
    if (!clash) continue;
    const to = `project-${next++}`;
    fs.renameSync(path.join(cwd, PROJECTS_DIR, folder), path.join(cwd, PROJECTS_DIR, to));
    notes.push(`Your new project "${PROJECTS_DIR}/${folder}" got the same number as one added from your phone, so it is now "${PROJECTS_DIR}/${to}".`);
  }

  // 2. The same file was changed here and on GitHub: keep both.
  local = localChanges(cwd);
  const textClashes = [];
  for (const file of incoming.filter((f) => local.has(f))) {
    const full = path.join(cwd, file);
    const here = fs.existsSync(full);
    if (here && isPhoto(file)) {
      const renamed = freeName(cwd, file, 'pc');
      fs.renameSync(full, path.join(cwd, renamed));
      notes.push(`"${file}" was also added from your phone. Your photo is kept as "${renamed}".`);
    } else if (here) {
      textClashes.push({ file, mine: fs.readFileSync(full) });
      fs.rmSync(full);
    }
    if (existsAt(cwd, 'HEAD', file)) git(cwd, ['checkout', '--quiet', 'HEAD', '--', file]);
  }

  // 3. Bring the changes down. Nothing here touches the same files any more.
  const developerCommits = Number(git(cwd, ['rev-list', '--count', `${remote}..HEAD`]).out || 0) > 0;
  const stashesBefore = lines(git(cwd, ['stash', 'list']).out).length;
  const pulled = developerCommits
    ? git(cwd, ['-c', 'rebase.autoStash=true', 'rebase', '--quiet', remote])
    : git(cwd, ['merge', '--quiet', '--ff-only', '--autostash', remote]);
  const unmerged = lines(git(cwd, ['diff', '--name-only', '--diff-filter=U']).out);
  const leftInStash = lines(git(cwd, ['stash', 'list']).out).length > stashesBefore;
  if (!pulled.ok || unmerged.length || leftInStash) {
    if (git(cwd, ['rev-parse', '--verify', '--quiet', 'REBASE_HEAD']).ok) git(cwd, ['rebase', '--abort']);
    for (const { file, mine } of textClashes) fs.writeFileSync(path.join(cwd, file), mine);
    return {
      status: 'blocked',
      message: `Couldn't bring in the changes from GitHub${unmerged.length ? ` (${unmerged.join(', ')})` : ''}. Nothing was lost. ${lines(pulled.err)[0] || ''}`.trim(),
      files: unmerged,
      notes,
    };
  }

  // 4. For text files changed in both places, this computer's version stays; the phone's sits beside it.
  for (const { file, mine } of textClashes) {
    const full = path.join(cwd, file);
    const theirs = path.join(path.dirname(full), `${path.basename(file, path.extname(file))} (from phone)${path.extname(file)}`);
    if (fs.existsSync(full)) fs.copyFileSync(full, theirs);
    fs.writeFileSync(full, mine);
    notes.push(`"${file}" was changed on your phone too. Yours is kept; the phone's version is saved next to it as "${path.basename(theirs)}" so you can copy anything you need, then delete it.`);
  }
  const projects = projectsIn(incoming);
  return {
    status: 'updated',
    message: `Brought in ${incoming.length} new or changed file${incoming.length === 1 ? '' : 's'} from GitHub${projects.length ? ` (${projects.join(', ')})` : ''}.`,
    files: incoming,
    notes,
  };
}

/** Plain words for why GitHub refused what was sent. */
function pushProblem(err, timedOut) {
  if (/GH001|large files?|exceeds|file size limit|larger than/i.test(err)) {
    return `GitHub refused a file because it is too big (GitHub allows up to 100 MB). Remove the big file from the folder and publish again.`;
  }
  if (/rejected|non-fast-forward|fetch first/i.test(err)) return 'Something new arrived on GitHub while sending (maybe from your phone). Publish again.';
  if (/authentication|permission|403|401|denied/i.test(err)) return 'GitHub did not accept your sign-in. Open GitHub Desktop, check you are signed in (File > Options > Accounts), and publish again.';
  if (timedOut || NETWORK.test(err)) return 'Sending stopped: no internet, or the connection is very slow. Nothing was lost; publish again when the connection is better.';
  return `Sending failed: ${lines(err)[0] || 'unknown problem'}`;
}

/** Brings down phone uploads, saves images/ and site/, then sends everything to GitHub. */
export function publish(cwd, log = console.log) {
  const problem = notConnected(cwd);
  if (problem) {
    log(problem);
    return false;
  }
  if (!git(cwd, ['config', 'user.email']).out || !git(cwd, ['config', 'user.name']).out) {
    log('First time only: open GitHub Desktop and sign in (File > Options > Accounts), then try again.');
    return false;
  }
  // The check that removes GPS locations from photos runs before every save, on every computer.
  if (fs.existsSync(path.join(cwd, '.githooks'))) {
    if (!fs.existsSync(path.join(cwd, 'node_modules', 'sharp'))) {
      log('First time on this computer: double-click PREVIEW.cmd once (it sets things up), then PUBLISH again.');
      return false;
    }
    git(cwd, ['config', 'core.hooksPath', '.githooks']);
  }

  log('Bringing in anything added from your phone...');
  const pulled = pullLatest(cwd);
  for (const note of pulled.notes) log(`  ! ${note}`);
  if (pulled.status === 'offline' || pulled.status === 'blocked') {
    log(pulled.message);
    return false;
  }
  if (pulled.status === 'updated') log(pulled.message);

  log('Saving your projects and photos...');
  const folders = OWNER_FOLDERS.filter((name) => fs.existsSync(path.join(cwd, name)));
  // The "(from phone)" copies kept beside a file are for the owner only, never for the website.
  if (folders.length) git(cwd, ['add', '-A', '--', ...folders, ':(exclude,glob)**/*(from phone)*']);
  const staged = lines(git(cwd, ['diff', '--cached', '--name-only', '--diff-filter=AM']).out);
  for (const file of staged) {
    const full = path.join(cwd, file);
    const size = fs.existsSync(full) ? fs.statSync(full).size : 0;
    if (size > MAX_UPLOAD_BYTES) {
      git(cwd, ['reset', '--quiet', '--', file]);
      log(`  ! "${file}" is ${Math.round(size / 1048576)} MB, too big for the website, so it was not uploaded. Use a smaller copy.`);
    } else if (!isPhoto(file) && size < 1_000_000 && /^(<{7}|>{7}) /m.test(fs.readFileSync(full, 'utf8'))) {
      log(`Nothing was published: "${file}" still has lines starting with <<<<<<< or >>>>>>> from an unfinished sync. Open it, keep the lines you want, delete those marker lines, then publish again.`);
      git(cwd, ['reset', '--quiet']);
      return false;
    }
  }
  let committed = false;
  if (!git(cwd, ['diff', '--cached', '--quiet']).ok) {
    const saved = git(cwd, ['commit', '--quiet', '-m', 'Update projects and photos'], { timeout: 600_000 });
    if (!saved.ok) {
      log(saved.out || saved.err);
      log('Nothing was published. Read the message above, fix it, then try again.');
      return false;
    }
    committed = true;
  } else {
    log('No new changes to save.');
  }

  log('Sending to GitHub...');
  const sent = git(cwd, ['push', '--quiet', '-u', 'origin', 'HEAD'], { timeout: 1_800_000 });
  if (!sent.ok) {
    // An upload GitHub refused must not block every later publish: the save becomes plain changes again.
    if (committed && /GH001|large files?|exceeds|file size limit|larger than/i.test(sent.err)) git(cwd, ['reset', '--quiet', '--soft', 'HEAD~1']);
    log(pushProblem(sent.err, sent.timedOut));
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
    for (const note of result.notes) console.log(`  ! ${note}`);
    if (result.status !== 'nothing-online') console.log(result.message);
  } else if (command === 'publish') {
    if (!publish(root)) process.exitCode = 1;
  } else {
    console.log('Use: node src/sync.mjs pull | publish');
    process.exitCode = 1;
  }
}
