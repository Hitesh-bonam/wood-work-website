// Builds the test fixture site under /woodwork-test/ (like a GitHub Pages project site) and serves it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../../src/build.mjs';
import { createStaticServer, listen } from '../../../src/serve.mjs';
import { makeFixture, FIXTURE_BASE } from '../../helpers/fixture.mjs';
import { TEST_REPO } from '../../helpers/fake-github.mjs';
import './exit-with-parent.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = path.join(projectRoot, 'tests', '.tmp', 'fixture-site');
const out = path.join(projectRoot, 'tests', '.tmp', 'fixture-dist');
const port = 4400;

await makeFixture(root);
// The upload page saves to TEST_REPO; the browser tests answer for GitHub (tests/helpers/fake-github.mjs).
await build({ root, out, base: FIXTURE_BASE, siteUrl: `http://127.0.0.1:${port}${FIXTURE_BASE.replace(/\/$/, '')}`, repo: TEST_REPO });
const server = createStaticServer({ dir: out, prefix: FIXTURE_BASE });
await listen(server, port, '127.0.0.1', 0);
console.log(`fixture site ready on http://127.0.0.1:${port}${FIXTURE_BASE}`);
