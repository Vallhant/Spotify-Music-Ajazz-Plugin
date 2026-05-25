const zlib = require('zlib');

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

function setPx(rgba, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function fillRect(rgba, w, h, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) setPx(rgba, w, x, y, r, g, b, a);
  }
}

/** @returns {string} data:image/png;base64,... */
function renderProgressBar(ratio, size = 144) {
  const w = size;
  const h = size;
  const rgba = Buffer.alloc(w * h * 4, 0);
  const r = Math.max(0, Math.min(1, ratio || 0));

  fillRect(rgba, w, h, 0, 0, w, h, 25, 20, 20, 255);

  const margin = 14;
  const barY = h - 28;
  const barH = 8;
  const barW = w - margin * 2;

  fillRect(rgba, w, h, margin, barY, margin + barW, barY + barH, 60, 60, 60, 255);

  const fillW = Math.max(2, Math.round(barW * r));
  fillRect(rgba, w, h, margin, barY, margin + fillW, barY + barH, 30, 215, 96, 255);

  const b64 = pngFromRgba(w, h, rgba).toString('base64');
  return `data:image/png;base64,${b64}`;
}

module.exports = { renderProgressBar };
