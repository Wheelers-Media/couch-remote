// The app icons, drawn here so the repo carries no design tooling: a dark rounded square with a
// play mark, written as PNG with node's own zlib. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size);
      const at = row + 1 + x * 4;
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; raw[at + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function art(x, y, size) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const inset = s * 0.09;            // breathing room inside the rounded square
  const radius = s * 0.22;
  // rounded square mask
  const dx = Math.max(inset + radius - x, 0, x - (s - inset - radius));
  const dy = Math.max(inset + radius - y, 0, y - (s - inset - radius));
  const outside = Math.hypot(dx, dy) > radius;
  if (outside) return [0, 0, 0, 0];
  // diagonal background
  const t = (x + y) / (2 * s);
  const r = Math.round(44 - 26 * t);
  const g = Math.round(44 - 26 * t);
  const b = Math.round(58 - 30 * t);
  // play triangle
  const ax = cx - s * 0.1; const ay = cy - s * 0.17; const ah = s * 0.34;
  const rel = (x - ax) / (s * 0.28);
  const insideTriangle = rel >= 0 && rel <= 1
    && y > ay + (ah / 2) * (1 - rel) - 0.5 && y < ay + ah - (ah / 2) * (1 - rel) + 0.5;
  if (insideTriangle) return [245, 245, 247, 255];
  return [r, g, b, 255];
}

for (const size of [192, 512]) {
  writeFileSync(join(out, `icon-${size}.png`), png(size, art));
}
writeFileSync(join(out, 'apple-touch-icon.png'), png(180, art));
console.log('icons written to public/');
