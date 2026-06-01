let $websocket, $uuid, $action, $context;

function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inApplicationInfo, inActionInfo) {
  const info = JSON.parse(inActionInfo);
  $uuid = inUUID;
  $action = info.action;
  $context = info.context;
  $websocket = new WebSocket('ws://127.0.0.1:' + inPort);
  $websocket.onopen = () => {
    $websocket.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
    $websocket.send(JSON.stringify({ event: 'getGlobalSettings', context: inUUID }));
    sendPlugin({ type: 'getStatus' });
    setInterval(() => sendPlugin({ type: 'getStatus' }), 2000);
  };
  $websocket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.event === 'didReceiveGlobalSettings') {
      const gs = data.payload.settings || {};
      document.getElementById('local_port').value = gs.local_port || 9223;
      document.getElementById('volume_step_button').value = gs.volume_step_button || 5;
      document.getElementById('volume_step_encoder').value = gs.volume_step_encoder || 2;
      document.getElementById('seek_step_encoder').value = gs.seek_step_encoder || 5;
    }
    if (data.event === 'sendToPropertyInspector') {
      const p = data.payload || {};
      if (p.type === 'status') setStatus(p.connected, p.port);
      if (p.type === 'error') alert(p.message);
    }
  };
}

function sendPlugin(payload) {
  $websocket.send(
    JSON.stringify({
      event: 'sendToPlugin',
      action: $action,
      context: $context,
      payload,
    }),
  );
}

function setStatus(connected, port) {
  const el = document.getElementById('conn_status');
  el.textContent = connected
    ? `Подключено (порт ${port})`
    : `Не подключено (порт ${port})`;
  el.className = 'status ' + (connected ? 'ok' : 'err');
}

document.getElementById('btn_save').onclick = () => {
  sendPlugin({
    type: 'savePort',
    port: document.getElementById('local_port').value,
    volumeStepButton: document.getElementById('volume_step_button').value,
    volumeStepEncoder: document.getElementById('volume_step_encoder').value,
    seekStepEncoder: document.getElementById('seek_step_encoder').value,
  });
};

document.getElementById('btn_launch').onclick = () => {
  document.getElementById('btn_save').click();
  sendPlugin({ type: 'launchSpotify' });
};
