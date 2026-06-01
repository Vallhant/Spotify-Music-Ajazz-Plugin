const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const js = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'scripts', 'injected_api.js'), 'utf8');

http.get('http://127.0.0.1:9223/json/list', (r) => {
  let b = '';
  r.on('data', (c) => (b += c));
  r.on('end', () => {
    const p = JSON.parse(b).find((x) => x.url.includes('spotify'));
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    let id = 1;
    const send = (method, params) =>
      new Promise((resolve, reject) => {
        const cmd = id++;
        const t = setTimeout(() => reject(new Error('timeout')), 8000);
        const onMsg = (raw) => {
          const d = JSON.parse(raw);
          if (d.id === cmd) {
            clearTimeout(t);
            ws.off('message', onMsg);
            d.error ? reject(d.error) : resolve(d.result);
          }
        };
        ws.on('message', onMsg);
        ws.send(JSON.stringify({ id: cmd, method, params }));
      });
    ws.on('open', async () => {
      await send('Runtime.evaluate', { expression: 'delete window._SpotifyController' });
      await send('Runtime.evaluate', { expression: js });
      const like = await send('Runtime.evaluate', {
        expression: 'window._SpotifyController.toggleLike()',
        returnByValue: true,
      });
      console.log('like:', JSON.stringify(like.result.value));
      ws.close();
    });
  });
});
