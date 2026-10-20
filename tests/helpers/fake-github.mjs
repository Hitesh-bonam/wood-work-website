// A small stand-in for the GitHub API, for testing the upload page without the internet.
// It keeps a real-looking repository in memory (blobs, trees, commits and the main branch) and
// answers the same requests GitHub does. Used by the unit tests (as fetch) and the browser tests (page.route).
import { createHash } from 'node:crypto';

export const TEST_REPO = 'test-owner/woodwork-test';
export const TEST_KEY = 'github_pat_11TESTKEY0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab';
export const READ_ONLY_KEY = 'github_pat_11READONLY0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

const sha1 = (...parts) => {
  const hash = createHash('sha1');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
};

export class FakeGitHub {
  /**
   * @param {object} options
   * @param {Record<string, string|Buffer>} options.files  path → content of the first commit
   */
  constructor({ files = {}, repo = TEST_REPO, branch = 'main', keys = [TEST_KEY], readOnlyKeys = [READ_ONLY_KEY] } = {}) {
    this.repo = repo;
    this.branch = branch;
    this.keys = new Set(keys);
    this.readOnlyKeys = new Set(readOnlyKeys);
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    /** Every request: { method, path, auth } (the key itself is never stored here). */
    this.log = [];
    /** Set to make requests fail like a phone without signal (see routeGitHub). */
    this.offline = false;
    /** Answers to give instead of the real one, used once each: [{ method, path, status, json }]. */
    this.failures = [];
    /** Runs once, just before the branch is moved: lets a test save something "from the computer" first. */
    this.beforeMove = null;
    const map = {};
    for (const [path, content] of Object.entries(files)) map[path] = this.addBlob(Buffer.from(content));
    this.head = this.addCommit({ tree: this.addTree(map), parents: [], message: 'First version' });
    this.firstCommit = this.head;
  }

  addBlob(buffer) {
    const sha = sha1(`blob ${buffer.length}\0`, buffer);
    this.blobs.set(sha, buffer);
    return sha;
  }

  addTree(map) {
    const paths = Object.keys(map).sort();
    const sha = sha1('tree', JSON.stringify(paths.map((p) => [p, map[p]])));
    this.trees.set(sha, { ...map });
    return sha;
  }

  addCommit({ tree, parents, message }) {
    const sha = sha1('commit', tree, parents.join(','), message, String(this.commits.size));
    this.commits.set(sha, { tree, parents, message });
    return sha;
  }

  /** The files of a commit (the branch by default), as path → Buffer. */
  files(commit = this.head) {
    const map = this.trees.get(this.commits.get(commit).tree);
    return Object.fromEntries(Object.entries(map).map(([path, sha]) => [path, this.blobs.get(sha)]));
  }

  text(path, commit = this.head) {
    const buffer = this.files(commit)[path];
    return buffer ? buffer.toString('utf8') : null;
  }

  /** Commits on the branch, newest first. */
  history() {
    const out = [];
    for (let sha = this.head; sha; sha = this.commits.get(sha).parents[0]) out.push({ sha, ...this.commits.get(sha) });
    return out;
  }

  /** Saves a commit as if it came from somewhere else, for example PUBLISH.cmd on the computer. */
  pushFromElsewhere(files, message = 'Update projects and photos') {
    const map = { ...this.trees.get(this.commits.get(this.head).tree) };
    for (const [path, content] of Object.entries(files)) map[path] = this.addBlob(Buffer.from(content));
    this.head = this.addCommit({ tree: this.addTree(map), parents: [this.head], message });
    return this.head;
  }

  /** Answers one request like api.github.com does. Returns { status, json, headers }. */
  async handle({ method, url, headers = {}, body }) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (parsed.origin !== 'https://api.github.com') return { status: 400, json: { message: 'Not the GitHub API' } };
    if (method === 'OPTIONS') return { status: 204 };
    const auth = String(lower.authorization || '');
    const key = auth.replace(/^(Bearer|token)\s+/i, '');
    this.log.push({ method, path: path + parsed.search, auth: Boolean(auth), urlHasKey: url.includes(key) && key.length > 0 });
    const failure = this.failures.findIndex((f) => f.method === method && (f.path instanceof RegExp ? f.path.test(path) : f.path === path));
    if (failure !== -1) {
      const [f] = this.failures.splice(failure, 1);
      return { status: f.status, json: f.json ?? { message: 'Failed on purpose' }, headers: f.headers };
    }
    if (!this.keys.has(key) && !this.readOnlyKeys.has(key)) return { status: 401, json: { message: 'Bad credentials' } };
    const base = `/repos/${this.repo}`;
    if (path !== base && !path.startsWith(`${base}/`)) return { status: 404, json: { message: 'Not Found' } };
    const rest = path.slice(base.length);
    const json = body ? JSON.parse(typeof body === 'string' ? body : Buffer.from(body).toString('utf8')) : null;
    const readOnly = this.readOnlyKeys.has(key);
    const forbidden = { status: 403, json: { message: 'Resource not accessible by personal access token' } };
    let m;

