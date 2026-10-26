// Draws simple illustrated placeholder "photos" (marked SAMPLE PHOTO) for the demo projects and the tests.
import sharp from 'sharp';

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

const WALLS = ['#ede3d3', '#e6dccb', '#dde3df', '#e9e0d0', '#dadfe5', '#efe6da'];
const WOODS = ['#6f4529', '#8a5a33', '#b88a5a', '#d2ae7e', '#7c5a3c', '#a06d42'];
const LAMINATES = ['#f1ede6', '#8e8c88', '#5e7363', '#d9cdb9', '#3d4a57', '#b9a48a'];
const PAINTS = ['#c96f53', '#5d7f8f', '#8aa37b', '#d9b35b', '#a26b8c', '#4f6d7a', '#e0a96d'];
const SKIN = ['#8d5b3e', '#a86b45', '#6e4430', '#b97b55'];
const SHIRTS = ['#2f5d7c', '#7a3e2e', '#3f6b4a', '#5a4a7a', '#8a6d2f'];

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const shade = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
};

let clipId = 0;
function grain(x, y, w, h, color, rnd, { lines = 12, vertical = true, opacity = 0.35 } = {}) {
  const id = `g${++clipId}`;
  const paths = [];
  for (let i = 0; i < lines; i++) {
    const off = (i + 0.5 + (rnd() - 0.5) * 0.6) / lines;
    const amp = 6 + rnd() * 14;
    if (vertical) {
      const gx = x + w * off;
      paths.push(`<path d="M${gx} ${y} C ${gx + amp} ${y + h * 0.3}, ${gx - amp} ${y + h * 0.6}, ${gx + amp * 0.4} ${y + h}" stroke="${color}" stroke-width="${1.5 + rnd() * 2.5}" fill="none" opacity="${opacity}"/>`);
    } else {
      const gy = y + h * off;
      paths.push(`<path d="M${x} ${gy} C ${x + w * 0.3} ${gy + amp}, ${x + w * 0.6} ${gy - amp}, ${x + w} ${gy + amp * 0.4}" stroke="${color}" stroke-width="${1.5 + rnd() * 2.5}" fill="none" opacity="${opacity}"/>`);
    }
  }
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${id})">${paths.join('')}</g>`;
}

function floor(w, h, top, rnd) {
  const color = pick(rnd, ['#b98b5e', '#a8794d', '#c9a27a', '#9c7a5c']);
  const lines = [];
  for (let x = -40; x < w; x += 140 + rnd() * 60) lines.push(`<line x1="${x}" y1="${top}" x2="${x - 60}" y2="${h}" stroke="${shade(color, -22)}" stroke-width="3"/>`);
  return `<rect x="0" y="${top}" width="${w}" height="${h - top}" fill="${color}"/>${lines.join('')}<rect x="0" y="${top}" width="${w}" height="10" fill="${shade(color, -30)}" opacity=".5"/>`;
}

