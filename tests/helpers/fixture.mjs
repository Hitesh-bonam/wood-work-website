// Builds a throw-away site folder full of awkward real-world cases for the tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { sampleSvg } from '../../scripts/sample-art.mjs';

export const FIXTURE_BASE = '/woodwork-test/';

const seedOf = (text) => parseInt(createHash('md5').update(text).digest('hex').slice(0, 6), 16);

export async function writeText(root, rel, text) {
  const file = path.join(root, ...rel.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text.replace(/^\n/, ''), 'utf8');
  return file;
}

export async function writePhoto(root, rel, kind = 'wardrobe', options = {}) {
  const file = path.join(root, ...rel.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  const svg = sampleSvg(kind, { width: options.width ?? 800, height: options.height ?? 600, seed: seedOf(rel), label: 'TEST' });
  let image = sharp(Buffer.from(svg));
  if (options.exif) image = image.withExif(options.exif);
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation });
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') await image.png().toFile(file);
  else if (ext === '.webp') await image.webp().toFile(file);
  else await image.jpeg({ quality: 80 }).toFile(file);
  return file;
}

export async function makeFixture(root) {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });

  await writeText(root, 'site/business.txt', `
# test business
Business name: Test Woodworks & Sons
Tagline: Fine woodwork <tested>
Phone: 90000 00001
WhatsApp: 90000 00001
Email: hello@example.com
City: Testville
Areas: North, South
Hours: Mon to Sat, 9 to 6
Map: Testville main road
Years: 7
Homes done: 50+
Warranty: 2-year warranty
About: We test things properly.
Instagram: @testwoodworks
`);
  await writeText(root, 'site/rates.txt', `
Rates as of: Oct 2026
Wardrobes = 1200 / 1700 per sq ft
Painting = 18 per sq ft
Repairs = Visit ₹500, then quoted
`);

  // Project 1: everything at once, with tricky text.
  await writeText(root, 'projects/project-1/info.txt', `
Title: Kitchen & "Dining" <Room>
Area: North
Days: 10
Finished: Sep 2026
Type: Kitchens, Painting
Review: Very good work.
Review by: A client
Price:
Cabinets = 1,20,000
Paint = ₹ 30k
Hardware: 15000
this line is wrong
`);
  await writePhoto(root, 'projects/project-1/before/kitchen.jpg', 'damaged');
  await writePhoto(root, 'projects/project-1/before/hall.jpg', 'damaged');
  await writePhoto(root, 'projects/project-1/before/extra-corner.jpg', 'damaged');
  await writePhoto(root, 'projects/project-1/after/kitchen.jpg', 'kitchen');
  await writePhoto(root, 'projects/project-1/after/hall.jpg', 'paint');
  await writePhoto(root, 'projects/project-1/woodwork/01-tall-unit.jpg', 'wardrobe');
  await writePhoto(root, 'projects/project-1/woodwork/IMG_20261012_101010.jpg', 'kitchen');
  await writePhoto(root, 'projects/project-1/woodwork/03-tv-unit.png', 'tvunit');
  await writePhoto(root, 'projects/project-1/painting/01-accent-wall.jpg', 'paint');
  await writePhoto(root, 'projects/project-1/painting/02-texture.jpg', 'texture');
  await writePhoto(root, 'projects/project-1/team/01-carpenter.jpg', 'team');

  // Project 2: no info.txt, a cover photo and loose photos.
  await writePhoto(root, 'projects/project-2/cover.jpg', 'door');
  await writePhoto(root, 'projects/project-2/a-side-view.jpg', 'door');
  await writePhoto(root, 'projects/project-2/WhatsApp Image 2026-10-12 at 14.32.12.jpeg', 'paint');

  // Project 10: a number above 9, and a folder name the site doesn't know (becomes its own chapter).
  await writeText(root, 'projects/Project 10/info.txt', `
Title: Pooja room and wardrobes
Type: Wardrobes
`);
  for (const [i, kind] of ['wardrobe', 'wardrobe', 'door', 'tvunit'].entries()) await writePhoto(root, `projects/Project 10/woodwork/0${i + 1}-unit.jpg`, kind);
  await writePhoto(root, 'projects/Project 10/pooja room/01-pooja-unit.jpg', 'door');
  await writePhoto(root, 'projects/Project 10/pooja room/02-bells.jpg', 'hardware');

  // A folder without a number.
  await writePhoto(root, 'projects/new villa/woodwork/01.jpg', 'wardrobe');

  // Only files the website can't use.
  await writeText(root, 'projects/project-3/woodwork/photo.heic', 'not really a heic');
  await writeText(root, 'projects/project-3/video.mp4', 'not really a video');

  // A damaged photo next to a good one.
  await writeText(root, 'projects/project-4/info.txt', 'Title: Single photo\n');
  await writeText(root, 'projects/project-4/woodwork/broken.jpg', 'this is not a jpeg');
  await writePhoto(root, 'projects/project-4/woodwork/good.jpg', 'kitchen');

  // Ignored.
  await writeText(root, 'projects/_template/info.txt', 'Title:\n');
  await writeText(root, 'projects/_template/woodwork/.gitkeep', '');

  await writePhoto(root, 'site/materials/01 BWP ply - Strong and waterproof.jpg', 'plywood');
  await writePhoto(root, 'site/materials/02 Laminate.jpg', 'laminate');
  await writePhoto(root, 'site/team/01 Lead carpenter - 10 years with us.jpg', 'person', { width: 600, height: 600 });
  return root;
}
