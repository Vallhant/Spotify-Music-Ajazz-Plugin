const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'static', 'img');
fs.mkdirSync(OUT, { recursive: true });

const SIZE = 144;
const GREEN = [30, 215, 96, 255];
const GREEN_DARK = [18, 125, 58, 255];
const BG = [18, 18, 18, 255];
const BG_2 = [25, 20, 20, 255];
const WHITE = [255, 255, 255, 255];
const RED = [232, 20, 41, 255];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, t, data, crc]);
}

function pngFromRgba(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    row[0] = 0;
    rgba.slice(y * w * 4, (y + 1) * w * 4).copy(row, 1);
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPx(rgba, x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (Math.round(y) * SIZE + Math.round(x)) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, x0, y0, x1, y1, color) {
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) setPx(rgba, x, y, color);
  }
}

function fillCircle(rgba, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) setPx(rgba, x, y, color);
    }
  }
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPoly(rgba, pts, color) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
      if (pointInPoly(x, y, pts)) setPx(rgba, x, y, color);
    }
  }
}

function line(rgba, x0, y0, x1, y1, width, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    fillCircle(rgba, x0 + dx * t, y0 + dy * t, width / 2, color);
  }
}

function base() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  fillRect(rgba, 0, 0, SIZE, SIZE, BG);
  fillCircle(rgba, 72, 72, 58, GREEN_DARK);
  fillCircle(rgba, 72, 72, 50, GREEN);
  return rgba;
}

function drawSpotifyWaves(rgba) {
  line(rgba, 40, 58, 104, 68, 7, BG);
  line(rgba, 45, 74, 98, 82, 6, BG);
  line(rgba, 50, 90, 90, 96, 5, BG);
}

const icons = {
  'spotify-green.png': (r) => drawSpotifyWaves(r),
  'play-green.png': (r) => fillPoly(r, [[58, 43], [58, 101], [103, 72]], WHITE),
  'pause-green.png': (r) => {
    fillRect(r, 50, 43, 64, 101, WHITE);
    fillRect(r, 80, 43, 94, 101, WHITE);
  },
  'next-green.png': (r) => {
    fillPoly(r, [[40, 45], [40, 99], [78, 72]], WHITE);
    fillPoly(r, [[72, 45], [72, 99], [110, 72]], WHITE);
    fillRect(r, 110, 45, 118, 99, WHITE);
  },
  'back-green.png': (r) => {
    fillRect(r, 26, 45, 34, 99, WHITE);
    fillPoly(r, [[34, 72], [72, 45], [72, 99]], WHITE);
    fillPoly(r, [[66, 72], [104, 45], [104, 99]], WHITE);
  },
  'like-green.png': (r) => {
    fillCircle(r, 56, 58, 17, WHITE);
    fillCircle(r, 88, 58, 17, WHITE);
    fillPoly(r, [[39, 64], [105, 64], [72, 104]], WHITE);
  },
  'no-like-green.png': (r) => {
    fillCircle(r, 56, 58, 17, WHITE);
    fillCircle(r, 88, 58, 17, WHITE);
    fillPoly(r, [[39, 64], [105, 64], [72, 104]], WHITE);
    line(r, 38, 105, 106, 37, 9, BG);
    line(r, 38, 105, 106, 37, 5, GREEN);
  },
  'dislike-green.png': (r) => {
    fillCircle(r, 56, 86, 17, WHITE);
    fillCircle(r, 88, 86, 17, WHITE);
    fillPoly(r, [[39, 80], [105, 80], [72, 40]], WHITE);
    line(r, 38, 38, 106, 106, 9, RED);
  },
  'mute-on-green.png': (r) => {
    fillPoly(r, [[36, 62], [54, 62], [78, 43], [78, 101], [54, 82], [36, 82]], WHITE);
    line(r, 91, 57, 103, 72, 6, WHITE);
    line(r, 103, 72, 91, 87, 6, WHITE);
  },
  'mute-off-green.png': (r) => {
    fillPoly(r, [[36, 62], [54, 62], [78, 43], [78, 101], [54, 82], [36, 82]], WHITE);
    line(r, 90, 55, 114, 89, 8, RED);
    line(r, 114, 55, 90, 89, 8, RED);
  },
  'album-green.png': (r) => {
    fillCircle(r, 72, 72, 28, WHITE);
    fillCircle(r, 72, 72, 10, GREEN);
    fillCircle(r, 72, 72, 4, BG_2);
  },
  'info-green.png': (r) => {
    fillCircle(r, 72, 47, 7, WHITE);
    fillRect(r, 65, 62, 79, 101, WHITE);
  },
  'progress-green.png': (r) => {
    fillRect(r, 35, 65, 109, 79, WHITE);
    fillRect(r, 35, 65, 78, 79, BG_2);
  },
  'volume-green.png': (r) => {
    fillPoly(r, [[36, 62], [54, 62], [78, 43], [78, 101], [54, 82], [36, 82]], WHITE);
    line(r, 91, 57, 103, 72, 6, WHITE);
    line(r, 103, 72, 91, 87, 6, WHITE);
  },
};

for (const [name, draw] of Object.entries(icons)) {
  const rgba = base();
  draw(rgba);
  fs.writeFileSync(path.join(OUT, name), pngFromRgba(SIZE, SIZE, rgba));
}

fs.writeFileSync(path.join(OUT, 'emptiness.png'), pngFromRgba(SIZE, SIZE, Buffer.alloc(SIZE * SIZE * 4, 0)));
console.log('Spotify green icons OK:', Object.keys(icons).length);
