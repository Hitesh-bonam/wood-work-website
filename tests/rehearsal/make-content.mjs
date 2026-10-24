// Realistic dummy content for the pre-launch rehearsal: about 36 projects with photos that behave like
// real phone photos (12 MP, 3-6 MB, camera grain, sideways photos with EXIF orientation, GPS location,
// phone and WhatsApp file names, screenshots, PNG, WebP, JFIF, upper-case extensions, Telugu names),
// plus full business details, rates, materials and team.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { sampleSvg } from '../../scripts/sample-art.mjs';

sharp.cache(false);

const GPS = { IFD0: { Make: 'PhoneCam', Model: 'Z-12 Pro' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '17/1 26/1 1200/100', GPSLongitudeRef: 'E', GPSLongitude: '78/1 23/1 3300/100' } };

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Drawing a picture from scratch is slow, so each scene is drawn once per size (4 variants per kind)
// and every photo is made from one of those, with its own brightness/colour shift so no two are the same.
const scenes = new Map();
const grains = new Map();

async function scene(kind, width, height, variant) {
  const key = `${kind}:${width}x${height}:${variant}`;
  if (!scenes.has(key)) {
    const scale = Math.max(width, height) > 2000 ? 3 : 1;
    const svg = sampleSvg(kind, { width: Math.round(width / scale), height: Math.round(height / scale), seed: variant + 1, label: '' });
    scenes.set(key, sharp(Buffer.from(svg)).resize(width, height).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  return scenes.get(key);
}

async function grainLayer(width, height, sigma) {
  const key = `${width}x${height}:${sigma}`;
  if (!grains.has(key)) {
    grains.set(key, sharp({ create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma } } }).raw().toBuffer({ resolveWithObject: true }));
  }
  return grains.get(key);
}

/**
 * Writes a photo-like image (camera grain, phone-sized files). `orientation` 3/6/8 stores the pixels
 * turned the way a phone does, with the EXIF flag that tells viewers how to turn it back upright.
 */
export async function realisticPhoto(file, { width, height, kind, seed, orientation = 1, gps = false, format, grain = 22, quality = 90 }) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const base = await scene(kind, width, height, seed % 4);
  const noise = await grainLayer(width, height, grain);
  const raw = { width, height, channels: 3 };
  const mixed = await sharp(base.data, { raw })
    .composite([{ input: noise.data, raw, blend: 'soft-light' }])
    .modulate({ brightness: 0.92 + (seed % 9) * 0.02, hue: (seed * 7) % 24 })
    .raw()
    .toBuffer();
  let image = sharp(mixed, { raw });
  if (orientation === 6) image = image.rotate(270);
  else if (orientation === 8) image = image.rotate(90);
  else if (orientation === 3) image = image.rotate(180);
  if (orientation !== 1) image = sharp(await image.raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => sharp(data, { raw: info }).png({ compressionLevel: 0 }).toBuffer())).withMetadata({ orientation });
  if (gps) image = image.withExif(GPS);
  const ext = format || path.extname(file).toLowerCase().replace('.', '');
  if (ext === 'png') await image.png().toFile(file);
  else if (ext === 'webp') await image.webp({ quality }).toFile(file);
  else await image.jpeg({ quality, chromaSubsampling: '4:2:0' }).toFile(file);
  return file;
}

const write = async (root, rel, text) => {
  const file = path.join(root, ...rel.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text.replace(/^\n/, ''), 'utf8');
};

const AREAS = ['Kondapur', 'Gachibowli', 'Madhapur', 'Kukatpally', 'Miyapur', 'Banjara Hills', 'Jubilee Hills', 'Manikonda', 'Kompally', 'Uppal', 'LB Nagar', 'Secunderabad'];
const TITLES = [
  ['3BHK full interior', 'Full home, Wardrobes, Kitchens, Painting'],
  ['Modular kitchen', 'Kitchens'],
  ['Bedroom wardrobes', 'Wardrobes'],
  ['Repaint and repairs', 'Painting, Repairs'],
  ['TV unit and living room', 'Woodwork'],
  ['Pooja unit and main door', 'Woodwork'],
  ['Complete 4BHK villa interior with modular kitchen, wardrobes, false ceiling and full repaint', 'Full home, Kitchens, Wardrobes, Painting'],
  ['Office cabins and storage', 'Woodwork'],
  ['Kids room makeover', 'Wardrobes, Painting'],
  ['Balcony deck and planters', 'Woodwork, Repairs'],
  ['Exterior repaint', 'Painting'],
  ['Damp wall treatment', 'Repairs'],
];
const CHAPTER_SETS = [
  ['before', 'after', 'woodwork', 'painting', 'repairs', 'team', 'quality', 'materials'],
  ['woodwork', 'quality', 'materials', 'team'],
  ['woodwork', 'painting'],
  ['before', 'after', 'painting', 'repairs'],
  ['woodwork', 'pooja room', 'quality'],
  ['photos'],
  ['woodwork', '3D wall panels', 'team', 'materials'],
];
const KINDS = { woodwork: ['wardrobe', 'kitchen', 'tvunit', 'door'], painting: ['paint', 'texture'], repairs: ['fixed', 'damaged'], team: ['team'], quality: ['edge', 'hinge'], materials: ['plywood', 'laminate', 'hardware', 'cans'], 'pooja room': ['door'], '3D wall panels': ['texture'], photos: ['wardrobe', 'paint', 'kitchen'], before: ['damaged'], after: ['paint', 'kitchen'] };
const CAPTIONS = ['master-wardrobe-sliding-doors', 'kitchen-tall-unit', 'tv-unit-with-back-panel', 'main-door-polish', 'loft-storage', 'study-shelf', 'texture-wall', 'accent-wall', 'edge-banding-close-up', 'soft-close-hinge', 'crack-repair', 'damp-wall-fixed', 'carpenter-at-work', 'painter-second-coat', 'bwp-plywood', 'acrylic-laminate'];

