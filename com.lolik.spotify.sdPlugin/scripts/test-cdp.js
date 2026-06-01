const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const port = 9223;
const js = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'scripts', 'injected_api.js'), 'utf8');

http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', async () => {
    const pages = JSON.parse(body);
    const page = pages.find((p) => (p.url || '').includes('spotify')) || pages[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const cmd = id++;
        pending.set(cmd, { resolve, reject });
        ws.send(JSON.stringify({ id: cmd, method, params }));
        setTimeout(() => reject(new Error('timeout')), 5000);
      });
    ws.on('message', (raw) => {
      const d = JSON.parse(raw);
      if (d.id && pending.has(d.id)) {
        const { resolve, reject } = pending.get(d.id);
        pending.delete(d.id);
        if (d.error) reject(new Error(d.error.message));
        else resolve(d.result);
      }
    });
    ws.on('open', async () => {
      await send('Runtime.enable');
      await send('Runtime.addBinding', { name: 'sdNotify' });
      const ev = await send('Runtime.evaluate', {
        expression: js,
        awaitPromise: true,
        returnByValue: true,
      });
      console.log('inject:', ev?.result?.value);
      const state = await send('Runtime.evaluate', {
        expression: 'window._SpotifyController.getFullState()',
        awaitPromise: true,
        returnByValue: true,
      });
      console.log('state:', JSON.stringify(state?.result?.value, null, 2));
      const pp = await send('Runtime.evaluate', {
        expression: 'window._SpotifyController.playPause()',
        awaitPromise: true,
        returnByValue: true,
      });
      console.log('playPause:', JSON.stringify(pp?.result?.value));
      ws.close();
      process.exit(0);
    });
  });
}).on('error', (e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
