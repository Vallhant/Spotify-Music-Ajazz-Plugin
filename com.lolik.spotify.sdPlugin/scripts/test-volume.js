const { getCDP } = require('../plugin/lib/cdp-controller');

(async () => {
  const cdp = getCDP();
  cdp.setPort(9223);
  cdp.start();
  await new Promise((r) => setTimeout(r, 3000));
  console.log('connected', cdp.isConnected, 'vol', cdp.volume);
  await cdp.volumeDown();
  await new Promise((r) => setTimeout(r, 200));
  console.log('after down', cdp.volume);
  await cdp.volumeDelta(-6);
  await new Promise((r) => setTimeout(r, 200));
  console.log('after delta', cdp.volume);
  cdp.stop();
  process.exit(0);
})();
