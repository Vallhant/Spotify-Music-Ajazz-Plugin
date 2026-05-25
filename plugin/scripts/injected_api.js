(function () {
  'use strict';

  const DOM = {
    SCOPE: [
      '[data-testid="now-playing-bar"]',
      'footer[class*="now-playing-bar"]',
      '#main footer',
      '[data-testid="player-controls"]',
    ],
    Track: {
      TITLE: [
        '[data-testid="context-item-info-title"]',
        'div[data-testid="now-playing-widget"] a[href*="/track/"]',
        'footer a[href*="/track/"]',
      ],
      ARTIST: [
        '[data-testid="context-item-info-artist"]',
        'div[data-testid="now-playing-widget"] a[href*="/artist/"]',
        'footer a[href*="/artist/"]',
      ],
      COVER: [
        '[data-testid="cover-art-image"]',
        'div[data-testid="now-playing-widget"] img',
        'footer img[src*="i.scdn.co"]',
      ],
    },
    Controls: {
      PLAY_PAUSE: [
        'button[data-testid="control-button-playpause"]',
        'button[aria-label="Play"]',
        'button[aria-label="Pause"]',
      ],
      NEXT: [
        'button[data-testid="control-button-skip-forward"]',
        'button[aria-label="Next"]',
      ],
      PREV: [
        'button[data-testid="control-button-skip-back"]',
        'button[aria-label="Previous"]',
      ],
      LIKE: [
        'button[data-testid="add-button"]',
        'button[data-testid="heart-button"]',
      ],
      TIMELINE: [
        'div[data-testid="playback-progressbar"] input[type="range"]',
        '[data-testid="progress-bar"] input[type="range"]',
        'input[data-testid="playback-progressbar"]',
      ],
      TIME_NOW: ['[data-testid="playback-position"]', 'span[data-testid="position"]'],
      TIME_END: ['[data-testid="playback-duration"]', 'span[data-testid="duration"]'],
    },
    Volume: {
      SLIDER: [
        'input[data-testid="volume-bar-slider"]',
        'div[data-testid="volume-bar"] input[type="range"]',
      ],
      MUTE_BTN: [
        'button[data-testid="volume-bar-toggle-mute-button"]',
        'button[aria-label*="Mute"]',
        'button[aria-label*="Unmute"]',
      ],
    },
  };

  const Utils = {
    find(root, selectors) {
      if (!root) return null;
      const list = Array.isArray(selectors) ? selectors : [selectors];
      for (const sel of list) {
        const el = (root || document).querySelector(sel);
        if (el) return el;
      }
      return null;
    },

    findBtn(root, selectors) {
      const el = Utils.find(root, selectors);
      if (!el) return null;
      return el.tagName === 'BUTTON' ? el : el.closest('button');
    },

    toSec(timeStr) {
      if (!timeStr) return 0;
      const p = String(timeStr)
        .trim()
        .split(':')
        .map(Number);
      if (p.length === 2) return p[0] * 60 + p[1];
      if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
      return 0;
    },

    isPlayingLabel(label) {
      const l = (label || '').toLowerCase();
      return l.includes('pause') || l.includes('пауза') || l.includes('pausa');
    },

    isLikedLabel(label) {
      const l = (label || '').toLowerCase();
      if (l.includes('добавить') || l.includes('add to')) return false;
      return (
        l.includes('remove') ||
        l.includes('удал') ||
        l.includes('убрать из') ||
        l.includes('saved') ||
        (l.includes('liked') && !l.includes('add'))
      );
    },

    findLikeButton(root) {
      const scope = root || document;
      const byTest = scope.querySelector('button[data-testid="add-button"]');
      if (byTest) return byTest;
      for (const btn of scope.querySelectorAll('button')) {
        const l = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (
          l.includes('liked songs') ||
          l.includes('любимые треки') ||
          l.includes('любим') ||
          l.includes('save to your library') ||
          l.includes('remove from your library')
        ) {
          return btn;
        }
      }
      return null;
    },

    getProgressSlider(root) {
      const bar = root || document.querySelector('[data-testid="now-playing-bar"]') || document;
      const inputs = [...bar.querySelectorAll('input[type="range"]')];
      for (const inp of inputs) {
        const max = parseFloat(inp.max) || 0;
        if (max > 1.5) return inp;
      }
      return inputs[0] || null;
    },

    getVolumeSlider(root) {
      const scope = root || document;
      const bar = scope.querySelector('[data-testid="volume-bar"]');
      if (bar) {
        const inp = bar.querySelector('input[type="range"]');
        if (inp) return inp;
      }
      const np = scope.querySelector('[data-testid="now-playing-bar"]') || document.querySelector('[data-testid="now-playing-bar"]');
      if (np) {
        const inputs = [...np.querySelectorAll('input[type="range"]')];
        return inputs[inputs.length - 1] || null;
      }
      return null;
    },

    isBtnActive(btn) {
      if (!btn) return false;
      const pressed = btn.getAttribute('aria-pressed') || btn.getAttribute('aria-checked');
      if (pressed !== null) return pressed === 'true';
      return Utils.isLikedLabel(btn.getAttribute('aria-label'));
    },

    toPercent(val) {
      if (val === null || val === undefined) return 0;
      const n = parseFloat(val);
      if (isNaN(n)) return 0;
      if (n >= 0 && n <= 1) return Math.round(n * 100);
      return Math.min(Math.round(n), 100);
    },

    checkMute(btn) {
      if (!btn) return false;
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('unmute') || label.includes('enable sound');
    },
  };

  class SpotifyController {
    constructor() {
      this.cache = {};
      this.observing = false;
      this.lastState = null;
    }

    _findOne(key, root, selectors) {
      if (this.cache[key] && this.cache[key].isConnected) return this.cache[key];
      const el = Utils.find(root || document, selectors);
      if (el) this.cache[key] = el;
      return el;
    }

    _findBtnOne(key, root, selectors) {
      if (this.cache[key] && this.cache[key].isConnected) return this.cache[key];
      const el = Utils.findBtn(root || document, selectors);
      if (el) this.cache[key] = el;
      return el;
    }

    _getPlayer() {
      for (const sel of DOM.SCOPE) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return document.querySelector('footer') || document.body;
    }

    _spicetifyState() {
      try {
        if (typeof Spicetify !== 'undefined' && Spicetify.Player) {
          const d = Spicetify.Player.data || {};
          const item = d.item || d.track || {};
          return {
            title: item.name || item.title,
            artist: (item.artists || []).map((a) => a.name).join(', '),
            cover: item.image || item.album?.images?.[0]?.url,
            playing: !d.isPaused,
            liked: d.isHearted || false,
            progress: Spicetify.Player.getProgress?.() || 0,
            duration: Spicetify.Player.getDuration?.() || 0,
            volume: Spicetify.Player.getVolume?.(),
            muted: Spicetify.Player.getMute?.(),
          };
        }
      } catch (e) {
        /* ignore */
      }
      return null;
    }

    getFullState() {
      try {
        const sp = this._spicetifyState();
        const root = this._getPlayer();
        if (!root && !sp) return { success: false, reason: 'BAR_NOT_FOUND' };

        const titleEl = Utils.find(root, DOM.Track.TITLE);
        const artistEl = Utils.find(root, DOM.Track.ARTIST);
        const likeBtn = Utils.findLikeButton(root) || this._findBtnOne('likeBtn', root, DOM.Controls.LIKE);
        const playBtn = this._findBtnOne('playBtn', root, DOM.Controls.PLAY_PAUSE);

        let cover = Utils.find(root, DOM.Track.COVER)?.src;
        if (!cover) {
          cover = document.querySelector('[data-testid="cover-art-image"]')?.src;
        }
        if (cover) cover = cover.replace(/\d+x\d+/, '300x300');

        const playing = sp
          ? sp.playing
          : Utils.isPlayingLabel(playBtn?.getAttribute('aria-label'));

        const progress = this._getProgressState(root, sp);
        const volume = this._getVolumeState(root, sp);

        return {
          success: true,
          data: {
            track: {
              title: sp?.title || titleEl?.textContent?.trim() || 'Unknown',
              artist: sp?.artist || artistEl?.textContent?.trim() || '',
              cover: sp?.cover || cover || '',
            },
            state: {
              playing: !!playing,
              liked: sp ? sp.liked : Utils.isBtnActive(likeBtn),
            },
            progress,
            volume,
          },
        };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    playPause() {
      try {
        if (typeof Spicetify !== 'undefined' && Spicetify.Player?.togglePlay) {
          const was = !Spicetify.Player.data?.isPaused;
          Spicetify.Player.togglePlay();
          return { success: true, is_playing: !was };
        }
        delete this.cache.playBtn;
        const root = this._getPlayer();
        const btn = this._findBtnOne('playBtn', root, DOM.Controls.PLAY_PAUSE);
        if (!btn) return { success: false, error: 'No play button' };
        const wasPlaying = Utils.isPlayingLabel(btn.getAttribute('aria-label'));
        btn.click();
        return { success: true, is_playing: !wasPlaying };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    next() {
      return this._clickSimple('nextBtn', DOM.Controls.NEXT);
    }

    prev() {
      return this._clickSimple('prevBtn', DOM.Controls.PREV);
    }

    toggleLike() {
      try {
        if (typeof Spicetify !== 'undefined' && Spicetify.Player?.toggleHeart) {
          const was = Spicetify.Player.data?.isHearted;
          Spicetify.Player.toggleHeart();
          return { success: true, new_state: !was };
        }
        delete this.cache.likeBtn;
        const root = this._getPlayer();
        const btn = Utils.findLikeButton(root) || this._findBtnOne('likeBtn', root, DOM.Controls.LIKE);
        if (!btn) return { success: false, error: 'Like button not found' };
        const was = Utils.isBtnActive(btn);
        btn.click();
        return { success: true, new_state: !was };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    changeVolume(action, value) {
      delete this.cache.volSlider;
      const info = this._getVolumeState();
      const current = (info.current || 0) / 100;
      const step = 0.05;
      switch (action) {
        case 'UP': {
          const target = Math.min(1, current + step);
          if (current <= 0.01) {
            for (let i = 0; i < 3; i++) this._wheelVolume(1);
            const st = this._getVolumeState();
            return { success: true, volume: st.current };
          }
          return this._setVolume(target);
        }
        case 'DOWN': {
          const target = Math.max(0, current - step);
          if (current >= 0.99) {
            for (let i = 0; i < 3; i++) this._wheelVolume(-1);
            const st = this._getVolumeState();
            return { success: true, volume: st.current };
          }
          return this._setVolume(target);
        }
        case 'DELTA': {
          const pct = Number(value) || 0;
          if (Math.abs(pct) <= 15) {
            const steps = Math.max(1, Math.round(Math.abs(pct) / 3));
            for (let i = 0; i < steps; i++) this._wheelVolume(pct > 0 ? 1 : -1);
            const st = this._getVolumeState();
            return { success: true, volume: st.current };
          }
          return this._setVolume(current + pct / 100);
        }
        case 'SET':
          return this._setVolume(value / 100);
        case 'MUTE':
          return this._toggleMute();
        default:
          return { success: false, error: 'Unknown action' };
      }
    }

    _getProgressState(root, sp) {
      if (sp && sp.duration) {
        const ratio = sp.duration > 0 ? sp.progress / sp.duration : 0;
        return { now_sec: sp.progress / 1000, total_sec: sp.duration / 1000, ratio };
      }
      const slider = Utils.getProgressSlider(root);
      if (slider) {
        const val = parseFloat(slider.value) || 0;
        const max = parseFloat(slider.max) || 1;
        const ratio = max > 0 ? val / max : 0;
        const isMs = max > 1000;
        return {
          now_sec: isMs ? val / 1000 : val,
          total_sec: isMs ? max / 1000 : max,
          ratio,
        };
      }
      const nowStr = Utils.find(root, DOM.Controls.TIME_NOW)?.textContent || '0:00';
      const endStr = Utils.find(root, DOM.Controls.TIME_END)?.textContent || '0:00';
      const now = Utils.toSec(nowStr);
      const total = Utils.toSec(endStr);
      return { now_sec: now, total_sec: total, ratio: total > 0 ? now / total : 0 };
    }

    _getVolumeState(root, sp) {
      if (sp && sp.volume !== undefined) {
        return { current: Utils.toPercent(sp.volume), is_muted: !!sp.muted };
      }
      const slider = Utils.getVolumeSlider(root || document);
      if (slider) {
        const val = parseFloat(slider.value);
        const max = parseFloat(slider.max) || 1;
        const ratio = max <= 1 ? val : val / max;
        const muteBtn = this._findBtnOne('muteBtn', root, DOM.Volume.MUTE_BTN);
        return { current: Utils.toPercent(ratio), is_muted: Utils.checkMute(muteBtn) };
      }
      return { current: 0, is_muted: false };
    }

    _clickVolumeAt(ratio) {
      const bar = document.querySelector('[data-testid="volume-bar"]');
      if (!bar) return false;
      const rect = bar.getBoundingClientRect();
      const x = rect.left + rect.width * ratio;
      const y = rect.top + rect.height / 2;
      const target = document.elementFromPoint(x, y) || bar;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.dispatchEvent(new MouseEvent('click', opts));
      return true;
    },

    _wheelVolume(direction) {
      const bar = document.querySelector('[data-testid="volume-bar"]');
      if (!bar) return false;
      bar.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: direction > 0 ? 120 : -120,
          bubbles: true,
          cancelable: true,
        }),
      );
      return true;
    },

    _setVolume(val) {
      const clamped = Math.max(0, Math.min(1, Math.round(val * 1000) / 1000));
      try {
        if (typeof Spicetify !== 'undefined' && Spicetify.Player?.setVolume) {
          Spicetify.Player.setVolume(clamped);
          return { success: true, volume: Math.round(clamped * 100) };
        }
      } catch (e) {
        /* ignore */
      }

      const slider = Utils.getVolumeSlider(document);
      const before = slider ? parseFloat(slider.value) : null;

      this._clickVolumeAt(clamped);

      if (slider) {
        const after = parseFloat(slider.value);
        const max = parseFloat(slider.max) || 1;
        const read = max <= 1 ? after : after / max;
        if (before !== null && Math.abs(read - before) < 0.001 && before > clamped + 0.02) {
          this._wheelVolume(-1);
        } else if (before !== null && Math.abs(read - before) < 0.001 && before < clamped - 0.02) {
          this._wheelVolume(1);
        }
        const final = Utils.getVolumeSlider(document);
        const fv = final ? parseFloat(final.value) : clamped;
        const fm = parseFloat(final?.max) || 1;
        const ratio = fm <= 1 ? fv : fv / fm;
        return { success: true, volume: Math.round(ratio * 100) };
      }

      return { success: true, volume: Math.round(clamped * 100) };
    }

    _toggleMute() {
      const btn = this._findBtnOne('muteBtn', document, DOM.Volume.MUTE_BTN);
      if (btn) {
        btn.click();
        return { success: true };
      }
      return { success: false };
    }

    _clickSimple(key, selectors) {
      try {
        if (typeof Spicetify !== 'undefined') {
          if (key === 'nextBtn' && Spicetify.Player?.next) {
            Spicetify.Player.next();
            return { success: true };
          }
          if (key === 'prevBtn' && Spicetify.Player?.back) {
            Spicetify.Player.back();
            return { success: true };
          }
        }
        const root = this._getPlayer();
        const btn = this._findBtnOne(key, root, selectors);
        if (!btn || btn.disabled) return { success: false };
        btn.click();
        return { success: true };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    deepDiff(a, b) {
      if (a === b) return undefined;
      if (typeof a !== typeof b || a === null || b === null) return b;
      if (typeof a !== 'object') return a === b ? undefined : b;
      const diff = {};
      let changed = false;
      for (const key of Object.keys(b)) {
        const d = key in a ? this.deepDiff(a[key], b[key]) : b[key];
        if (d !== undefined) {
          diff[key] = d;
          changed = true;
        }
      }
      return changed ? diff : undefined;
    }

    startObservation() {
      if (this.observing) return;
      this.observing = true;
      this.lastState = null;
      const loop = () => {
        if (!this.observing) return;
        const raw = this.getFullState();
        if (raw?.success) {
          const cur = raw.data;
          if (!this.lastState) {
            this._notify('FULL_STATE', cur);
            this.lastState = cur;
          } else {
            const delta = this.deepDiff(this.lastState, cur);
            if (delta) {
              this.lastState = cur;
              this._notify('DELTA', delta);
            }
          }
        }
        setTimeout(loop, 150);
      };
      loop();
    }

    stopObservation() {
      this.observing = false;
    }

    _notify(type, payload) {
      const msg = JSON.stringify({ type, payload });
      if (window.sdNotify) window.sdNotify(msg);
    }
  }

  const ctrl = new SpotifyController();
  window._SpotifyController = ctrl;
  ctrl.startObservation();
  return true;
})();
