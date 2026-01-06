// StreamDeck URL Switcher - Background Service Worker
// Connects to StreamDeck plugin via WebSocket

const WS_URL = 'ws://localhost:9334';
const KEEPALIVE_INTERVAL = 25000; // Send ping every 25 seconds

let websocket = null;
let reconnectTimer = null;
let keepAliveTimer = null;

// ============================================================
// Tab Management
// ============================================================

async function getAllTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map(tab => ({
    id: tab.id,
    windowId: tab.windowId,
    url: tab.url || '',
    title: tab.title || '',
    active: tab.active,
    favIconUrl: tab.favIconUrl || ''
  }));
}

function normalizeURL(url) {
  if (!url) return '';
  let normalized = url.toLowerCase();
  normalized = normalized.replace(/^https?:\/\//, '');
  normalized = normalized.replace(/^www\./, '');
  normalized = normalized.replace(/\/$/, '');
  normalized = normalized.replace(/#.*$/, '');
  return normalized;
}

async function findTabByURL(targetURL) {
  const tabs = await getAllTabs();
  const normalizedTarget = normalizeURL(targetURL);
  
  for (const tab of tabs) {
    const normalizedTab = normalizeURL(tab.url);
    
    // Exact match
    if (normalizedTab === normalizedTarget) {
      return tab;
    }
    
    // Partial match (target is prefix of tab URL or vice versa)
    if (normalizedTab.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedTab)) {
      return tab;
    }
  }
  
  return null;
}

async function activateTab(tabId, windowId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function openURL(url) {
  try {
    const tab = await chrome.tabs.create({ url });
    return { success: true, tabId: tab.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function switchToURL(url) {
  const existingTab = await findTabByURL(url);
  
  if (existingTab) {
    const result = await activateTab(existingTab.id, existingTab.windowId);
    return { ...result, action: 'activated', tab: existingTab };
  } else {
    const result = await openURL(url);
    return { ...result, action: 'opened' };
  }
}

// ============================================================
// WebSocket Connection to StreamDeck Plugin
// ============================================================

function connectWebSocket() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    return;
  }

  console.log('Connecting to StreamDeck plugin at', WS_URL);
  
  try {
    websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      console.log('Connected to StreamDeck plugin');
      clearReconnectTimer();
      startKeepAlive();
    };

    websocket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await handlePluginMessage(message);
      } catch (e) {
        console.error('Error handling message:', e);
      }
    };

    websocket.onclose = () => {
      console.log('Disconnected from StreamDeck plugin');
      websocket = null;
      stopKeepAlive();
      scheduleReconnect();
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to connect:', error);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  
  console.log('Will reconnect in 5 seconds...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 5000);
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      sendToPlugin({ action: 'ping' });
      console.log('Keep-alive ping sent');
    }
  }, KEEPALIVE_INTERVAL);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function sendToPlugin(message) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(message));
  }
}

async function handlePluginMessage(message) {
  console.log('Received from plugin:', message);
  
  let response = { id: message.id };
  
  switch (message.action) {
    case 'getTabs':
      response.tabs = await getAllTabs();
      break;
      
    case 'switchToURL':
      response.result = await switchToURL(message.url);
      break;
      
    case 'activateTab':
      response.result = await activateTab(message.tabId, message.windowId);
      break;
      
    case 'ping':
      response.result = 'pong';
      break;
      
    default:
      response.error = 'Unknown action: ' + message.action;
  }
  
  sendToPlugin(response);
}

// ============================================================
// Extension Message Handling (from popup)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'getTabs':
        sendResponse({ tabs: await getAllTabs() });
        break;
        
      case 'switchToURL':
        sendResponse(await switchToURL(message.url));
        break;
        
      case 'getStatus':
        sendResponse({ 
          pluginConnected: websocket && websocket.readyState === WebSocket.OPEN
        });
        break;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();
  
  return true; // Keep channel open for async response
});

// ============================================================
// Initialize
// ============================================================

// Connect to StreamDeck plugin WebSocket server
connectWebSocket();

console.log('StreamDeck URL Switcher extension loaded');