function doors(x, y, w, h, n, color, rnd, { handles = 'vertical', inset = true } = {}) {
  const gap = 6;
  const dw = (w - gap * (n - 1)) / n;
  let out = '';
  for (let i = 0; i < n; i++) {
    const dx = x + i * (dw + gap);
    out += `<rect x="${dx}" y="${y}" width="${dw}" height="${h}" fill="${color}" rx="3"/>`;
    if (inset) out += `<rect x="${dx + dw * 0.1}" y="${y + h * 0.06}" width="${dw * 0.8}" height="${h * 0.88}" fill="${shade(color, 10)}" rx="2" opacity=".55"/>`;
    if (/^#[0-9a-f]{6}$/i.test(color) && parseInt(color.slice(1, 3), 16) < 200) out += grain(dx, y, dw, h, shade(color, -28), rnd, { lines: 5 });
    const hx = i % 2 === 0 ? dx + dw - 22 : dx + 14;
    if (handles === 'vertical') out += `<rect x="${hx}" y="${y + h * 0.42}" width="8" height="${Math.min(160, h * 0.18)}" rx="4" fill="#2b2622"/>`;
    else out += `<rect x="${dx + dw * 0.3}" y="${y + 18}" width="${dw * 0.4}" height="8" rx="4" fill="#2b2622"/>`;
  }
  return out;
}

const DRAW = {
  wardrobe(w, h, rnd) {
    const wall = pick(rnd, WALLS);
    const wood = rnd() < 0.5 ? pick(rnd, WOODS) : pick(rnd, LAMINATES);
    const n = 3 + Math.floor(rnd() * 2);
    const x = w * 0.13;
    const ww = w * 0.74;
    const top = h * 0.08;
    const bottom = h * 0.84;
    const loftH = (bottom - top) * 0.2;
    return `<rect width="${w}" height="${h}" fill="${wall}"/>${floor(w, h, h * 0.84, rnd)}
<rect x="${x - 12}" y="${top - 12}" width="${ww + 24}" height="${bottom - top + 12}" fill="${shade(wood, -35)}"/>
${doors(x, top, ww, loftH - 6, n, wood, rnd, { handles: 'horizontal', inset: false })}
${doors(x, top + loftH, ww, bottom - top - loftH, n, wood, rnd)}
<rect x="0" y="${bottom}" width="${w}" height="16" fill="#000" opacity=".12"/>`;
  },
  kitchen(w, h, rnd) {
    const wall = pick(rnd, WALLS);
    const cab = rnd() < 0.5 ? pick(rnd, LAMINATES) : pick(rnd, WOODS);
    const tiles = [];
    for (let y = h * 0.37; y < h * 0.6; y += 46) for (let x = 0; x < w; x += 92) tiles.push(`<rect x="${x + ((y / 46) % 2) * 46}" y="${y}" width="88" height="42" fill="${shade(wall, 12)}" stroke="${shade(wall, -18)}" stroke-width="2"/>`);
    return `<rect width="${w}" height="${h}" fill="${wall}"/>${tiles.join('')}
${doors(w * 0.06, h * 0.06, w * 0.88, h * 0.29, 5, cab, rnd, { handles: 'horizontal' })}
<rect x="${w * 0.04}" y="${h * 0.59}" width="${w * 0.92}" height="${h * 0.045}" fill="#3b3a38"/>
${doors(w * 0.06, h * 0.635, w * 0.88, h * 0.25, 5, cab, rnd, { handles: 'horizontal' })}
${floor(w, h, h * 0.885, rnd)}
<rect x="${w * 0.52}" y="${h * 0.5}" width="${w * 0.12}" height="${h * 0.09}" fill="#c0c4c6" rx="6"/><rect x="${w * 0.575}" y="${h * 0.43}" width="10" height="${h * 0.08}" fill="#9aa0a3"/>`;
  },
  tvunit(w, h, rnd) {
    const wall = pick(rnd, WALLS);
    const wood = pick(rnd, WOODS);
    const slats = [];
    for (let x = w * 0.22; x < w * 0.78; x += 34) slats.push(`<rect x="${x}" y="${h * 0.07}" width="26" height="${h * 0.63}" fill="${shade(wood, (Math.round(x) % 3) * 6)}"/>`);
    return `<rect width="${w}" height="${h}" fill="${wall}"/>${slats.join('')}
<rect x="${w * 0.3}" y="${h * 0.18}" width="${w * 0.4}" height="${h * 0.3}" rx="8" fill="#16181a"/><rect x="${w * 0.31}" y="${h * 0.195}" width="${w * 0.38}" height="${h * 0.27}" rx="4" fill="#26313a"/>
${doors(w * 0.16, h * 0.7, w * 0.68, h * 0.14, 3, shade(wood, -15), rnd, { handles: 'horizontal', inset: false })}
${floor(w, h, h * 0.86, rnd)}`;
  },
  door(w, h, rnd) {
    const wall = pick(rnd, WALLS);
    const wood = pick(rnd, WOODS);
    const dx = w * 0.32;
    const dw = w * 0.36;
    const panels = [];
    for (const [px, py] of [[0.12, 0.06], [0.56, 0.06], [0.12, 0.52], [0.56, 0.52]]) panels.push(`<rect x="${dx + dw * px}" y="${h * 0.08 + h * 0.76 * py}" width="${dw * 0.32}" height="${h * 0.76 * 0.4}" rx="6" fill="${shade(wood, 14)}" stroke="${shade(wood, -25)}" stroke-width="5"/>`);
    return `<rect width="${w}" height="${h}" fill="${wall}"/><rect x="${dx - 26}" y="${h * 0.05}" width="${dw + 52}" height="${h * 0.82}" fill="${shade(wall, -40)}"/>
<rect x="${dx}" y="${h * 0.08}" width="${dw}" height="${h * 0.79}" fill="${wood}"/>${grain(dx, h * 0.08, dw, h * 0.79, shade(wood, -30), rnd, { lines: 9 })}${panels.join('')}
<circle cx="${dx + dw * 0.88}" cy="${h * 0.5}" r="14" fill="#c9a24a"/>${floor(w, h, h * 0.87, rnd)}`;
  },
  paint(w, h, rnd) {
    const accent = pick(rnd, PAINTS);
    const light = pick(rnd, WALLS);
    const cx = w * (0.5 + rnd() * 0.15);
    return `<rect width="${w}" height="${h}" fill="${light}"/>
<polygon points="0,${h * 0.06} ${cx},${h * 0.14} ${cx},${h * 0.8} 0,${h * 0.92}" fill="${accent}"/>
<polygon points="${cx},${h * 0.14} ${w},${h * 0.04} ${w},${h * 0.9} ${cx},${h * 0.8}" fill="${light}"/>
<rect x="0" y="0" width="${w}" height="${h * 0.06}" fill="#f7f4ee"/>
<line x1="${cx}" y1="${h * 0.14}" x2="${cx}" y2="${h * 0.8}" stroke="${shade(light, -30)}" stroke-width="3"/>
<rect x="${cx + w * 0.12}" y="${h * 0.24}" width="${w * 0.2}" height="${h * 0.3}" fill="#cfe3ef" stroke="#fff" stroke-width="14"/><line x1="${cx + w * 0.22}" y1="${h * 0.24}" x2="${cx + w * 0.22}" y2="${h * 0.54}" stroke="#fff" stroke-width="10"/>
<rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.34}" height="${h * 0.16}" rx="26" fill="${shade(pick(rnd, SHIRTS), 20)}"/><rect x="${w * 0.06}" y="${h * 0.55}" width="${w * 0.38}" height="${h * 0.1}" rx="22" fill="${shade(pick(rnd, SHIRTS), 35)}"/>
<polygon points="0,${h * 0.92} ${cx},${h * 0.8} ${w},${h * 0.9} ${w},${h} 0,${h}" fill="#b08661"/>`;
  },
  texture(w, h, rnd) {
    const base = pick(rnd, PAINTS);
    const strokes = [];
    for (let i = 0; i < 420; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 20 + rnd() * 60;
      strokes.push(`<path d="M${x} ${y} q ${r / 2} ${-r / 3} ${r} 0" stroke="${shade(base, rnd() < 0.5 ? -26 : 22)}" stroke-width="${4 + rnd() * 8}" fill="none" stroke-linecap="round" opacity=".45"/>`);
    }
    return `<rect width="${w}" height="${h}" fill="${base}"/>${strokes.join('')}<rect x="${w * 0.36}" y="${h * 0.22}" width="${w * 0.28}" height="${h * 0.36}" fill="#f3efe7" stroke="#6b4a2b" stroke-width="16"/>`;
  },
  empty(w, h, rnd) {
    // An empty room before the work: bare walls, a window, a cement floor and a bulb on a wire.
    const wall = pick(rnd, ['#d8d2c6', '#d3cdc2', '#ddd6ca', '#cfc9bd']);
    const floorTop = h * 0.74;
    const winX = w * (0.12 + rnd() * 0.45);
    const winW = w * 0.26;
    const winY = h * 0.2;
    const winH = h * 0.32;
    const bars = [1, 2, 3].map((i) => `<rect x="${winX + (winW * i) / 4 - 3}" y="${winY}" width="6" height="${winH}" fill="#6b6259"/>`).join('');
    const patches = Array.from({ length: 4 }, () => `<ellipse cx="${w * rnd()}" cy="${floorTop * rnd()}" rx="${40 + rnd() * 90}" ry="${20 + rnd() * 50}" fill="#bdb6aa" opacity=".35"/>`).join('');
    const tiles = Array.from({ length: 7 }, (_, i) => `<line x1="${(w * i) / 5}" y1="${floorTop}" x2="${(w * i) / 5 - w * 0.12}" y2="${h}" stroke="#8f8981" stroke-width="3"/>`).join('');
    const bulbX = w * (0.62 + rnd() * 0.25);
    return `<rect width="${w}" height="${h}" fill="${wall}"/>${patches}<rect x="0" y="0" width="${w}" height="${h * 0.05}" fill="${shade(wall, -18)}"/>
<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" fill="#cfe3ee" stroke="#8b8177" stroke-width="12"/>${bars}
<line x1="${bulbX}" y1="0" x2="${bulbX}" y2="${h * 0.22}" stroke="#3b3631" stroke-width="3"/><circle cx="${bulbX}" cy="${h * 0.24}" r="${h * 0.025}" fill="#f6e7b0"/>
<rect x="${w * 0.08}" y="${h * 0.5}" width="${w * 0.05}" height="${h * 0.07}" rx="4" fill="#efece6" stroke="#9c958b" stroke-width="3"/>
<rect x="0" y="${floorTop}" width="${w}" height="${h - floorTop}" fill="#a39d94"/>${tiles}`;
  },
  damaged(w, h, rnd) {
    const wall = '#b9b4ac';
    const cracks = [];
    for (let c = 0; c < 3; c++) {
      let x = w * (0.2 + rnd() * 0.6);
      let y = h * 0.1;
      let d = `M${x} ${y}`;
      while (y < h * 0.85) {
        x += (rnd() - 0.5) * 120;
        y += 40 + rnd() * 70;
        d += ` L${x} ${y}`;
      }
      cracks.push(`<path d="${d}" stroke="#4f4943" stroke-width="${3 + rnd() * 3}" fill="none"/>`);
    }
    return `<defs><radialGradient id="damp"><stop offset="0" stop-color="#6f675d" stop-opacity=".75"/><stop offset="1" stop-color="#6f675d" stop-opacity="0"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="${wall}"/><ellipse cx="${w * 0.3}" cy="${h * 0.72}" rx="${w * 0.28}" ry="${h * 0.3}" fill="url(#damp)"/><ellipse cx="${w * 0.75}" cy="${h * 0.3}" rx="${w * 0.16}" ry="${h * 0.18}" fill="url(#damp)"/>${cracks.join('')}
<rect x="0" y="${h * 0.88}" width="${w}" height="${h * 0.12}" fill="#8f8a83"/>`;
  },
  fixed(w, h, rnd) {
    const wall = pick(rnd, WALLS);
    return `<rect width="${w}" height="${h}" fill="${wall}"/><rect x="0" y="${h * 0.86}" width="${w}" height="${h * 0.02}" fill="#fff"/><rect x="0" y="${h * 0.88}" width="${w}" height="${h * 0.12}" fill="#a98463"/>
<rect x="${w * 0.4}" y="${h * 0.24}" width="${w * 0.2}" height="${h * 0.26}" fill="#f3efe7" stroke="${pick(rnd, WOODS)}" stroke-width="14"/>`;
  },
  team(w, h, rnd) {
    const wall = '#d9cbb6';
    const people = [];
    const count = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < count; i++) {
      const cx = w * (count === 1 ? 0.5 : 0.32 + i * 0.36);
      const skin = pick(rnd, SKIN);
      const shirt = pick(rnd, SHIRTS);
      people.push(`<rect x="${cx - 120}" y="${h * 0.42}" width="240" height="${h * 0.42}" rx="70" fill="${shirt}"/>
<circle cx="${cx}" cy="${h * 0.32}" r="78" fill="${skin}"/><path d="M${cx - 80} ${h * 0.29} q 80 -110 160 0" fill="#2d2420"/>
<rect x="${cx + 60}" y="${h * 0.5}" width="200" height="44" rx="22" fill="${shirt}" transform="rotate(-18 ${cx + 60} ${h * 0.5})"/>
<rect x="${cx + 120}" y="${h * 0.3}" width="40" height="${h * 0.42}" fill="${pick(rnd, WOODS)}" transform="rotate(14 ${cx + 140} ${h * 0.5})"/>`);
    }
    return `<rect width="${w}" height="${h}" fill="${wall}"/><rect x="${w * 0.05}" y="${h * 0.12}" width="${w * 0.22}" height="${h * 0.5}" fill="${pick(rnd, WOODS)}" opacity=".5"/>
${people.join('')}<rect x="0" y="${h * 0.8}" width="${w}" height="${h * 0.2}" fill="#8b6a4a"/><rect x="${w * 0.1}" y="${h * 0.74}" width="${w * 0.8}" height="${h * 0.08}" fill="#6f4a2a"/>`;
  },
  edge(w, h, rnd) {
    const wood = pick(rnd, WOODS);
    const layers = [];
    for (let i = 0; i < 9; i++) layers.push(`<rect x="${w * 0.66}" y="${h * 0.12 + i * h * 0.085}" width="${w * 0.34}" height="${h * 0.085}" fill="${i % 2 ? '#e2c79c' : '#c8a675'}"/>`);
    return `<rect width="${w}" height="${h}" fill="${shade(wood, 25)}"/>${grain(0, 0, w * 0.66, h, shade(wood, -20), rnd, { lines: 16, vertical: false, opacity: 0.5 })}
${layers.join('')}<rect x="${w * 0.64}" y="0" width="${w * 0.03}" height="${h}" fill="${shade(wood, -10)}"/><rect x="0" y="${h * 0.08}" width="${w * 0.66}" height="${h * 0.04}" fill="${shade(wood, -45)}"/>`;
  },
  hinge(w, h, rnd) {
    const wood = pick(rnd, LAMINATES);
    return `<rect width="${w}" height="${h}" fill="${wood}"/><rect x="${w * 0.55}" y="0" width="${w * 0.45}" height="${h}" fill="${shade(wood, -18)}"/>
<rect x="${w * 0.3}" y="${h * 0.38}" width="${w * 0.42}" height="${h * 0.22}" rx="40" fill="#b9bec2" stroke="#7f868b" stroke-width="6"/>
<circle cx="${w * 0.3}" cy="${h * 0.49}" r="${h * 0.16}" fill="#a7adb2" stroke="#7f868b" stroke-width="8"/>
<circle cx="${w * 0.63}" cy="${h * 0.44}" r="16" fill="#6c7378"/><circle cx="${w * 0.63}" cy="${h * 0.54}" r="16" fill="#6c7378"/>`;
  },
  plywood(w, h, rnd) {
    const sheets = [];
    for (let i = 0; i < 10; i++) {
      const y = h * 0.2 + i * h * 0.062;
      sheets.push(`<rect x="${w * 0.12 + (rnd() - 0.5) * 30}" y="${y}" width="${w * 0.76}" height="${h * 0.055}" fill="${i % 2 ? '#d8b98a' : '#c9a674'}" stroke="#9c7a4f" stroke-width="3"/>`);
    }
    return `<rect width="${w}" height="${h}" fill="#e8e1d6"/>${sheets.join('')}<rect x="0" y="${h * 0.84}" width="${w}" height="${h * 0.16}" fill="#9d9488"/>`;
  },
  laminate(w, h, rnd) {
    const swatches = [];
    for (let i = 0; i < 7; i++) swatches.push(`<rect x="${w * 0.42}" y="${h * 0.12}" width="${w * 0.16}" height="${h * 0.62}" rx="14" fill="${pick(rnd, [...WOODS, ...LAMINATES])}" stroke="#fff" stroke-width="6" transform="rotate(${-45 + i * 15} ${w * 0.5} ${h * 0.8})"/>`);
    return `<rect width="${w}" height="${h}" fill="#efe9df"/>${swatches.join('')}<circle cx="${w * 0.5}" cy="${h * 0.8}" r="18" fill="#6f6a63"/>`;
  },
  hardware(w, h, rnd) {
    const items = [];
    for (let i = 0; i < 4; i++) items.push(`<rect x="${w * (0.14 + i * 0.19)}" y="${h * 0.3}" width="${w * 0.1}" height="${h * 0.4}" rx="18" fill="${pick(rnd, ['#2b2622', '#b8bcc0', '#c9a24a', '#7d7f81'])}"/>`);
    return `<rect width="${w}" height="${h}" fill="${pick(rnd, LAMINATES)}"/>${items.join('')}`;
  },
  cans(w, h, rnd) {
    const cans = [];
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.25 + i * 0.25);
      const color = pick(rnd, PAINTS);
      cans.push(`<rect x="${cx - 150}" y="${h * 0.35}" width="300" height="${h * 0.42}" fill="#d9dcde"/><rect x="${cx - 150}" y="${h * 0.45}" width="300" height="${h * 0.2}" fill="${color}"/>
<ellipse cx="${cx}" cy="${h * 0.35}" rx="150" ry="36" fill="#c3c7ca"/><ellipse cx="${cx}" cy="${h * 0.77}" rx="150" ry="36" fill="#b5b9bc"/>`);
    }
    return `<rect width="${w}" height="${h}" fill="#e9e3d8"/>${cans.join('')}`;
  },
  person(w, h, rnd) {
    const skin = pick(rnd, SKIN);
    return `<rect width="${w}" height="${h}" fill="${pick(rnd, ['#d7c4a8', '#c9d3c5', '#cdd5dc', '#e0cdb8'])}"/>
<path d="M${w * 0.18} ${h} C ${w * 0.2} ${h * 0.68}, ${w * 0.8} ${h * 0.68}, ${w * 0.82} ${h}" fill="${pick(rnd, SHIRTS)}"/>
<circle cx="${w * 0.5}" cy="${h * 0.42}" r="${w * 0.17}" fill="${skin}"/><path d="M${w * 0.32} ${h * 0.38} q ${w * 0.18} ${-h * 0.22} ${w * 0.36} 0" fill="#2d2420"/>`;
  },
};

export const SAMPLE_KINDS = Object.keys(DRAW);

export function sampleSvg(kind, { width = 1600, height = 1200, seed = 1, label = 'SAMPLE PHOTO' } = {}) {
  const draw = DRAW[kind] || DRAW.wardrobe;
  const rnd = random(seed * 7919 + kind.length);
  const art = draw(width, height, rnd);
  const tag = label
    ? `<rect x="28" y="${height - 84}" rx="24" width="${label.length * 17 + 52}" height="52" fill="#000" opacity=".55"/><text x="54" y="${height - 49}" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#fff">${label}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${art}${tag}</svg>`;
}

/** Writes a placeholder JPEG. */
export async function writeSamplePhoto(file, kind, options = {}) {
  const svgText = sampleSvg(kind, options);
  await sharp(Buffer.from(svgText)).jpeg({ quality: options.quality ?? 80, mozjpeg: true }).toFile(file);
}
