// `npm run dev` (or double-click PREVIEW.cmd) — shows the website on your computer and
// refreshes the page by itself whenever you add, change or remove photos or text files.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, sizeReport } from './build.mjs';
import { createStaticServer, listen } from './serve.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(arg('--root', projectRoot));
const out = path.resolve(arg('--out', path.join(root, 'dist')));
const wantedPort = Number(arg('--port', process.env.PORT || 4321));
const openBrowser = !args.includes('--no-open') && !process.env.CI;
const quiet = args.includes('--quiet');

const clients = new Set();
function broadcast(event, data = '') {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

// Runs only in the preview: refreshes the page after each rebuild and lists notes about your files.
const RELOAD_JS = `(() => {
  const source = new EventSource('/__dev/events');
  source.addEventListener('reload', () => location.reload());
  source.addEventListener('problem', (e) => {
    let box = document.querySelector('.dev-error');
    if (!box) { box = document.createElement('div'); box.className = 'dev-error'; box.setAttribute('role', 'alert'); document.body.appendChild(box); }
    box.textContent = 'Preview problem: ' + JSON.parse(e.data);
  });
  fetch('/__dev/notes').then((r) => r.json()).then((notes) => {
    if (!notes.length) return;
    const box = document.createElement('details');
    box.className = 'dev-notes';
    box.innerHTML = '<summary></summary><ul></ul>';
    box.querySelector('summary').textContent = notes.length + (notes.length === 1 ? ' note' : ' notes') + ' about your files (only you can see this)';
    const list = box.querySelector('ul');
    notes.forEach((note) => { const li = document.createElement('li'); li.textContent = note; list.appendChild(li); });
    document.body.appendChild(box);
  }).catch(() => {});
})();`;
let notes = [];

const server = createStaticServer({
  dir: out,
  routes: {
    '/__dev/reload.js': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(RELOAD_JS);
    },
    '/__dev/notes': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(notes));
    },
    '/__dev/events': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
  },
});

const log = (...lines) => {
  if (!quiet) console.log(...lines);
};
let port = 0;
let building = false;
let queued = false;
let settleTimer = null;
let shownWarnings = new Set();
/** Photos the preview just tidied itself; their change events must not trigger another refresh. */
const ownChanges = new Map();
const changeKey = (file) => {
  const rel = path.relative(root, file).split(path.sep).join('/');
  return process.platform === 'win32' ? rel.toLowerCase() : rel;
};

async function rebuild() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  try {
    const result = await build({
      root,
      out,
      base: '/',
      siteUrl: `http://localhost:${port}`,
      dev: true,
      cleanSources: true,
      onTidy: (file) => ownChanges.set(changeKey(file), Date.now() + 4000),
    });
    const fresh = result.warnings.filter((w) => !shownWarnings.has(w));
    shownWarnings = new Set(result.warnings);
    notes = result.warnings;
    for (const warning of fresh) log(`  ! ${warning}`);
    log(`[${new Date().toLocaleTimeString()}] Updated: ${result.projects} projects, ${result.photos} photos${result.cleaned ? `, tidied ${result.cleaned} new photos` : ''}. ${sizeReport(result.bytes).text}`);
    broadcast('reload');
    clearTimeout(settleTimer);
    if (result.deferred) settleTimer = setTimeout(rebuild, 2500);
  } catch (err) {
    console.error(`Preview problem: ${err.message}`);
    broadcast('problem', err.message);
  } finally {
    building = false;
    if (queued) {
      queued = false;
      rebuild();
    }
  }
}

let debounce = null;
function scheduleRebuild() {
  clearTimeout(debounce);
  debounce = setTimeout(rebuild, 400);
}

function watchFolder(dir) {
  fs.mkdirSync(dir, { recursive: true });
  let watcher;
  const start = () => {
    try {
      watcher = fs.watch(dir, { recursive: true }, (event, name) => {
        const file = String(name || '');
        if (/\.(tmp|crdownload|part)$/i.test(file) || /(^|[\\/])(thumbs\.db|desktop\.ini|\.ds_store)$/i.test(file)) return;
        if (file) {
          const until = ownChanges.get(changeKey(path.join(dir, file)));
          if (until && Date.now() < until) return;
        }
        scheduleRebuild();
      });
      watcher.on('error', () => {
        watcher.close();
        setTimeout(start, 1000);
      });
    } catch {
      setTimeout(start, 1000);
    }
  };
  start();
}

port = await listen(server, wantedPort);
await rebuild();
watchFolder(path.join(root, 'projects'));
watchFolder(path.join(root, 'site'));
if (root === projectRoot) {
  fs.watch(path.join(projectRoot, 'src'), { recursive: true }, scheduleRebuild);
}

const url = `http://localhost:${port}/`;
log('');
log(`  Your website preview is running at  ${url}`);
log('  Add or change photos in the "projects" folder and the page refreshes by itself.');
log('  Keep this window open. Close it (or press Ctrl+C) to stop the preview.');
log('');
if (openBrowser) {
  const [cmd, cmdArgs] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // The address is printed above; opening the browser is only a convenience.
  }
}
