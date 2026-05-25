const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { log } = require('./plugin-core');

const JS_CONTROLLER = 'window._SpotifyController';

class CDPController {
  constructor() {
    this.port = 9223;
    this.isConnected = false;
    this.running = false;
    this.cdpWs = null;
    this._cmdId = 1;
    this._pending = new Map();
    this._reader = null;
    this._monitor = null;
    this._observers = new Set();
    this._jsPayload = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'injected_api.js'),
      'utf8',
    );
    this.state = {
      track: { title: '', artist: '', cover: '' },
      playback: { is_playing: false, current_sec: 0, total_sec: 0, ratio: 0 },
      volume: { current: 0, is_muted: false },
      like: { is_liked: false },
    };
  }

  setPort(port) {
    this.port = port || 9223;
  }

  onUpdate(fn) {
    this._observers.add(fn);
    return () => this._observers.delete(fn);
  }

  _emit() {
    for (const fn of this._observers) fn(this.state);
  }

  _setConnected(v) {
    if (this.isConnected !== v) {
      this.isConnected = v;
      log('INFO', `Spotify CDP: ${v ? 'connected' : 'disconnected'}`);
      this._emit();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._monitor = setInterval(() => this._tick(), 2000);
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._monitor) clearInterval(this._monitor);
    this._closeWs();
  }

  async _tick() {
    if (!this.running) return;
    try {
      if (!this.cdpWs || this.cdpWs.readyState !== WebSocket.OPEN) {
        const ok = await this._connect();
        if (ok) await this._setup();
      } else {
        await this._ensureInjection();
      }
    } catch (e) {
      this._setConnected(false);
    }
  }

  async _connect() {
    const wsUrl = await this._findWsUrl();
    if (!wsUrl) {
      this._setConnected(false);
      return false;
    }
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(wsUrl);
        const t = setTimeout(() => {
          ws.terminate();
          resolve(false);
        }, 5000);
        ws.on('open', () => {
          clearTimeout(t);
          this.cdpWs = ws;
          this._reader = (msg) => this._onMessage(msg);
          ws.on('message', this._reader);
          ws.on('close', () => this._setConnected(false));
          ws.on('error', () => this._setConnected(false));
          this._setConnected(true);
          resolve(true);
        });
        ws.on('error', () => {
          clearTimeout(t);
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  _closeWs() {
    if (this.cdpWs) {
      try {
        this.cdpWs.close();
      } catch {
        /* ignore */
      }
      this.cdpWs = null;
    }
    this._setConnected(false);
  }

  _onMessage(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.id && this._pending.has(data.id)) {
      const { resolve, reject } = this._pending.get(data.id);
      this._pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result || {});
      return;
    }
    if (data.method === 'Runtime.bindingCalled' && data.params?.name === 'sdNotify') {
      try {
        const payload = JSON.parse(data.params.payload || '{}');
        this._handleNotify(payload);
      } catch (e) {
        log('ERROR', 'notify parse', e);
      }
    }
  }

  _handleNotify({ type, payload }) {
    if (type === 'FULL_STATE') this._applyFull(payload);
    else if (type === 'DELTA') this._applyDelta(payload);
    this._emit();
  }

  _applyFull(p) {
    if (p.track) Object.assign(this.state.track, p.track);
    if (p.state) {
      this.state.playback.is_playing = !!p.state.playing;
      this.state.like.is_liked = !!p.state.liked;
    }
    if (p.progress) Object.assign(this.state.playback, {
      current_sec: p.progress.now_sec || 0,
      total_sec: p.progress.total_sec || 0,
      ratio: p.progress.ratio || 0,
    });
    if (p.volume) Object.assign(this.state.volume, {
      current: p.volume.current || 0,
      is_muted: !!p.volume.is_muted,
    });
  }

  _applyDelta(d) {
    if (d.track) Object.assign(this.state.track, d.track);
    if (d.state) {
      if ('playing' in d.state) this.state.playback.is_playing = d.state.playing;
      if ('liked' in d.state) this.state.like.is_liked = d.state.liked;
    }
    if (d.progress) {
      if ('now_sec' in d.progress) this.state.playback.current_sec = d.progress.now_sec;
      if ('total_sec' in d.progress) this.state.playback.total_sec = d.progress.total_sec;
      if ('ratio' in d.progress) this.state.playback.ratio = d.progress.ratio;
    }
    if (d.volume) {
      if ('current' in d.volume) this.state.volume.current = d.volume.current;
      if ('is_muted' in d.volume) this.state.volume.is_muted = d.volume.is_muted;
    }
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.cdpWs || this.cdpWs.readyState !== WebSocket.OPEN) {
        reject(new Error('No CDP connection'));
        return;
      }
      const id = this._cmdId++;
      this._pending.set(id, { resolve, reject });
      this.cdpWs.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error('CDP timeout'));
        }
      }, 8000);
    });
  }

  async executeScript(expression) {
    const res = await this._send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return res?.result?.value;
  }

  async _ensureInjection(force = false) {
    if (force) {
      await this.executeScript(`try{${JS_CONTROLLER}.stopObservation()}catch(e){} delete window._SpotifyController`);
    }
    const ok = await this.executeScript(`!!(${JS_CONTROLLER})`);
    if (!ok || force) {
      log('INFO', 'Injecting Spotify API...');
      await this.executeScript(this._jsPayload);
    }
  }

  async _setup() {
    await this._send('Runtime.enable', {});
    await this._send('Runtime.addBinding', { name: 'sdNotify' });
    await this._ensureInjection(true);
    await this.executeScript(`${JS_CONTROLLER}.startObservation()`);
    const raw = await this.executeScript(`${JS_CONTROLLER}.getFullState()`);
    if (raw?.success) this._applyFull(raw.data);
    this._emit();
  }

  _findWsUrl() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/json/list`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const pages = JSON.parse(body);
            for (const p of pages) {
              const url = p.url || '';
              const title = p.title || '';
              if (
                url.includes('spotify.com') ||
                url.includes('xpui') ||
                title.toLowerCase().includes('spotify')
              ) {
                resolve(p.webSocketDebuggerUrl);
                return;
              }
            }
            resolve(pages[0]?.webSocketDebuggerUrl || null);
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  async _cmd(method, ...args) {
    if (!this.isConnected) throw new Error('Spotify не подключён');
    await this._ensureInjection();
    const argStr = args.map((a) => (typeof a === 'string' ? `'${a}'` : String(a))).join(', ');
    return this.executeScript(`${JS_CONTROLLER}.${method}(${argStr})`);
  }

  async _mouseClick(x, y) {
    await this._send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await this._send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
  }

  /** Изменить громкость кликом по полоске (надёжнее, чем JS-слайдер на 100%) */
  async _adjustVolumePercent(deltaPercent) {
    if (!this.isConnected) throw new Error('Spotify не подключён');
    const pos = await this.executeScript(`
      (() => {
        const bar = document.querySelector('[data-testid="volume-bar"]');
        if (!bar) return null;
        const slider = bar.querySelector('input[type="range"]');
        let cur = 0.5;
        if (slider) {
          const max = parseFloat(slider.max) || 1;
          const val = parseFloat(slider.value) || 0;
          cur = max <= 1 ? val : val / max;
        }
        const next = Math.max(0, Math.min(1, cur + (${deltaPercent} / 100)));
        const r = bar.getBoundingClientRect();
        return { x: r.left + r.width * next, y: r.top + r.height / 2 };
      })()
    `);
    if (!pos) return null;
    await this._mouseClick(pos.x, pos.y);
    await new Promise((r) => setTimeout(r, 80));
    const raw = await this.executeScript(`${JS_CONTROLLER}.getFullState()`);
    if (raw?.success && raw.data?.volume) {
      this.state.volume.current = raw.data.volume.current;
      this.state.volume.is_muted = raw.data.volume.is_muted;
      this._emit();
      return raw.data.volume.current;
    }
    return null;
  }

  get isPlaying() {
    return this.state.playback.is_playing;
  }
  get track() {
    return this.state.track;
  }
  get volume() {
    return this.state.volume.current;
  }
  get isMuted() {
    return this.state.volume.is_muted;
  }
  get isLiked() {
    return this.state.like.is_liked;
  }

  playPause() {
    return this._cmd('playPause');
  }
  next() {
    return this._cmd('next');
  }
  previous() {
    return this._cmd('prev');
  }
  toggleLike() {
    return this._cmd('toggleLike');
  }
  async volumeUp() {
    await this._adjustVolumePercent(5);
  }
  async volumeDown() {
    await this._adjustVolumePercent(-5);
  }
  async volumeDelta(percent) {
    const step = Math.max(-20, Math.min(20, Number(percent) || 0));
    await this._adjustVolumePercent(step);
  }
  toggleMute() {
    return this._cmd('changeVolume', 'MUTE');
  }

  formatTime(sec) {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }
}

let instance = null;
function getCDP() {
  if (!instance) instance = new CDPController();
  return instance;
}

module.exports = { getCDP, CDPController };
