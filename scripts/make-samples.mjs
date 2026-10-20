// `npm run samples` — creates the sample projects, business details and the _template folder.
// Existing files are never overwritten unless you add --force.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSamplePhoto } from './sample-art.mjs';

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
# HOW TO USE THIS TEMPLATE
# 1. Copy this whole "_template" folder and rename the copy with the next number, like "project-5".
# 2. Put photos in the folders below. Leave any folder empty and that part is simply not shown.
#      before / after   photos with the same name in both folders become a before/after slider
#      woodwork, painting, repairs, team, quality, materials
#      You can also make your own folder, like "kitchen" or "pooja room". It becomes its own chapter.
# 3. Photo names become captions: "01-master-wardrobe.jpg" shows as "Master wardrobe".
#    Phone names like IMG_2041.jpg are fine too; they just show no caption.
# 4. Fill in the details below (everything is optional). Lines starting with # are notes.

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

const README = `
HOW TO ADD A NEW PROJECT
========================
1. Copy the folder "_template" and rename the copy to the next number, for example "project-5".
2. Put photos into its folders: woodwork, painting, repairs, team, quality, materials, before, after.
3. Open info.txt in the folder and fill in the title, area, days and price (all optional).
4. See it: double-click PREVIEW.cmd. Put it online: commit and push in GitHub Desktop.

- The highest number shows first on the website, as "Project 5".
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
      before: [['01-living-room-wall', 'damaged'], ['02-bedroom-corner', 'damaged']],
      after: [['01-living-room-wall', 'paint'], ['02-bedroom-corner', 'fixed']],
      painting: [['01-living-room-accent-wall', 'paint'], ['02-texture-wall', 'texture'], ['03-bedroom-colours', 'paint'], ['04-main-door-polish', 'door']],
      repairs: [['01-damp-wall-treated', 'fixed'], ['02-cracks-filled', 'fixed'], ['03-skirting-replaced', 'fixed']],
      team: [['01-painter-on-second-coat', 'team'], ['02-cleanup-before-handover', 'team']],
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
      woodwork: [['01-l-shaped-kitchen', 'kitchen'], ['02-tall-storage-unit', 'wardrobe'], ['03-wall-cabinets', 'kitchen'], ['04-drawer-stack', 'kitchen'], ['05-breakfast-counter', 'tvunit']],
      quality: [['01-soft-close-hinge', 'hinge'], ['02-2-mm-edge-banding', 'edge'], ['03-drawer-handles', 'hardware']],
      materials: [['01 BWP plywood', 'plywood'], ['02 Acrylic laminate', 'laminate'], ['03 Handles and channels', 'hardware']],
      team: [['01-carpenter-fitting-shutters', 'team']],
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
      woodwork: [['01-master-wardrobe-sliding-doors', 'wardrobe'], ['02-kids-room-wardrobe', 'wardrobe'], ['03-loft-storage', 'wardrobe'], ['04-dressing-unit', 'tvunit'], ['05-study-shelf', 'tvunit']],
      quality: [['01-even-shutter-gaps', 'edge'], ['02-handles-aligned', 'hardware']],
      materials: [['01-laminate-shades', 'laminate'], ['02-hinges-and-channels', 'hinge']],
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
      before: [['01-kitchen', 'damaged']],
      after: [['01-kitchen', 'kitchen']],
      woodwork: [['01-master-wardrobe-sliding-doors', 'wardrobe'], ['02-kitchen-tall-unit', 'kitchen'], ['03-tv-unit-with-back-panel', 'tvunit'], ['04-main-door', 'door'], ['05-kids-room-wardrobe', 'wardrobe'], ['06-pooja-unit', 'door']],
      painting: [['01-living-room-texture-wall', 'texture'], ['02-bedroom-accent-wall', 'paint'], ['03-kids-room-colours', 'paint']],
      repairs: [['01-damp-wall-treated', 'fixed'], ['02-loose-shutter-rehung', 'wardrobe']],
      team: [['01-carpenter-fitting-shutters', 'team'], ['02-painter-on-second-coat', 'team']],
      quality: [['01-2-mm-machine-edge-banding', 'edge'], ['02-soft-close-hinge', 'hinge'], ['03-flush-joints', 'edge']],
      materials: [['01 BWP ply 18 mm', 'plywood'], ['02 Acrylic laminate', 'laminate'], ['03 Premium emulsion paint', 'cans']],
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
await writeIfMissing(path.join(root, 'projects', 'README.txt'), text(README));
await writeIfMissing(path.join(root, 'projects', '_template', 'info.txt'), text(TEMPLATE_INFO));
for (const folder of ['before', 'after', 'woodwork', 'painting', 'repairs', 'team', 'quality', 'materials']) {
  await writeIfMissing(path.join(root, 'projects', '_template', folder, '.gitkeep'), text(''));
}

let seed = 1;
for (const project of PROJECTS) {
  const dir = path.join(root, 'projects', project.folder);
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
