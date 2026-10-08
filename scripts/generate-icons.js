'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="100" fill="#d9d3ff"/>
  <g transform="translate(256, 270) scale(4.2) translate(-44, -44)">
    <line x1="-30" y1="8" x2="120" y2="8" stroke="#17142b" stroke-width="3" stroke-dasharray="6 4"/>
    <rect x="37" y="0" width="14" height="20" rx="3" fill="#ff4f8b" stroke="#17142b" stroke-width="2.5"/>
    <line x1="39" y1="6" x2="49" y2="6" stroke="#17142b" stroke-width="2"/>
    <path d="M 28 14 L 10 24 L 16 38 L 26 33 L 26 78 A 4 4 0 0 0 30 82 L 58 82 A 4 4 0 0 0 62 78 L 62 33 L 72 38 L 78 24 L 60 14 Z"
          fill="#ffd84a" stroke="#17142b" stroke-width="3" stroke-linejoin="round"/>
    <path d="M 31 14 L 40 25 L 44 18 Z" fill="#ffffff" stroke="#17142b" stroke-width="2"/>
    <path d="M 57 14 L 48 25 L 44 18 Z" fill="#ffffff" stroke="#17142b" stroke-width="2"/>
    <line x1="44" y1="26" x2="44" y2="76" stroke="#17142b" stroke-width="2"/>
    <circle cx="44" cy="35" r="2.2" fill="#17142b"/>
    <circle cx="44" cy="48" r="2.2" fill="#17142b"/>
    <circle cx="44" cy="61" r="2.2" fill="#17142b"/>
  </g>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent.trim());

function createPngBuffer(width, height, getPixel) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const checksum = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(checksum, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

function shirtPixel(x, y, width, height) {
  const nx = x / width;
  const ny = y / height;

  let r = 0xd9, g = 0xd3, b = 0xff, a = 255;

  const pad = 0.08;
  if (nx < pad || nx > 1 - pad || ny < pad || ny > 1 - pad) {
    return [0, 0, 0, 0];
  }

  if (Math.abs(ny - 0.28) < 0.015 && nx > 0.15 && nx < 0.85) {
    if (Math.floor(x / 8) % 2 === 0) return [0x17, 0x14, 0x2b, 255];
  }

  if (Math.abs(nx - 0.5) < 0.04 && ny >= 0.22 && ny <= 0.32) {
    if (Math.abs(nx - 0.5) > 0.03 || ny < 0.23 || ny > 0.31) {
      return [0x17, 0x14, 0x2b, 255];
    }
    return [0xff, 0x4f, 0x8b, 255];
  }

  const cx = nx - 0.5;
  const cy = ny - 0.55;

  const inTorso = Math.abs(cx) <= 0.20 && cy >= -0.20 && cy <= 0.28;
  const inSleeves = Math.abs(cx) <= 0.38 && cy >= -0.20 && cy <= -0.05 && (Math.abs(cx) - cy * 0.5) <= 0.42;

  if (inTorso || inSleeves) {
    const isBorder = (Math.abs(cx) >= 0.19 && inTorso && cy > -0.05) ||
                     (cy >= 0.27 && inTorso) ||
                     (inSleeves && Math.abs(cx) >= 0.36) ||
                     (cy <= -0.19);
    if (isBorder) return [0x17, 0x14, 0x2b, 255];

    if (Math.abs(cx) < 0.015 && Math.abs(cy - 0.0) < 0.02) return [0x17, 0x14, 0x2b, 255];
    if (Math.abs(cx) < 0.015 && Math.abs(cy - 0.1) < 0.02) return [0x17, 0x14, 0x2b, 255];
    if (Math.abs(cx) < 0.015 && Math.abs(cy + 0.1) < 0.02) return [0x17, 0x14, 0x2b, 255];

    if (Math.abs(cx) < 0.08 && cy < -0.10) {
      return [0xf4, 0xf4, 0xf1, 255];
    }

    return [0xff, 0xd8, 0x4a, 255];
  }

  return [r, g, b, a];
}

const png192 = createPngBuffer(192, 192, shirtPixel);
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), png192);

const png512 = createPngBuffer(512, 512, shirtPixel);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), png512);
