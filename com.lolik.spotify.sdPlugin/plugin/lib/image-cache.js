const https = require('https');
const http = require('http');

const cache = new Map();

function fetchDataUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url));

  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, { headers: { 'User-Agent': 'StreamDock-Spotify-Plugin/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchDataUrl(res.headers.location).then(resolve);
          return;
        }
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const mime = (res.headers['content-type'] || 'image/jpeg').split(';')[0];
          const dataUrl = `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
          cache.set(url, dataUrl);
          if (cache.size > 30) {
            const first = cache.keys().next().value;
            cache.delete(first);
          }
          resolve(dataUrl);
        });
      })
      .on('error', () => resolve(null));
  });
}

module.exports = { fetchDataUrl };
