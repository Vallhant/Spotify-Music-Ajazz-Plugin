const http = require('http');
const WebSocket = require('ws');

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
      const expr = `(() => {
        const bar = document.querySelector('[data-testid="now-playing-bar"]');
        const imgs = bar ? [...bar.querySelectorAll('img')].map(i => i.src?.slice(0,80)) : [];
        const testids = bar ? [...new Set([...bar.querySelectorAll('[data-testid]')].map(e => e.dataset.testid))].slice(0,40) : [];
        const ranges = bar ? [...bar.querySelectorAll('input[type=range]')].map(r => ({testid:r.dataset.testid,val:r.value,max:r.max})) : [];
        const allBtns = bar ? [...bar.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).filter(Boolean) : [];
        const heart = document.querySelector('[data-testid="now-playing-widget"]');
        const heartBtns = heart ? [...heart.querySelectorAll('button')].map(b => ({t:b.dataset.testid,l:b.getAttribute('aria-label')})) : [];
        return { imgs, testids, ranges, barBtns: allBtns, heartBtns };
      })()`;
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log(JSON.stringify(res.result.value, null, 2));
      ws.close();
    });
  });
});
