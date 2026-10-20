// Runs after `npm install`. Turns on the git hook that tidies photos before every commit
// (removes location data, turns photos upright, shrinks them to web size).
// It never fails the install: if anything is missing it just skips.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  if (!process.env.CI && existsSync(path.join(root, '.git')) && existsSync(path.join(root, '.githooks'))) {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
  }
} catch {
  // git not installed or not a repository yet; nothing to do.
}
