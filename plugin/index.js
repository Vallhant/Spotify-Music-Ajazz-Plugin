const path = require('path');
const { spawn } = require('child_process');
const { Plugins, Actions, log } = require('./lib/plugin-core');
const { getCDP } = require('./lib/cdp-controller');
const { fetchDataUrl } = require('./lib/image-cache');
const { renderProgressBar } = require('./lib/progress-image');

const plugin = new Plugins();
const cdp = getCDP();
const IMG = (name) => path.join('static', 'img', `${name}.png`).replace(/\\/g, '/');

function refreshAll() {
  for (const inst of Object.values(plugin.actionList)) {
    inst.render?.();
  }
}

cdp.onUpdate(() => refreshAll());

function getPort() {
  return parseInt(plugin.globalSettings?.local_port, 10) || 9223;
}

function ensureCDP() {
  cdp.setPort(getPort());
  cdp.start();
  return cdp;
}

plugin.onGlobalSettings = () => {
  cdp.setPort(getPort());
  plugin.sendToPropertyInspector({ type: 'status', connected: cdp.isConnected, port: getPort() });
  if (plugin.activeContexts.size > 0) ensureCDP();
};

function needConnection(inst) {
  ensureCDP();
  if (!cdp.isConnected) {
    plugin.setTitle(inst.context, 'Нет\nсвязи', 2, 7);
    plugin.setImage(inst.context, IMG('spotify'));
    return true;
  }
  return false;
}

function renderVolume(inst) {
  const pct = cdp.volume || 0;
  plugin.setTitle(inst.context, `${pct}%`, 2, 7);
  plugin.setImage(inst.context, renderProgressBar(pct / 100));
}

function applyVolumeTicks(inst, ticks) {
  const t = Number(ticks) || 0;
  if (!t) return;
  const step = 3 * t;
  cdp
    .volumeDelta(step)
    .then(() => renderVolume(inst))
    .catch((e) => {
      log('ERROR', 'volume', e);
      plugin.showAlert(inst.context);
    });
}

class LocalAction extends Actions {
  onAppear() {
    ensureCDP();
    this.render();
  }
  onDisappear() {
    if (plugin.activeContexts.size === 0) cdp.stop();
  }
}

plugin.playpause = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    const playing = cdp.isPlaying;
    plugin.setState(this.context, playing ? 1 : 0);
    plugin.setImage(this.context, IMG('play_pause'));
    plugin.setTitle(this.context, playing ? 'Пауза' : 'Играть', 2, 7);
  }
  onKey() {
    cdp.playPause().then(() => this.render()).catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
};

plugin.next = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    plugin.setImage(this.context, IMG('next'));
    plugin.setTitle(this.context, '');
  }
  onKey() {
    cdp.next().catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
};

plugin.prev = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    plugin.setImage(this.context, IMG('prev'));
    plugin.setTitle(this.context, '');
  }
  onKey() {
    cdp.previous().catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
};

plugin.info = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    const t = cdp.track;
    if (!t.title || t.title === 'Unknown') {
      plugin.setTitle(this.context, 'Spotify', 2, 7);
      plugin.setImage(this.context, IMG('info'));
      return;
    }
    plugin.setTitle(this.context, `${t.title}\n${t.artist}`, 3, 10);
    if (t.cover) {
      fetchDataUrl(t.cover).then((dataUrl) => {
        if (dataUrl) plugin.setImage(this.context, dataUrl);
        else plugin.setImage(this.context, IMG('info'));
      });
    } else {
      plugin.setImage(this.context, IMG('info'));
    }
  }
};

plugin.like = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    const saved = cdp.isLiked;
    plugin.setState(this.context, saved ? 1 : 0);
    plugin.setImage(this.context, IMG('like'));
    plugin.setTitle(this.context, saved ? 'В\nбибл.' : 'Лайк', 2, 7);
  }
  onKey() {
    cdp.toggleLike().then(() => this.render()).catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
};

plugin.volumeup = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    renderVolume(this);
  }
  onKey() {
    cdp.volumeUp().then(() => renderVolume(this)).catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
  onDialRotate({ payload }) {
    applyVolumeTicks(this, payload?.ticks ?? 1);
  }
};

plugin.volumedown = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    renderVolume(this);
  }
  onKey() {
    cdp.volumeDown().then(() => renderVolume(this)).catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
  onDialRotate({ payload }) {
    applyVolumeTicks(this, -(payload?.ticks ?? 1));
  }
};

plugin.volume_display = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    renderVolume(this);
  }
  onDialRotate({ payload }) {
    applyVolumeTicks(this, payload?.ticks ?? 1);
  }
};

plugin.volumecontrol = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    renderVolume(this);
  }
  onDialRotate({ payload }) {
    applyVolumeTicks(this, payload?.ticks ?? 1);
  }
  onKey() {
    cdp.toggleMute().then(() => this.render()).catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
};

plugin.mute = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    const muted = cdp.isMuted || cdp.volume === 0;
    plugin.setState(this.context, muted ? 1 : 0);
    plugin.setImage(this.context, IMG('mute'));
    plugin.setTitle(this.context, muted ? 'Вкл.' : 'Mute', 2, 7);
  }
  onKey() {
    cdp.toggleMute().then(() => this.render()).catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
};

plugin.progress = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    const ratio = cdp.state.playback.ratio || 0;
    plugin.setTitle(this.context, '');
    plugin.setImage(this.context, renderProgressBar(ratio));
  }
};

plugin.sendToPlugin = function (data) {
  const p = data.payload || {};
  if (p.type === 'savePort') {
    plugin.setGlobalSettings({
      ...plugin.globalSettings,
      local_port: parseInt(p.port, 10) || 9223,
    });
    cdp.setPort(getPort());
    plugin.sendToPropertyInspector({ type: 'status', connected: cdp.isConnected, port: getPort() });
  }
  if (p.type === 'launchSpotify') {
    const port = getPort();
    const exe = path.join(process.env.APPDATA || '', 'Spotify', 'Spotify.exe');
    try {
      spawn(exe, [`--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore' }).unref();
      log('INFO', `Launched Spotify with port ${port}`);
    } catch (e) {
      log('ERROR', 'Launch failed', e);
      plugin.sendToPropertyInspector({ type: 'error', message: 'Не удалось запустить Spotify.exe' });
    }
  }
  if (p.type === 'getStatus') {
    plugin.sendToPropertyInspector({
      type: 'status',
      connected: cdp.isConnected,
      port: getPort(),
    });
  }
};

log('INFO', 'Spotify plugin (local CDP) started');
