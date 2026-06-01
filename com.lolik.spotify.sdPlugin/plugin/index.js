const path = require('path');
const { spawn } = require('child_process');
const { Plugins, Actions, log } = require('./lib/plugin-core');
const { getCDP } = require('./lib/cdp-controller');
const { fetchDataUrl } = require('./lib/image-cache');
const { renderProgressBar } = require('./lib/progress-image');

const plugin = new Plugins();
const cdp = getCDP();
const IMG = (name) => path.join('static', 'img', `${name}.png`).replace(/\\/g, '/');
const IMG_FILE = (name) => path.join('static', 'img', name).replace(/\\/g, '/');

function refreshAll() {
  for (const inst of Object.values(plugin.actionList)) {
    inst.render?.();
  }
}

cdp.onUpdate(() => refreshAll());

function getPort() {
  return parseInt(plugin.globalSettings?.local_port, 10) || 9223;
}

function clampVolumeStep(value, fallback) {
  const step = parseInt(value, 10);
  if (!Number.isFinite(step)) return fallback;
  return Math.max(1, Math.min(20, step));
}

function getButtonVolumeStep() {
  return clampVolumeStep(plugin.globalSettings?.volume_step_button, 5);
}

function getEncoderVolumeStep() {
  return clampVolumeStep(plugin.globalSettings?.volume_step_encoder, 2);
}

function getSeekStep() {
  return clampVolumeStep(plugin.globalSettings?.seek_step_encoder, 5);
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
    plugin.setImage(inst.context, IMG_FILE('spotify-green.png'));
    return true;
  }
  return false;
}

function renderVolume(inst) {
  const pct = cdp.volume || 0;
  plugin.setTitle(inst.context, `${pct}%`, 2, 7);
  plugin.setImage(inst.context, renderProgressBar(pct / 100));
}

function renderProgress(inst) {
  const playback = cdp.state.playback;
  const ratio = playback.ratio || 0;
  const current = cdp.formatTime(playback.current_sec);
  const total = cdp.formatTime(playback.total_sec);
  plugin.setTitle(inst.context, `${current}\n${total}`, 2, 7);
  plugin.setImage(inst.context, renderProgressBar(ratio));
}

function applySeekTicks(inst, ticks) {
  const t = Number(ticks) || 0;
  if (!t) return;
  const now = Date.now();
  if (inst._lastSeekTick && (now - inst._lastSeekTick < 80)) return;
  inst._lastSeekTick = now;
  const seconds = Math.max(-120, Math.min(120, getSeekStep() * Math.round(t)));
  cdp
    .seekDelta(seconds)
    .then(() => renderProgress(inst))
    .catch((e) => {
      log('ERROR', 'seek', e);
      plugin.showAlert(inst.context);
    });
}

function applyVolumeTicks(inst, ticks) {
  const t = Number(ticks) || 0;
  if (!t) return;
  // Debounce: игнорируем если предыдущий вызов был < 80ms назад
  const now = Date.now();
  if (inst._lastTick && (now - inst._lastTick < 80)) return;
  inst._lastTick = now;
  const step = Math.max(-20, Math.min(20, getEncoderVolumeStep() * Math.round(t)));
  cdp
    .volumeDelta(step)
    .then((result) => {
      if (result !== undefined) renderVolume(inst);
    })
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
    plugin.setImage(this.context, IMG_FILE(playing ? 'pause-green.png' : 'play-green.png'));
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
    plugin.setImage(this.context, IMG_FILE('next-green.png'));
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
    plugin.setImage(this.context, IMG_FILE('back-green.png'));
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
      plugin.setImage(this.context, IMG_FILE('info-green.png'));
      return;
    }
    plugin.setTitle(this.context, `${t.title}\n${t.artist}`, 3, 10);
    if (t.cover) {
      fetchDataUrl(t.cover).then((dataUrl) => {
        if (dataUrl) plugin.setImage(this.context, dataUrl);
        else plugin.setImage(this.context, IMG_FILE('info-green.png'));
      });
    } else {
      plugin.setImage(this.context, IMG_FILE('info-green.png'));
    }
  }
};

plugin.like = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    const saved = cdp.isLiked;
    plugin.setState(this.context, saved ? 1 : 0);
    plugin.setImage(this.context, IMG_FILE(saved ? 'like-green.png' : 'no-like-green.png'));
    plugin.setTitle(this.context, saved ? 'В\nбибл.' : 'Лайк', 2, 7);
  }
  onKey() {
    cdp.toggleLike().then(() => this.render()).catch((e) => {
      log('ERROR', e);
      plugin.showAlert(this.context);
    });
  }
};

plugin.dislike = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    plugin.setImage(this.context, IMG_FILE('dislike-green.png'));
    plugin.setTitle(this.context, 'Диз\nлайк', 2, 7);
  }
  onKey() {
    cdp.dislike().then((result) => {
      if (!result?.success) plugin.showAlert(this.context);
      this.render();
    }).catch((e) => {
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
    cdp.volumeDelta(getButtonVolumeStep()).then(() => renderVolume(this)).catch((e) => {
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
    cdp.volumeDelta(-getButtonVolumeStep()).then(() => renderVolume(this)).catch((e) => {
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
    plugin.setImage(this.context, IMG_FILE(muted ? 'mute-off-green.png' : 'mute-on-green.png'));
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
    renderProgress(this);
  }
  onDialRotate({ payload }) {
    applySeekTicks(this, payload?.ticks ?? 1);
  }
};

plugin.album = class extends LocalAction {
  render() {
    if (needConnection(this)) return;
    const t = cdp.track;
    plugin.setImage(this.context, t.cover ? IMG_FILE('album-green.png') : IMG_FILE('spotify-green.png'));
    plugin.setTitle(this.context, t.album ? `Альбом\n${t.album}` : 'Альбом\n-', 3, 9);
    if (t.cover) {
      fetchDataUrl(t.cover).then((dataUrl) => {
        plugin.setImage(this.context, dataUrl || IMG_FILE('album-green.png'));
      });
    }
  }
};

plugin.sendToPlugin = function (data) {
  const p = data.payload || {};
  if (p.type === 'savePort') {
    plugin.setGlobalSettings({
      ...plugin.globalSettings,
      local_port: parseInt(p.port, 10) || 9223,
      volume_step_button: clampVolumeStep(p.volumeStepButton, 5),
      volume_step_encoder: clampVolumeStep(p.volumeStepEncoder, 2),
      seek_step_encoder: clampVolumeStep(p.seekStepEncoder, 5),
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
