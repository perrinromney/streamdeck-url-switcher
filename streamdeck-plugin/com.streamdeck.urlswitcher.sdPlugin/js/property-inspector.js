// Property Inspector for URL Switcher StreamDeck Plugin

let websocket = null;
let pluginUUID = null;
let actionInfo = null;
let settings = {};
let statusPollInterval = null;

// ============================================================
// StreamDeck Connection
// ============================================================

function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
  pluginUUID = inPropertyInspectorUUID;
  actionInfo = JSON.parse(inActionInfo);
  settings = actionInfo.payload.settings || {};

  // Update UI with current settings
  document.getElementById('url').value = settings.url || '';
  document.getElementById('title').value = settings.title || '';

  // Connect to StreamDeck
  websocket = new WebSocket('ws://127.0.0.1:' + inPort);

  websocket.onopen = function() {
    // Register property inspector
    websocket.send(JSON.stringify({
      event: inRegisterEvent,
      uuid: inPropertyInspectorUUID
    }));

    // Request connection status from plugin
    sendToPlugin({ action: 'checkConnection' });
    
    // Poll for connection status every 2 seconds
    statusPollInterval = setInterval(function() {
      sendToPlugin({ action: 'checkConnection' });
    }, 2000);
  };
  
  websocket.onclose = function() {
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
  };

  websocket.onmessage = function(evt) {
    const message = JSON.parse(evt.data);
    
    if (message.event === 'sendToPropertyInspector') {
      handlePluginMessage(message.payload);
    } else if (message.event === 'didReceiveSettings') {
      settings = message.payload.settings || {};
      document.getElementById('url').value = settings.url || '';
      document.getElementById('title').value = settings.title || '';
    }
  };
}

function handlePluginMessage(payload) {
  if (payload.hasOwnProperty('extensionConnected')) {
    updateConnectionStatus(payload.extensionConnected);
  }
}

function updateConnectionStatus(isConnected) {
  const indicator = document.getElementById('statusIndicator');
  const text = document.getElementById('statusText');
  
  if (isConnected) {
    indicator.className = 'status-indicator connected';
    text.textContent = '✓ Connected to browser extension';
  } else {
    indicator.className = 'status-indicator disconnected';
    text.textContent = '✗ Browser extension not connected';
  }
}

// ============================================================
// Settings Management
// ============================================================

function saveSettings() {
  settings.url = document.getElementById('url').value;
  settings.title = document.getElementById('title').value;

  websocket.send(JSON.stringify({
    event: 'setSettings',
    context: pluginUUID,
    payload: settings
  }));
}

function sendToPlugin(payload) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      event: 'sendToPlugin',
      context: pluginUUID,
      payload: payload
    }));
  }
}

// ============================================================
// Event Listeners
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  // Save settings on input change (with debounce)
  let saveTimer = null;
  
  const inputs = document.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', function() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveSettings, 300);
    });
  });
});
