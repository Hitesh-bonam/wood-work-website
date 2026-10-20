import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { cleanPhotoInPlace, processPhoto, makeShareImage, SMALL, LARGE, SOURCE_MAX } from '../../src/photos.mjs';
import { writePhoto, writeText } from '../helpers/fixture.mjs';

let dir;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-photos-'));
});
after(() => fs.rm(dir, { recursive: true, force: true }));

const GPS = { IFD0: { Make: 'PhoneCam', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '17/1 24/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '78/1 28/1 0/1' } };

test('a phone photo is turned upright, shrunk and stripped of its location', async () => {
  const file = await writePhoto(dir, 'phone.jpg', 'wardrobe', { width: 2600, height: 1800, exif: GPS, orientation: 6 });
  const beforeMeta = await sharp(file).metadata();
  assert.ok(beforeMeta.exif, 'test photo should start with hidden data');
  assert.equal(beforeMeta.orientation, 6);

  assert.equal(await cleanPhotoInPlace(file), true);
  const meta = await sharp(file).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.orientation, undefined);
  assert.ok(meta.height > meta.width, 'the sideways photo is now upright');
  assert.equal(Math.max(meta.width, meta.height), SOURCE_MAX);

  const bytes = await fs.readFile(file);
  assert.equal(await cleanPhotoInPlace(file), false, 'a tidy photo is left alone');
  assert.deepEqual(await fs.readFile(file), bytes);
});

test('read-only photos and photos with small glitches are tidied too', async () => {
  const readOnly = await writePhoto(dir, 'read-only.jpg', 'wardrobe', { width: 2400, height: 1600, exif: GPS });
  await fs.chmod(readOnly, 0o444);
  assert.equal(await cleanPhotoInPlace(readOnly), true);
  assert.equal((await sharp(readOnly).metadata()).exif, undefined);

  // Three stray bytes before the image data: many cameras write JPEGs like this and they open fine.
  const good = await fs.readFile(await writePhoto(dir, 'glitch-source.jpg', 'kitchen', { width: 2400, height: 1600, exif: GPS }));
  const sos = good.indexOf(Buffer.from([0xff, 0xda]));
  const glitchy = path.join(dir, 'glitchy.jpg');
  await fs.writeFile(glitchy, Buffer.concat([good.subarray(0, sos), Buffer.from([0x00, 0x00, 0x00]), good.subarray(sos)]));
  assert.equal(await cleanPhotoInPlace(glitchy), true);
  const meta = await sharp(glitchy).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.width, SOURCE_MAX);
});

test('PNG and WebP photos keep their format when tidied', async () => {
  for (const name of ['big.png', 'big.webp']) {
    const file = await writePhoto(dir, name, 'paint', { width: 2400, height: 1200 });
    assert.equal(await cleanPhotoInPlace(file), true);
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, name.endsWith('.png') ? 'png' : 'webp');
    assert.equal(meta.width, SOURCE_MAX);
  }
});

test('a half-copied photo is never overwritten', async () => {
  const good = await writePhoto(dir, 'whole.jpg', 'kitchen', { width: 2400, height: 1600, exif: GPS });
  const bytes = await fs.readFile(good);
  const half = path.join(dir, 'half.jpg');
  await fs.writeFile(half, bytes.subarray(0, Math.floor(bytes.length / 2)));
  const halfBytes = await fs.readFile(half);
  await assert.rejects(() => cleanPhotoInPlace(half));
  assert.deepEqual(await fs.readFile(half), halfBytes);
  const leftovers = (await fs.readdir(dir)).filter((n) => n.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('web versions are made once, at two sizes, without enlarging small photos', async () => {
  const out = path.join(dir, 'out');
  await fs.mkdir(out, { recursive: true });
  const big = await writePhoto(dir, 'web-big.jpg', 'wardrobe', { width: 1800, height: 1200 });
  const r = await processPhoto(big, out);
  assert.deepEqual([r.s.w, r.s.h], [SMALL, 400]);
  assert.deepEqual([r.l.w, r.l.h], [LARGE, 1067]);
  const stat = await fs.stat(path.join(out, r.l.name));
  const again = await processPhoto(big, out);
  assert.equal(again.l.name, r.l.name);
  assert.equal((await fs.stat(path.join(out, r.l.name))).mtimeMs, stat.mtimeMs, 'not made twice');

  const small = await writePhoto(dir, 'web-small.jpg', 'door', { width: 400, height: 300 });
  const rs = await processPhoto(small, out);
  assert.deepEqual([rs.s.w, rs.s.h, rs.l.w, rs.l.h], [400, 300, 400, 300]);
  for (const name of [r.s.name, r.l.name]) assert.equal((await sharp(path.join(out, name)).metadata()).format, 'webp');

  const share = await makeShareImage(big, out);
  const shareMeta = await sharp(path.join(out, share)).metadata();
  assert.deepEqual([shareMeta.width, shareMeta.height, shareMeta.format], [1200, 630, 'jpeg']);
});

test('a file that is not a photo is reported, not crashed on', async () => {
  const bad = await writeText(dir, 'not-a-photo.jpg', 'hello');
  await assert.rejects(() => processPhoto(bad, dir));
  await assert.rejects(() => cleanPhotoInPlace(bad));
});
