// Pre-launch rehearsal, run by playwright.rehearsal.config.mjs:
//  1. copies ONLY what is committed (exactly what GitHub will receive) into a fresh folder,
//  2. installs from scratch with `npm ci`, like GitHub does,
//  3. fills it with realistic dummy content (full-size phone photos, GPS, sideways photos, ~36 projects),
//  4. builds and link-checks it exactly like the GitHub workflow (site under /website/),
//  5. serves it at http://127.0.0.1:4500/website/ for the browser tests.
// A report with timings and sizes is written to tests/.tmp/rehearsal/report.json.
// REHEARSAL_COMMIT=<sha> rehearses that commit instead of the last one, for example the not-yet-committed
// changes from `git stash create` (a commit object that no branch points to).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeRealisticContent } from './make-content.mjs';
import '../e2e/servers/exit-with-parent.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const work = path.join(projectRoot, 'tests', '.tmp', 'rehearsal');
const clone = path.join(work, 'repo');
const PORT = 4500;
const BASE = '/website';
const env = {
  ...process.env,
  SITE_URL: `http://127.0.0.1:${PORT}${BASE}`,
  BASE_PATH: BASE,
  GITHUB_REPOSITORY: 'example-owner/website',
  GITHUB_ACTIONS: 'true',
  CI: 'true',
};
const report = { steps: {} };

function step(name, command, args, cwd) {
  const started = Date.now();
  // npm is a .cmd file on Windows and needs a shell; git does not (and paths with spaces must not go through one).
  // (Through a shell the command goes as one line; npm's arguments here are plain words.)
  const shell = process.platform === 'win32' && command === 'npm';
  const result = shell
    ? spawnSync([command, ...args].join(' '), { cwd, env, encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  report.steps[name] = { ms: Date.now() - started, ok: result.status === 0, output: output.split('\n').slice(-40).join('\n') };
  if (result.status !== 0) throw new Error(`${name} failed:\n${report.steps[name].output}`);
  return output;
}

async function dirSize(dir) {
  let total = 0;
  let files = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await dirSize(full);
      total += sub.total;
      files += sub.files;
    } else {
      total += (await fs.stat(full)).size;
      files++;
    }
  }
  return { total, files };
}

try {
  await fs.rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  await fs.mkdir(work, { recursive: true });
  step('clone', 'git', ['clone', '--quiet', projectRoot, clone], work);
  // A local clone copies every object, so a commit no branch points to can be checked out too.
  if (process.env.REHEARSAL_COMMIT) step('checkout', 'git', ['checkout', '--quiet', '--detach', process.env.REHEARSAL_COMMIT], clone);
  report.commit = step('commit', 'git', ['log', '-1', '--format=%h %s'], clone);
  step('install', 'npm', ['ci', '--no-audit', '--no-fund'], clone);

  const started = Date.now();
  report.content = await makeRealisticContent(clone);
  report.steps.content = { ms: Date.now() - started, ok: true };
  const sources = await dirSize(path.join(clone, 'images'));
  report.content.sourceMB = +(sources.total / 1048576).toFixed(1);

  const buildOutput = step('build', 'npm', ['run', 'build'], clone);
  report.warnings = buildOutput.split('\n').filter((line) => line.includes('! ') || line.includes('::warning'));
  step('check', 'npm', ['run', 'check'], clone);
  const site = await dirSize(path.join(clone, 'dist'));
  report.site = { files: site.files, MB: +(site.total / 1048576).toFixed(1) };
  report.ok = true;
} catch (err) {
  report.ok = false;
  report.error = String(err.message || err);
}
await fs.writeFile(path.join(work, 'report.json'), JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error(report.error);
  process.exit(1);
}

// Serve with the copy's own server code, the way the website will be served: under /website/.
const { createStaticServer, listen } = await import(pathToFileURL(path.join(clone, 'src', 'serve.mjs')).href);
const server = createStaticServer({ dir: path.join(clone, 'dist'), prefix: BASE });
await listen(server, PORT, '127.0.0.1', 0);
console.log(`rehearsal site ready on http://127.0.0.1:${PORT}${BASE}/`);