/** Builds the whole content folder (projects/ and site/) inside `root`. Returns counts for the report. */
export async function makeRealisticContent(root, { projects = 34, bigPhotos = 12 } = {}) {
  await fs.rm(path.join(root, 'projects'), { recursive: true, force: true });
  await fs.rm(path.join(root, 'site'), { recursive: true, force: true });
  const rnd = random(20261020);
  let photos = 0;
  let big = 0;
  let seed = 1;

  await write(root, 'site/business.txt', `
Business name: Sri Lakshmi Woodworks & Interiors
Tagline: Woodwork, painting and repairs, done right
Phone: +91 90000 00001 / 90000 00002
WhatsApp: 90000 00001
Email: hello@example.com
City: Hyderabad
Areas: ${AREAS.join(', ')}
Hours: Mon to Sat, 9 am to 7 pm. Sunday by appointment.
Map: Plot 12, Road 3, Kondapur, Hyderabad
Years: 15
Homes done: 400+
Warranty: 5-year warranty on woodwork
About: Family-run team of carpenters and painters since 2011. We design, build and finish everything ourselves.
Instagram: @example_woodworks
Facebook: https://www.facebook.com/example
YouTube: https://www.youtube.com/@example
`);
  await write(root, 'site/rates.txt', `
Rates as of: Oct 2026
Wardrobes = 1200 / 1700 per sq ft
Modular kitchen = 1,500 / 2,100 per sq ft
TV unit = 1100 / 1500 per sq ft
Lofts = 650 per sq ft
Main door = 28000 / 45000 per door
Painting (interior) = 18 / 26 per sq ft
Painting (exterior) = 24 per sq ft
Texture wall = 75 / 120 per sq ft
Repairs = Visit ₹500, then quoted
Damp treatment = Quoted after inspection
`);
  await realisticPhoto(path.join(root, 'site', 'logo.png'), { width: 900, height: 300, kind: 'plywood', seed: 999, grain: 4 });
  const materials = ['BWP plywood 18 mm - Boiling water proof', 'Acrylic laminate - High gloss', 'Soft-close hinges - Quiet closing', 'Edge banding - 2 mm machine pressed', 'Handles and profiles - Steel and brass', 'Premium emulsion - Washable', 'Texture paint - Many finishes', 'Waterproofing - Damp walls', 'Quartz counter - Kitchen tops', 'Glass shutters - Toughened', 'Tandem drawers - Full extension', 'Wall putty - Smooth walls'];
  for (const [i, name] of materials.entries()) {
    await realisticPhoto(path.join(root, 'site', 'materials', `${String(i + 1).padStart(2, '0')} ${name}.jpg`), { width: 1400, height: 1050, kind: ['plywood', 'laminate', 'hinge', 'edge', 'hardware', 'cans'][i % 6], seed: seed++, grain: 18, quality: 86 });
    photos++;
  }
  for (const [i, name] of ['Head carpenter - Wardrobes and kitchens', 'Painting lead - Textures and polish', 'Site supervisor - Your single contact', 'Carpenter - Doors and frames', 'Painter - Exteriors', 'Helper - Cleanup and finishing'].entries()) {
    await realisticPhoto(path.join(root, 'site', 'team', `${String(i + 1).padStart(2, '0')} ${name}.jpg`), { width: 1200, height: 1200, kind: 'person', seed: seed++, grain: 18, quality: 86 });
    photos++;
  }

  const folders = [];
  for (let n = 1; n <= projects; n++) folders.push({ folder: `project-${n}`, n });
  folders.push({ folder: 'Kondapur villa', n: 0 }, { folder: 'పూజ గది', n: 0 });
  for (const [index, { folder, n }] of folders.entries()) {
    const [title, types] = TITLES[index % TITLES.length];
    const chapters = CHAPTER_SETS[index % CHAPTER_SETS.length];
    const area = AREAS[index % AREAS.length];
    const priced = index % 5 !== 3;
    const lines = [
      `Title: ${title}`,
      `Area: ${area}`,
      `Size: ${index % 2 ? '3BHK, 1,650 sq ft' : '2BHK'}`,
      `Days: ${8 + (index % 40)}`,
      `Finished: ${['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Oct'][index % 6]} 2026`,
      `Type: ${types}`,
      index % 3 === 0 ? 'About: Wardrobes, kitchen and painting for the whole home, handed over on time with daily cleanup.' : '',
      index % 4 === 0 ? 'Review: Very neat work and the team was always on time. The kitchen is exactly what we wanted.' : '',
      index % 4 === 0 ? 'Review by: Homeowner' : '',
      index === 2 ? 'Video: https://youtu.be/abcdefghijk' : '',
      priced ? '\nPrice:' : '',
      priced ? 'Wardrobes (3) = 1,92,000' : '',
      priced ? 'Modular kitchen = ₹1.45 lakh' : '',
      priced && index % 2 ? 'Painting = 65k' : '',
      priced && index % 3 === 0 ? 'Note: GST extra' : '',
      priced && index % 3 === 0 ? 'Repairs = Rs. 18,000/-' : '',
    ].filter((l) => l !== '');
    await write(root, `projects/${folder}/info.txt`, `${lines.join('\n')}\n`);

    for (const chapter of chapters) {
      if (chapter === 'after') continue;
      const count = chapter === 'before' ? 2 : 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < count; k++) {
        const kindList = KINDS[chapter] || ['wardrobe'];
        const kind = kindList[k % kindList.length];
        const styles = ['caption', 'camera', 'whatsapp', 'caption', 'upper'];
        const style = chapter === 'before' ? 'caption' : styles[(index + k) % styles.length];
        const caption = CAPTIONS[(index * 3 + k) % CAPTIONS.length];
        const name = {
          caption: `${String(k + 1).padStart(2, '0')}-${caption}.jpg`,
          camera: `IMG_2026${String(1000 + index).slice(-2)}${String(10 + k)}_1432${10 + k}.jpg`,
          whatsapp: `WhatsApp Image 2026-10-${String(10 + (k % 18)).padStart(2, '0')} at 14.${10 + k}.${20 + k}.jpeg`,
          upper: `DSC_${String(4000 + index * 10 + k)}.JPG`,
        }[style];
        const makeBig = big < bigPhotos && k === 0 && chapter !== 'before';
        const portrait = makeBig ? big % 2 === 1 : rnd() < 0.3;
        // Upright phone photos are usually stored sideways with flag 6 (or 8); include upside-down (3) and plain (1) too.
        const orientation = makeBig ? (portrait ? (big % 4 === 1 ? 6 : 8) : (big % 4 === 0 ? 1 : 3)) : 1;
        const [w, h] = makeBig ? (portrait ? [3024, 4032] : [4032, 3024]) : portrait ? [1050, 1400] : [1400, 1050];
        // Full-size photos get names the browser tests look for, to check they show the right way up.
        const fileName = makeBig ? `00-upright-${portrait ? 'portrait' : 'landscape'}-check-${big + 1}.jpg` : name;
        await realisticPhoto(path.join(root, 'projects', folder, chapter, fileName), { width: w, height: h, kind, seed: seed++, orientation, gps: makeBig || k === 1, grain: makeBig ? 26 : 18, quality: makeBig ? 92 : 86 });
        if (makeBig) big++;
        photos++;
        if (chapter === 'before') {
          await realisticPhoto(path.join(root, 'projects', folder, 'after', name), { width: 1400, height: 1050, kind: (KINDS.after)[k % 2], seed: seed++, grain: 18, quality: 86 });
          photos++;
        }
      }
    }
    if (index === 1) {
      await realisticPhoto(path.join(root, 'projects', folder, 'woodwork', 'Screenshot_20261012-101010.png'), { width: 1080, height: 2340, kind: 'kitchen', seed: seed++, grain: 6 });
      await realisticPhoto(path.join(root, 'projects', folder, 'woodwork', 'kitchen-handles.webp'), { width: 1600, height: 1200, kind: 'hardware', seed: seed++ });
      await realisticPhoto(path.join(root, 'projects', folder, 'woodwork', 'pantry.jfif'), { width: 1600, height: 1200, kind: 'kitchen', seed: seed++, format: 'jpeg' });
      await realisticPhoto(path.join(root, 'projects', folder, 'woodwork', 'పూజ మందిరం.jpg'), { width: 1400, height: 1050, kind: 'door', seed: seed++ });
      await write(root, `projects/${folder}/woodwork/IMG_4567.HEIC`, 'not a real heic file');
      await write(root, `projects/${folder}/team/VID_20261012.mp4`, 'not a real video');
      photos += 4;
    }
    if (index === 3) {
      await realisticPhoto(path.join(root, 'projects', folder, 'painting', 'panorama-living-room.jpg'), { width: 8000, height: 1800, kind: 'paint', seed: seed++, gps: true });
      await realisticPhoto(path.join(root, 'projects', folder, 'painting', 'tiny.jpg'), { width: 320, height: 240, kind: 'paint', seed: seed++ });
      photos += 2;
    }
  }
  return { projects: folders.length, photos, bigPhotos: big };
}
