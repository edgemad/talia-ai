#!/usr/bin/env node
// Generates src-tauri/icons/* from a tiny procedural drawing of Talia's
// cozy blob mascot — pure Node (zlib + manual PNG/ICO encoding), no deps.
//
//   node scripts/gen-icons.mjs
//
// Outputs: 32x32.png, 128x128.png, 128x128@2x.png, icon.icns (macOS via
// iconutil), icon.ico (multi-size), plus the full .iconset used for icns.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
mkdirSync(iconsDir, { recursive: true });

// --- PNG encoding -----------------------------------------------------------
let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- Drawing ----------------------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function lerp(a, b, t) {
  return a + (b - a) * t;
}
// superellipse "blob" body
function bodyAlpha(u, v) {
  const nx = (u - 0.5) / 0.36;
  const ny = (v - 0.56) / 0.335;
  const s = Math.abs(nx) ** 4 + Math.abs(ny) ** 4;
  return clamp01((1 - s) * 8);
}
function circleAlpha(u, v, cx, cy, r, softness = 60) {
  const d = Math.hypot(u - cx, v - cy);
  return clamp01((r - d) * softness);
}
function shade(u, v) {
  // returns [r, g, b, a] with source-over composition back-to-front
  let out = [0, 0, 0, 0];
  const over = (color) => {
    const [r, g, b, a] = color;
    const na = a + out[3] * (1 - a);
    if (na <= 0) return;
    out = [
      (r * a + out[0] * out[3] * (1 - a)) / na,
      (g * a + out[1] * out[3] * (1 - a)) / na,
      (b * a + out[2] * out[3] * (1 - a)) / na,
      na,
    ];
  };

  // body with pastel gradient (top #FBCFE8 → bottom #F472B6)
  const t = clamp01((v - 0.22) / 0.68);
  const bodyA = bodyAlpha(u, v);
  if (bodyA > 0) {
    over([
      lerp(251, 244, t),
      lerp(207, 114, t),
      lerp(232, 182, t),
      bodyA,
    ]);
  }

  // blush cheeks (translucent)
  for (const [bx] of [[0.315], [0.685]]) {
    const dx = (u - bx) / 0.052;
    const dy = (v - 0.565) / 0.03;
    const s = dx * dx + dy * dy;
    const a = clamp01((1 - s) * 3) * 0.55;
    if (a > 0) over([244, 114, 182, a]);
  }

  // eyes (dark plum) + sparkles
  const plum = [59, 46, 63];
  for (const ex of [0.4, 0.6]) {
    const ea = circleAlpha(u, v, ex, 0.47, 0.048);
    if (ea > 0) over([...plum, ea]);
    const sa = circleAlpha(u, v, ex + 0.013, 0.456, 0.016);
    if (sa > 0) over([255, 255, 255, sa]);
  }

  // smile: arc band around (0.5, 0.545), lower half
  const sr = Math.hypot(u - 0.5, v - 0.545);
  const theta = Math.atan2(v - 0.545, u - 0.5); // y-down: 0..π is below center
  if (theta > 0.35 && theta < Math.PI - 0.35) {
    const a = clamp01((0.011 - Math.abs(sr - 0.062)) * 60);
    if (a > 0) over([...plum, a]);
  }

  return out;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const subs = [0.25, 0.75];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const sy of subs) {
        for (const sx of subs) {
          const [pr, pg, pb, pa] = shade((x + sx) / size, (y + sy) / size);
          r += pr * pa;
          g += pg * pa;
          b += pb * pa;
          a += pa;
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
        rgba[i + 3] = Math.round((a / 4) * 255);
      }
    }
  }
  return rgba;
}

function png(size) {
  return encodePNG(size, size, render(size));
}

// --- Outputs ----------------------------------------------------------------
const targets = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = new Map();
for (const size of targets) pngs.set(size, png(size));

writeFileSync(join(iconsDir, "32x32.png"), pngs.get(32));
writeFileSync(join(iconsDir, "128x128.png"), pngs.get(128));
writeFileSync(join(iconsDir, "128x128@2x.png"), pngs.get(256));
console.log("🌸 wrote 32x32.png, 128x128.png, 128x128@2x.png");

// macOS .icns via iconutil
if (process.platform === "darwin") {
  const setDir = join(iconsDir, "icon.iconset");
  mkdirSync(setDir, { recursive: true });
  const entries = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of entries) writeFileSync(join(setDir, name), pngs.get(size));
  const res = spawnSync(
    "iconutil",
    ["-c", "icns", setDir, "-o", join(iconsDir, "icon.icns")],
    { stdio: "inherit" },
  );
  rmSync(setDir, { recursive: true, force: true });
  if (res.status === 0) console.log("🌸 wrote icon.icns");
  else console.warn("iconutil failed — icon.icns missing");
}

// Windows .ico with embedded PNG entries
function buildIco(sizes) {
  const images = sizes.map((s) => pngs.get(s));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((img, i) => {
    const size = sizes[i];
    const e = entries.subarray(i * 16, i * 16 + 16);
    e[0] = size >= 256 ? 0 : size; // width (0 = 256)
    e[1] = size >= 256 ? 0 : size; // height
    e[2] = 0; // palette
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(img.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.length;
  });
  return Buffer.concat([header, entries, ...images]);
}
writeFileSync(join(iconsDir, "icon.ico"), buildIco([16, 24, 32, 48, 256]));
console.log("🌸 wrote icon.ico");
