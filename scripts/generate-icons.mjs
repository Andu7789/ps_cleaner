// One-off icon generator for the PWA manifest — hand-rolls raw PNG bytes via
// Node's built-in zlib so this doesn't need `sharp` (deliberately stubbed
// out for the Cloudflare build, see DECISIONS.md #13) or any other native
// image dependency just to produce a few solid-color app icons.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
mkdirSync(publicDir, { recursive: true });

const BRAND = [0x0f, 0x76, 0x6e]; // #0f766e
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Icon design: a rounded-square brand-teal background with a white
// droplet — simple enough to draw with pixel math, no font/vector library
// needed, and reads clearly at every size down to a 32px favicon.
function pixelColor(x, y, size) {
  const r = size * 0.18; // corner radius for the rounded-square background
  const inCorner =
    (x < r && y < r && Math.hypot(r - x, r - y) > r) ||
    (x > size - r && y < r && Math.hypot(x - (size - r), r - y) > r) ||
    (x < r && y > size - r && Math.hypot(r - x, y - (size - r)) > r) ||
    (x > size - r && y > size - r && Math.hypot(x - (size - r), y - (size - r)) > r);
  if (inCorner) return null; // transparent-ish corner — flatten to background below

  const cx = size / 2;
  const cy = size * 0.56;
  const dropRadius = size * 0.26;
  const dx = x - cx;
  const dy = y - cy;
  // A droplet = a circle with a pointed top, approximated as a circle plus
  // a triangular "tip" above it.
  const inCircle = Math.hypot(dx, dy) <= dropRadius;
  const tipTop = size * 0.16;
  const tipBottom = cy;
  const inTip =
    y >= tipTop &&
    y <= tipBottom &&
    Math.abs(dx) <= dropRadius * ((y - tipTop) / (tipBottom - tipTop));
  return inCircle || inTip ? WHITE : BRAND;
}

function makeIcon(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const color = pixelColor(x, y, size) ?? BRAND;
      raw[offset++] = color[0];
      raw[offset++] = color[1];
      raw[offset++] = color[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [32, 180, 192, 512]) {
  writeFileSync(path.join(publicDir, `icon-${size}.png`), makeIcon(size));
}
console.log("Generated icons in public/");
