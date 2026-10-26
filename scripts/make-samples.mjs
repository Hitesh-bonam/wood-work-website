// `npm run samples` — creates the sample projects (images/project-1 to 4, each with before and after
// photos), business details and the images/_template folder.
// Existing files are never overwritten unless you add --force.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSamplePhoto } from './sample-art.mjs';
import { PROJECTS_DIR } from '../src/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
let created = 0;

async function writeIfMissing(file, makeContent) {
  try {
    if (!force) {
      await fs.access(file);
      return;
    }
  } catch {
    // missing: create it below
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await makeContent(file);
  created++;
}

const text = (content) => (file) => fs.writeFile(file, `${content.trim()}\n`, 'utf8');

const BUSINESS = `
# Your business details. Change the text after each colon, then save the file.
# Lines starting with # are notes for you and are not shown on the website.

Business name: Your Woodworks
Tagline: Woodwork, painting and repairs, done right

# Write numbers with the country code (91 is India).
Phone: +91 00000 00000
WhatsApp: 91 00000 00000
Email:

City: Your City
Areas: Green Park, Lake Road, Hill View, River Side
Hours: Mon to Sat, 9 am to 7 pm. Sunday by appointment.
# Paste a Google Maps link, or just write your address.
Map:

# Change these to your real numbers (leave empty to hide them).
Years: 12
Homes done: 180+
Warranty: 5-year warranty on woodwork

About: We are a family-run team of carpenters and painters. We build and finish everything ourselves, so the quality stays the same from the first board to the last coat of paint.

# Optional links (leave empty to hide).
Instagram:
Facebook:
YouTube:
`;

const RATES = `
# Your rate card for the Pricing page.
# One service per line:   Service = standard price / premium price per unit
# Leave out the premium price if you don't offer it.
# For work you price after a visit, write any text, for example:   Repairs = Visit ₹500, then quoted

Rates as of: Oct 2026

Wardrobes = 1200 / 1700 per sq ft
Modular kitchen = 1500 / 2100 per sq ft
TV unit = 1100 / 1500 per sq ft
Painting = 18 / 26 per sq ft
Repairs = Visit ₹500, then quoted
`;

const TEMPLATE_INFO = `
# This file is OPTIONAL. Without it the project still shows, as "Project 5".
# Fill in what you like; leave the rest empty. Lines starting with # are notes for you.
# Photos go in the two folders next to this file:
#   before   the home before you started (empty rooms, old walls)
#   after    the finished work

Title:
Area:
Size:
Days:
Finished:
Type:
About:

Review:
Review by:
Video:

# Price is optional. One item per line, like:   Wardrobe = 85000
# Leave this empty to show no price for this project.
# A line like   Note: GST extra   is shown under the price.
Price:
`;

const HOW_TO = `
HOW TO ADD YOUR PHOTOS
======================

Every project is one folder in here, with two folders inside:

  images
    project-1
      before     <- photos of the home BEFORE the work (empty rooms, old walls)
      after      <- photos of the FINISHED work
    project-2
      before
      after

To add a new project:
  1. Copy the folder "_template" and rename the copy to the next number, like "project-5".
  2. Put photos in its "before" folder and its "after" folder.
  3. That's all. To see it, double-click PREVIEW.cmd. To put it online, double-click PUBLISH.cmd.

Good to know:
  - Photos show on the website in the same order as in the folder (sorted by name). Phone photos
    (IMG_2026...) are already in the order you took them. To choose the order yourself, start the
    names with 1, 2, 3, like "1 kitchen.jpg", "2 hall.jpg".
  - A name like "master-wardrobe.jpg" is shown under the photo as "Master wardrobe".
  - The highest number shows first on the website: project-5 comes before project-1.
  - info.txt (optional) is for the title, area and price of the project.
  - Optional: give a before photo and an after photo the same name (kitchen.jpg in both folders) and
    the website shows them as a slider you can drag to compare.
  - Folders whose names start with _ are ignored.
  - project-1 to project-4 are SAMPLES with drawn pictures. Delete them once your real projects are in.
`;

const PROJECTS = [
  {
    folder: 'project-1',
    info: `
Title: Repaint and repairs
Area: Hill View
Size: 2BHK, 1,100 sq ft
Days: 9
Finished: Jul 2026
Type: Painting, Repairs
About: Damp walls treated, cracks filled and the whole home repainted in two coats.
Sample: yes

Price:
Wall repairs and putty = 18000
Painting, 2 coats = 39000
Door polish = 8000
`,
    photos: {
      before: [['01-living-room-wall', 'damaged'], ['02-bedroom-corner', 'damaged'], ['03-old-main-door', 'damaged']],
      after: [['01-living-room-wall', 'paint'], ['02-texture-wall', 'texture'], ['03-bedroom-colours', 'paint'], ['04-main-door-polish', 'door'], ['05-damp-wall-treated', 'fixed']],
    },
  },
  {
    folder: 'project-2',
    info: `
Title: Modular kitchen
Area: Lake Road
Size: L-shape, 11 ft
Days: 18
Finished: Aug 2026
Type: Kitchens
About: An L-shaped kitchen with soft-close drawers, tall storage and a stone counter.
Sample: yes

Price:
Base and wall units = 122000
Soft-close hardware = 38000
Counter and backsplash = 30000
`,
    photos: {
      before: [['01-empty-kitchen', 'empty'], ['02-kitchen-wall', 'empty']],
      after: [['01-l-shaped-kitchen', 'kitchen'], ['02-tall-storage-unit', 'wardrobe'], ['03-wall-cabinets', 'kitchen'], ['04-drawer-stack', 'kitchen'], ['05-soft-close-hinge', 'hinge']],
    },
  },
  {
    folder: 'project-3',
    info: `
Title: Bedroom wardrobes
Area: River Side
Size: 2 rooms, 9 ft each
Days: 12
Finished: Aug 2026
Type: Wardrobes
About: Floor-to-ceiling wardrobes with lofts for two bedrooms.
Sample: yes

Price:
Master bedroom wardrobe = 82000
Kids room wardrobe = 64000
Lofts above both = 22000
`,
    photos: {
      before: [['01-empty-master-bedroom', 'empty'], ['02-empty-kids-room', 'empty']],
      after: [['01-master-wardrobe-sliding-doors', 'wardrobe'], ['02-kids-room-wardrobe', 'wardrobe'], ['03-loft-storage', 'wardrobe'], ['04-dressing-unit', 'tvunit'], ['05-even-shutter-gaps', 'edge']],
    },
  },
  {
    folder: 'project-4',
    info: `
Title: 3BHK full interior
Area: Green Park
Size: 3BHK, 1,850 sq ft
Days: 42
Finished: Sep 2026
Type: Full home, Wardrobes, Kitchens, Painting
About: Wardrobes, kitchen, TV unit, doors, painting and repairs for the whole home, handed over in six weeks.
Review: Neat work, finished on time, and the team cleaned up every day. The kitchen is exactly what we wanted.
Review by: Homeowner, Green Park
Sample: yes

Price:
Wardrobes (3) = 1,92,000
Modular kitchen = 1,45,000
TV unit and doors = 78,000
Painting, full home = 65,000
`,
    photos: {
      before: [['01-empty-living-room', 'empty'], ['02-empty-kitchen', 'empty'], ['03-empty-bedroom', 'empty']],
      after: [['01-living-room-tv-unit', 'tvunit'], ['02-modular-kitchen', 'kitchen'], ['03-master-wardrobe', 'wardrobe'], ['04-main-door', 'door'], ['05-living-room-texture-wall', 'texture'], ['06-kids-room-wardrobe', 'wardrobe']],
    },
  },
];

const MATERIALS = [
  ['01 BWP plywood 18 mm - Boiling water proof, for kitchens and bathrooms', 'plywood'],
  ['02 Acrylic laminate - High gloss and scratch resistant', 'laminate'],
  ['03 Soft-close hinges - Quiet, slow closing doors', 'hinge'],
  ['04 Edge banding - 2 mm, machine pressed', 'edge'],
  ['05 Handles and profiles - Steel, brass and aluminium', 'hardware'],
  ['06 Premium emulsion - Washable and low smell', 'cans'],
];

const TEAM = [
  ['01 Head carpenter - Wardrobes, kitchens and doors', 'person'],
  ['02 Painting lead - Textures, polish and colours', 'person'],
  ['03 Site supervisor - Your single point of contact', 'person'],
];

await writeIfMissing(path.join(root, 'site', 'business.txt'), text(BUSINESS));
await writeIfMissing(path.join(root, 'site', 'rates.txt'), text(RATES));
await writeIfMissing(path.join(root, PROJECTS_DIR, 'HOW TO ADD PHOTOS.txt'), text(HOW_TO));
await writeIfMissing(path.join(root, PROJECTS_DIR, '_template', 'info.txt'), text(TEMPLATE_INFO));
for (const folder of ['before', 'after']) {
  await writeIfMissing(path.join(root, PROJECTS_DIR, '_template', folder, '.gitkeep'), text(''));
}

let seed = 1;
for (const project of PROJECTS) {
  const dir = path.join(root, PROJECTS_DIR, project.folder);
  await writeIfMissing(path.join(dir, 'info.txt'), text(project.info));
  for (const [chapter, photos] of Object.entries(project.photos)) {
    for (const [name, kind] of photos) {
      const s = seed++;
      await writeIfMissing(path.join(dir, chapter, `${name}.jpg`), (file) => writeSamplePhoto(file, kind, { seed: s }));
    }
  }
}
for (const [name, kind] of MATERIALS) {
  const s = seed++;
  await writeIfMissing(path.join(root, 'site', 'materials', `${name}.jpg`), (file) => writeSamplePhoto(file, kind, { seed: s }));
}
for (const [name, kind] of TEAM) {
  const s = seed++;
  await writeIfMissing(path.join(root, 'site', 'team', `${name}.jpg`), (file) => writeSamplePhoto(file, kind, { seed: s, width: 1200, height: 1200 }));
}

console.log(created ? `Created ${created} sample files.` : 'Sample files already exist (use --force to recreate them).');