    if (method === 'GET' && rest === '') {
      return { status: 200, json: { full_name: this.repo, default_branch: this.branch, private: false } };
    }
    if (method === 'GET' && rest === `/git/ref/heads/${this.branch}`) {
      return { status: 200, json: { ref: `refs/heads/${this.branch}`, object: { sha: this.head, type: 'commit' } } };
    }
    if (method === 'GET' && (m = rest.match(/^\/git\/commits\/([0-9a-f]{40})$/))) {
      const commit = this.commits.get(m[1]);
      if (!commit) return { status: 404, json: { message: 'Not Found' } };
      return { status: 200, json: { sha: m[1], tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })), message: commit.message } };
    }
    if (method === 'GET' && (m = rest.match(/^\/git\/trees\/([0-9a-f]{40})$/))) {
      const tree = this.trees.get(m[1]);
      if (!tree) return { status: 404, json: { message: 'Not Found' } };
      const dirs = new Set();
      for (const p of Object.keys(tree)) {
        const parts = p.split('/');
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      }
      const entries = [
        ...[...dirs].map((p) => ({ path: p, mode: '040000', type: 'tree', sha: sha1('dir', p) })),
        ...Object.entries(tree).map(([p, sha]) => ({ path: p, mode: '100644', type: 'blob', sha, size: this.blobs.get(sha).length })),
      ].sort((a, b) => (a.path < b.path ? -1 : 1));
      return { status: 200, json: { sha: m[1], tree: entries, truncated: false } };
    }
    if (method === 'GET' && (m = rest.match(/^\/git\/blobs\/([0-9a-f]{40})$/))) {
      const blob = this.blobs.get(m[1]);
      if (!blob) return { status: 404, json: { message: 'Not Found' } };
      // GitHub wraps the base64 text in lines of 60 characters.
      const content = blob.toString('base64').replace(/(.{60})/g, '$1\n');
      return { status: 200, json: { sha: m[1], size: blob.length, encoding: 'base64', content } };
    }
    if (method === 'POST' && rest === '/git/blobs') {
      if (readOnly) return forbidden;
      if (typeof json.content !== 'string') return { status: 422, json: { message: 'Invalid request' } };
      const buffer = json.encoding === 'base64' ? Buffer.from(json.content, 'base64') : Buffer.from(json.content, 'utf8');
      return { status: 201, json: { sha: this.addBlob(buffer), url: `https://api.github.com${base}/git/blobs/x` } };
    }
    if (method === 'POST' && rest === '/git/trees') {
      if (readOnly) return forbidden;
      const map = json.base_tree ? { ...this.trees.get(json.base_tree) } : {};
      if (json.base_tree && !this.trees.has(json.base_tree)) return { status: 422, json: { message: 'Invalid base_tree' } };
      for (const entry of json.tree) {
        if (entry.mode !== '100644' || entry.type !== 'blob' || /(^|\/)\.\.?(\/|$)|^\/|\/$/.test(entry.path)) return { status: 422, json: { message: `Invalid tree entry ${entry.path}` } };
        if (entry.sha === null) delete map[entry.path];
        else if (typeof entry.content === 'string') map[entry.path] = this.addBlob(Buffer.from(entry.content, 'utf8'));
        else if (this.blobs.has(entry.sha)) map[entry.path] = entry.sha;
        else return { status: 422, json: { message: `Unknown blob ${entry.sha}` } };
      }
      return { status: 201, json: { sha: this.addTree(map) } };
    }
    if (method === 'POST' && rest === '/git/commits') {
      if (readOnly) return forbidden;
      if (!this.trees.has(json.tree) || !json.parents.every((p) => this.commits.has(p))) return { status: 422, json: { message: 'Invalid commit' } };
      return { status: 201, json: { sha: this.addCommit({ tree: json.tree, parents: json.parents, message: json.message }) } };
    }
    if (method === 'PATCH' && rest === `/git/refs/heads/${this.branch}`) {
      if (readOnly) return forbidden;
      if (this.beforeMove) {
        const run = this.beforeMove;
        this.beforeMove = null;
        run(this);
      }
      const commit = this.commits.get(json.sha);
      if (!commit) return { status: 422, json: { message: 'Object does not exist' } };
      if (json.sha !== this.head && !commit.parents.includes(this.head) && !json.force) return { status: 422, json: { message: 'Update is not a fast forward' } };
      this.head = json.sha;
      return { status: 200, json: { ref: `refs/heads/${this.branch}`, object: { sha: this.head, type: 'commit' } } };
    }
    return { status: 404, json: { message: 'Not Found' } };
  }

  /** A fetch() that talks to this fake, for the unit tests. */
  fetch = async (url, init = {}) => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const res = await this.handle({ method: init.method || 'GET', url: String(url), headers: init.headers || {}, body: init.body });
    return new Response(res.status === 204 || res.json === undefined ? null : JSON.stringify(res.json), { status: res.status, headers: { 'content-type': 'application/json', ...res.headers } });
  };
}

/** Sends the page's requests to api.github.com to the fake instead (browser tests). */
export async function routeGitHub(page, fake) {
  await page.route('https://api.github.com/**', async (route) => {
    if (fake.offline) {
      await route.abort('internetdisconnected');
      return;
    }
    const request = route.request();
    let res;
    try {
      // headers(), not allHeaders(): the latter can wait forever for a request that never reaches the network.
      res = await fake.handle({ method: request.method(), url: request.url(), headers: request.headers(), body: request.postDataBuffer() });
    } catch (err) {
      res = { status: 500, json: { message: `Fake GitHub failed: ${err.message}` } };
    }
    await route.fulfill({
      status: res.status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'Authorization, Content-Type, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, X-Requested-With',
        'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
        'access-control-expose-headers': 'ETag, Link, Location, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
        ...res.headers,
      },
      body: res.status === 204 || res.json === undefined ? '' : JSON.stringify(res.json),
    });
  });
}
