// Builds the real website (your images/ and site/ folders) into a test folder and serves it.
// Your photos are only read, never changed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../../src/build.mjs';
import { createStaticServer, listen } from '../../../src/serve.mjs';
import './exit-with-parent.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(projectRoot, 'tests', '.tmp', 'real-dist');
const port = 4401;

await build({ root: projectRoot, out, base: '/', siteUrl: `http://127.0.0.1:${port}` });
const server = createStaticServer({ dir: out });
await listen(server, port, '127.0.0.1', 0);
console.log(`real site ready on http://127.0.0.1:${port}/`);
