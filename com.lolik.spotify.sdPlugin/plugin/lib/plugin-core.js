const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', '..');
const logDir = path.join(pluginRoot, 'log');
fs.mkdirSync(logDir, { recursive: true });

let WebSocket;
try {
  WebSocket = require(path.join(pluginRoot, 'node_modules', 'ws'));
} catch {
  WebSocket = require('ws');
}

function log(level, ...args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(String).join(' ')}\n`;
  fs.appendFileSync(path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`), line);
  if (level === 'ERROR') console.error(...args);
}

/** StreamDock / HotSpot argv: port=[3], uuid=[5], event=[7] */
function parseHostArgs() {
  if (/^\d+$/.test(String(process.argv[3] || ''))) {
    return {
      port: process.argv[3],
      uuid: process.argv[5],
      registerEvent: process.argv[7],
    };
  }
  return {
    port: process.argv[2],
    uuid: process.argv[3],
    registerEvent: process.argv[4],
  };
}

const HOST = parseHostArgs();
log('INFO', 'Host args', JSON.stringify(HOST), 'argv.len', process.argv.length);

class Plugins {
  constructor() {
    if (Plugins.instance) return Plugins.instance;
    const url = `ws://127.0.0.1:${HOST.port}`;
    log('INFO', 'Connecting to', url);
    this.ws = new WebSocket(url);
    this.ws.on('open', () => {
      log('INFO', 'StreamDock WS open');
      this.ws.send(JSON.stringify({ uuid: HOST.uuid, event: HOST.registerEvent }));
      this.getGlobalSettings();
    });
    this.ws.on('error', (e) => log('ERROR', 'WS error', e.message || e));
    this.ws.on('close', () => {
      log('INFO', 'StreamDock WS closed');
      process.exit(0);
    });
    this.ws.on('message', (raw) => this._onMessage(raw));
    this.globalSettings = {};
    this.actionList = {};
    this.activeContexts = new Set();
    Plugins.instance = this;
  }

  _onMessage(raw) {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      log('ERROR', 'Bad JSON', e);
      return;
    }

    if (data.event === 'didReceiveGlobalSettings') {
      this.globalSettings = data.payload?.settings || {};
      this.onGlobalSettings?.(this.globalSettings);
    }

    const actionKey = data.action?.split('.').pop();

    if (data.event === 'willAppear') {
      if (!this.actionList[data.context]) {
        const Cls = this[actionKey];
        if (Cls) {
          const inst = new Cls();
          inst.context = data.context;
          inst.actionName = actionKey;
          inst.plugin = this;
          this.actionList[data.context] = inst;
          log('INFO', 'Action appear', actionKey, data.context);
        } else {
          log('ERROR', 'Unknown action', actionKey);
        }
      }
    }

    if (data.event === 'sendToPlugin' && this.sendToPlugin) {
      this.sendToPlugin(data);
      return;
    }

    const inst = this.actionList[data.context];
    const handler =
      inst?.[`_${data.event}`] ??
      inst?.[data.event] ??
      inst?.[`_${data.event.replace(/New$/, '')}`];

    if (handler) {
      if (data.event === 'keyDown' || data.event === 'keyUp') {
        log('INFO', data.event, actionKey);
      }
      handler.call(inst, data);
    } else if (this[data.event]) {
      this[data.event](data);
    }

    if (data.event === 'willDisappear') {
      delete this.actionList[data.context];
      this.activeContexts.delete(data.context);
    }
  }

  getGlobalSettings() {
    this.ws.send(JSON.stringify({ event: 'getGlobalSettings', context: HOST.uuid }));
  }

  setGlobalSettings(payload) {
    this.globalSettings = payload;
    this.ws.send(
      JSON.stringify({ event: 'setGlobalSettings', context: HOST.uuid, payload }),
    );
  }

  setTitle(context, title, row = 0, num = 8) {
    let out = title || '';
    if (row && out) {
      let newStr = '';
      let nowRow = 1;
      const chars = [...out];
      chars.forEach((ch, i) => {
        if (nowRow < row && i >= nowRow * num) {
          nowRow++;
          newStr += '\n';
        }
        if (nowRow <= row && i < nowRow * num) newStr += ch;
      });
      if (chars.length > row * num) newStr = `${newStr.slice(0, -1)}..`;
      out = newStr;
    }
    this.ws.send(
      JSON.stringify({
        event: 'setTitle',
        context,
        payload: { target: 0, title: out },
      }),
    );
  }

  setImage(context, image) {
    this.ws.send(
      JSON.stringify({
        event: 'setImage',
        context,
        payload: { target: 0, image },
      }),
    );
  }

  setState(context, state) {
    this.ws.send(
      JSON.stringify({ event: 'setState', context, payload: { state } }),
    );
  }

  setSettings(context, payload) {
    this.ws.send(
      JSON.stringify({ event: 'setSettings', context, payload }),
    );
  }

  sendToPropertyInspector(payload) {
    const ctx = Actions.currentContext;
    const act = Actions.currentAction;
    if (!ctx) return;
    this.ws.send(
      JSON.stringify({
        event: 'sendToPropertyInspector',
        context: ctx,
        action: act,
        payload,
      }),
    );
  }

  openUrl(url) {
    this.ws.send(JSON.stringify({ event: 'openUrl', payload: { url } }));
  }

  showAlert(context) {
    this.ws.send(JSON.stringify({ event: 'showAlert', context }));
  }
}

class Actions {
  constructor() {
    this.settings = {};
  }

  static currentAction = null;
  static currentContext = null;

  _willAppear(data) {
    this.settings = data.payload?.settings || {};
    this.context = data.context;
    Plugins.instance.activeContexts.add(data.context);
    this.onAppear?.();
  }

  _willDisappear() {
    Plugins.instance.activeContexts.delete(this.context);
    this.onDisappear?.();
  }

  _didReceiveSettings(data) {
    this.settings = data.payload?.settings || {};
    this.onSettings?.();
  }

  _keyDown() {
    /* StreamDock шлёт keyDown + keyUp — действие только на отпускании */
  }

  _keyUp(data) {
    this.onKey?.(data);
  }

  _dialRotate(data) {
    this.onDialRotate?.(data);
  }

  _propertyInspectorDidAppear(data) {
    Actions.currentAction = data.action;
    Actions.currentContext = data.context;
    this.onInspector?.();
  }
}

module.exports = { Plugins, Actions, log, HOST };
