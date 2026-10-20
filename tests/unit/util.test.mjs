import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseAmount, parsePriceLine, captionFromFilename, isCameraName, parseKeyValueText, readText, formatMoney,
  youtubeId, esc, scriptJson, normalizeBase, naturalCompare, splitTitle,
} from '../../src/util.mjs';

test('prices are read in every common Indian format', () => {
  assert.equal(parseAmount('1,92,000'), 192000);
  assert.equal(parseAmount('₹ 1,92,000'), 192000);
  assert.equal(parseAmount('₹1,92,000'), 192000);
  assert.equal(parseAmount('Rs. 8,000/-'), 8000);
  assert.equal(parseAmount('INR 5000'), 5000);
  assert.equal(parseAmount('1.92 lakh'), 192000);
  assert.equal(parseAmount('1.5L'), 150000);
  assert.equal(parseAmount('65k'), 65000);
  assert.equal(parseAmount('65 K'), 65000);
  assert.equal(parseAmount('2 crore'), 20000000);
  assert.equal(parseAmount('480000'), 480000);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('12 apples'), null);
});

test('price list lines are split into item and amount', () => {
  assert.deepEqual(parsePriceLine('Wardrobes (3) = 1,92,000'), { item: 'Wardrobes (3)', amount: 192000 });
  assert.deepEqual(parsePriceLine('Hardware: 15000'), { item: 'Hardware', amount: 15000 });
  assert.deepEqual(parsePriceLine('- Door polish = 8000'), { item: 'Door polish', amount: 8000 });
  assert.deepEqual(parsePriceLine('1. Door polish = 8000'), { item: 'Door polish', amount: 8000 });
  assert.deepEqual(parsePriceLine('Time: 10 = 500'), { item: 'Time: 10', amount: 500 });
  assert.deepEqual(parsePriceLine('Painting 2 coats 39000'), { item: 'Painting 2 coats', amount: 39000 });
  assert.deepEqual(parsePriceLine('3 wardrobes = 90k'), { item: '3 wardrobes', amount: 90000 });
  assert.equal(parsePriceLine('this line is wrong'), null);
  assert.equal(parsePriceLine('= 500'), null);
  assert.equal(parsePriceLine('Wardrobe = lots'), null);
});

test('captions come from file names, and phone names give no caption', () => {
  assert.equal(captionFromFilename('01-master-wardrobe-sliding-doors.jpg'), 'Master wardrobe sliding doors');
  assert.equal(captionFromFilename('03 Soft-close hinge.JPG'), 'Soft-close hinge');
  assert.equal(captionFromFilename('2 mm edge banding.jpg'), '2 mm edge banding');
  assert.equal(captionFromFilename('03-tv-unit.png'), 'TV unit');
  assert.equal(captionFromFilename('3bhk-living-room.jpg'), '3BHK living room');
  assert.equal(captionFromFilename('BWP ply 18 mm.jpg'), 'BWP ply 18 mm');
  assert.equal(captionFromFilename('kitchen_after.webp'), 'Kitchen after');
  assert.equal(captionFromFilename('Picture of kitchen.jpg'), 'Picture of kitchen');
  assert.equal(captionFromFilename('పూజ గది.jpg'), 'పూజ గది');
  for (const name of ['IMG_2041.jpg', 'IMG-20261012-WA0001.jpg', 'WhatsApp Image 2026-10-12 at 14.32.12.jpeg', 'PXL_20261012_143212345.jpg', 'DSC_0012.JPG', '20261012_143212.jpg', 'image (3).png', 'Screenshot 2026-10-12.png', '1.jpg', '001.jpg', 'P1010023.JPG']) {
    assert.equal(captionFromFilename(name), '', name);
  }
  assert.equal(isCameraName('Wardrobe 2'), false);
  assert.equal(isCameraName('Pantry 2'), false);
});

test('"Name: value" files are read the way people write them', () => {
  const text = '﻿# a note\r\nTitle: Hello: World\r\nArea = North\r\nbad line\r\nPrice:\r\nA = 10\r\n# a note inside\r\nB: 20\r\nReview: Great\r\nC = 30\r\n';
  const r = parseKeyValueText(text, { sectionKeys: ['price'], knownKeys: ['title', 'area', 'review'] });
  assert.equal(r.fields.title, 'Hello: World');
  assert.equal(r.fields.area, 'North');
  assert.deepEqual(r.sections.price.map((x) => x.text), ['A = 10', 'B: 20']);
  assert.equal(r.fields.review, 'Great');
  assert.equal(r.fields.c, '30');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /line 4/);
});

test('text files saved as UTF-8, UTF-8 with BOM, or UTF-16 all read the same', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ww-text-'));
  const text = 'Title: Pooja room ₹ 5,000';
  await fs.writeFile(path.join(dir, 'plain.txt'), text, 'utf8');
  await fs.writeFile(path.join(dir, 'bom.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]));
  await fs.writeFile(path.join(dir, 'le.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
  const be = Buffer.from(text, 'utf16le');
  be.swap16();
  await fs.writeFile(path.join(dir, 'be.txt'), Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
  for (const name of ['plain.txt', 'bom.txt', 'le.txt', 'be.txt']) assert.equal(await readText(path.join(dir, name)), text, name);
  await fs.rm(dir, { recursive: true, force: true });
});

test('money uses Indian grouping for rupees', () => {
  assert.equal(formatMoney(480000), '₹4,80,000');
  assert.equal(formatMoney(65000), '₹65,000');
  assert.equal(formatMoney(1234567, '$'), '$1,234,567');
  assert.equal(formatMoney(999.6), '₹1,000');
});

test('YouTube links in every shape give the video id', () => {
  for (const url of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/watch?feature=share&v=abcdefghijk', 'https://www.youtube.com/shorts/abcdefghijk', 'https://www.youtube.com/embed/abcdefghijk?si=x']) {
    assert.equal(youtubeId(url), 'abcdefghijk', url);
  }
  assert.equal(youtubeId('https://example.com/video'), null);
  assert.equal(youtubeId(''), null);
});

test('text is escaped for HTML and script tags', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  const json = scriptJson({ a: '</script><b>' });
  assert.ok(!json.includes('</script'));
  assert.deepEqual(JSON.parse(json), { a: '</script><b>' });
});

test('small helpers', () => {
  assert.equal(normalizeBase(''), '/');
  assert.equal(normalizeBase('repo'), '/repo/');
  assert.equal(normalizeBase('/repo'), '/repo/');
  assert.equal(normalizeBase('//a//'), '/a/');
  assert.deepEqual(['project-10', 'project-2', 'Project-1'].sort(naturalCompare), ['Project-1', 'project-2', 'project-10']);
  assert.deepEqual(splitTitle('BWP ply 18 mm - Strong - waterproof'), { title: 'BWP ply 18 mm', desc: 'Strong - waterproof' });
  assert.deepEqual(splitTitle('Soft-close hinges'), { title: 'Soft-close hinges', desc: '' });
});
