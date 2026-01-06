// StreamDeck URL Switcher Plugin
// Hosts a WebSocket server that Chrome extension connects to

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const WS_PORT = 9334;
const ACTION_UUID = 'com.streamdeck.urlswitcher.switch';

// Logging to file for debugging
const logFile = path.join(__dirname, 'plugin.log');

// Clear log on startup
fs.writeFileSync(logFile, '');

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  fs.appendFileSync(logFile, line);
  console.log(`[${level}] ${message}`);
}

log('Plugin script loaded');

// ============================================================
// WebSocket Server for Chrome Extension (Singleton)
// ============================================================

class ExtensionServer {
  constructor() {
    this.wss = null;
    this.extensionSocket = null;  // The connected Chrome extension
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.started = false;
    this.onConnectionChange = null;  // Callback for connection status changes
  }

  start() {
    if (this.started) {
      log('WebSocket server already started');
      return;
    }

    try {
      this.wss = new WebSocket.Server({ port: WS_PORT });
      this.started = true;

      this.wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        log(`Chrome extension connected from ${clientIp}`, 'SUCCESS');
        
        // Only keep one extension connection
        if (this.extensionSocket && this.extensionSocket.readyState === WebSocket.OPEN) {
          log('Closing previous extension connection');
          this.extensionSocket.close();
        }
        this.extensionSocket = ws;
        
        // Notify connection change
        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleExtensionMessage(message);
          } catch (e) {
            log('Error parsing extension message: ' + e.message, 'ERROR');
          }
        });

        ws.on('close', (code, reason) => {
          log(`Chrome extension disconnected (code: ${code})`, 'WARN');
          if (this.extensionSocket === ws) {
            this.extensionSocket = null;
            // Notify connection change
            if (this.onConnectionChange) {
              this.onConnectionChange(false);
            }
          }
        });

        ws.on('error', (error) => {
          log('Extension WebSocket error: ' + error.message, 'ERROR');
        });
      });

      this.wss.on('error', (error) => {
        log('WebSocket server error: ' + error.message, 'ERROR');
      });

      log(`WebSocket server listening on port ${WS_PORT}`, 'SUCCESS');
    } catch (error) {
      log('Failed to start WebSocket server: ' + error.message, 'ERROR');
    }
  }

  isConnected() {
    return this.extensionSocket && this.extensionSocket.readyState === WebSocket.OPEN;
  }

  handleExtensionMessage(message) {
    // Handle ping/keep-alive from extension
    if (message.action === 'ping') {
      log('Received keep-alive ping from extension', 'DEBUG');
      this.sendRawToExtension({ action: 'pong' });
      return;
    }
    
    log(`← Extension: ${JSON.stringify(message)}`, 'DEBUG');

    // Find pending request and resolve it
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      const duration = Date.now() - pending.timestamp;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        log(`Request failed: ${message.error}`, 'ERROR');
        pending.reject(new Error(message.error));
      } else {
        log(`Request completed in ${duration}ms`, 'SUCCESS');
        pending.resolve(message);
      }
    }
  }

  // Send raw message without tracking (for pings/pongs)
  sendRawToExtension(message) {
    if (this.isConnected()) {
      this.extensionSocket.send(JSON.stringify(message));
    }
  }

  sendToExtension(action, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('Chrome extension not connected'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { 
        resolve, 
        reject, 
        timestamp: Date.now() 
      });

      const message = { id, action, ...data };
      log(`→ Extension: ${JSON.stringify(message)}`, 'DEBUG');
      this.extensionSocket.send(JSON.stringify(message));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }
}

// Single shared server instance
const extensionServer = new ExtensionServer();

// ============================================================
// StreamDeck Plugin
// ============================================================

class URLSwitcherPlugin {
  constructor() {
    this.websocket = null;          // StreamDeck WebSocket
    this.globalSettings = {};
    this.actionSettings = new Map(); // context -> settings
    this.activeContexts = new Set(); // Track all visible button contexts
  }

  connectToStreamDeck(port, pluginUUID, registerEvent, info) {
    log(`Connecting to StreamDeck on port ${port}`);
    this.pluginUUID = pluginUUID;
    this.info = JSON.parse(info);

    this.websocket = new WebSocket(`ws://127.0.0.1:${port}`);

    this.websocket.on('open', () => {
      // Register with StreamDeck
      this.send({
        event: registerEvent,
        uuid: pluginUUID
      });

      log('Connected to StreamDeck', 'SUCCESS');
      
      // Set up connection change callback
      extensionServer.onConnectionChange = (connected) => {
        this.onExtensionConnectionChange(connected);
      };
      
      // Start the WebSocket server for Chrome extension
      extensionServer.start();
    });

    this.websocket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.handleStreamDeckMessage(message);
    });

    this.websocket.on('close', () => {
      log('StreamDeck connection closed');
    });

    this.websocket.on('error', (error) => {
      log('StreamDeck WebSocket error: ' + error.message, 'ERROR');
    });
  }
  
  // Called when Chrome extension connects/disconnects
  onExtensionConnectionChange(connected) {
    log(`Extension connection changed: ${connected}`, connected ? 'SUCCESS' : 'WARN');
    
    // Update all active buttons with new status
    for (const context of this.activeContexts) {
      this.updateButtonState(context, connected);
    }
  }
  
  // Update a button's visual state based on connection status
  updateButtonState(context, connected) {
    const settings = this.actionSettings.get(context) || {};
    
    if (connected) {
      // Show configured title or URL snippet when connected
      const title = settings.title || this.getURLSnippet(settings.url);
      this.setTitle(context, title);
      this.setState(context, 0);  // Normal state
    } else {
      // Show disconnected indicator
      this.setTitle(context, '⚠️\nNo Browser');
      this.setState(context, 0);
    }
  }
  
  // Extract a short display name from URL
  getURLSnippet(url) {
    if (!url) return '';
    try {
      // Remove protocol
      let display = url.replace(/^https?:\/\//, '');
      // Remove www
      display = display.replace(/^www\./, '');
      // Take just the domain or first part
      display = display.split('/')[0];
      // Truncate if too long
      if (display.length > 12) {
        display = display.substring(0, 10) + '…';
      }
      return display;
    } catch {
      return '';
    }
  }

  send(payload) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(payload));
    }
  }

  handleStreamDeckMessage(message) {
    const { event, action, context, payload } = message;

    switch (event) {
      case 'keyDown':
        this.onKeyDown(context, payload);
        break;

      case 'willAppear':
        this.onWillAppear(context, payload);
        break;

      case 'willDisappear':
        this.onWillDisappear(context);
        break;

      case 'didReceiveSettings':
        this.onDidReceiveSettings(context, payload);
        break;

      case 'didReceiveGlobalSettings':
        this.globalSettings = payload.settings || {};
        break;

      case 'propertyInspectorDidConnect':
        this.onPropertyInspectorConnected(context);
        break;

      case 'sendToPlugin':
        this.onSendToPlugin(context, payload);
        break;
    }
  }

  // ============================================================
  // StreamDeck Event Handlers
  // ============================================================

  onKeyDown(context, payload) {
    const settings = this.actionSettings.get(context) || {};
    const url = settings.url;

    if (!url) {
      log('No URL configured for this button', 'WARN');
      this.showAlert(context);
      return;
    }

    log(`Button pressed - switching to: ${url}`);
    this.switchToURL(url, context);
  }

  async switchToURL(url, context) {
    try {
      const response = await extensionServer.sendToExtension('switchToURL', { url });
      
      if (response.result && response.result.success) {
        log(`Switched to URL: ${url}`, 'SUCCESS');
        this.showOk(context);
      } else {
        log(`Failed to switch: ${response.result?.error || 'Unknown error'}`, 'ERROR');
        this.showAlert(context);
      }
    } catch (error) {
      log('Failed to switch URL: ' + error.message, 'ERROR');
      this.showAlert(context);
    }
  }

  onWillAppear(context, payload) {
    this.actionSettings.set(context, payload.settings || {});
    this.activeContexts.add(context);
    log(`Action appeared: ${context.substring(0, 8)}...`);
    
    // Update button with current connection state
    this.updateButtonState(context, extensionServer.isConnected());
  }

  onWillDisappear(context) {
    this.actionSettings.delete(context);
    this.activeContexts.delete(context);
  }

  onDidReceiveSettings(context, payload) {
    this.actionSettings.set(context, payload.settings || {});
    // Update button display with new settings
    this.updateButtonState(context, extensionServer.isConnected());
  }

  onPropertyInspectorConnected(context) {
    const isConnected = extensionServer.isConnected();
    log(`Property inspector connected, extension status: ${isConnected}`);
    
    this.send({
      event: 'sendToPropertyInspector',
      context: context,
      payload: {
        extensionConnected: isConnected
      }
    });
  }

  onSendToPlugin(context, payload) {
    if (payload.action === 'checkConnection') {
      const isConnected = extensionServer.isConnected();
      
      this.send({
        event: 'sendToPropertyInspector',
        context: context,
        payload: {
          extensionConnected: isConnected
        }
      });
    }
  }

  // ============================================================
  // StreamDeck Helpers
  // ============================================================

  showOk(context) {
    this.send({
      event: 'showOk',
      context: context
    });
  }

  showAlert(context) {
    this.send({
      event: 'showAlert',
      context: context
    });
  }

  setTitle(context, title) {
    this.send({
      event: 'setTitle',
      context: context,
      payload: {
        title: title
      }
    });
  }
  
  setState(context, state) {
    this.send({
      event: 'setState',
      context: context,
      payload: {
        state: state
      }
    });
  }
  
  setImage(context, image) {
    this.send({
      event: 'setImage',
      context: context,
      payload: {
        image: image
      }
    });
  }
}

// ============================================================
// Entry Point
// ============================================================

const plugin = new URLSwitcherPlugin();

// Log all command line arguments for debugging
log('Raw argv: ' + JSON.stringify(process.argv));

// Parse StreamDeck connection arguments
const args = process.argv.slice(2);
log('Parsed args: ' + JSON.stringify(args));

let port, pluginUUID, registerEvent, info;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  log(`Processing arg[${i}]: ${arg}`);
  
  switch (arg) {
    case '-port':
      port = args[++i];
      log(`Found port: ${port}`);
      break;
    case '-pluginUUID':
      pluginUUID = args[++i];
      log(`Found pluginUUID: ${pluginUUID}`);
      break;
    case '-registerEvent':
      registerEvent = args[++i];
      log(`Found registerEvent: ${registerEvent}`);
      break;
    case '-info':
      info = args[++i];
      log(`Found info: ${info ? 'present' : 'missing'}`);
      break;
  }
}

log(`Connection params - port: ${port}, uuid: ${pluginUUID}, event: ${registerEvent}, info: ${!!info}`);

if (port && pluginUUID && registerEvent && info) {
  plugin.connectToStreamDeck(port, pluginUUID, registerEvent, info);
} else {
  log('Missing required StreamDeck connection arguments', 'ERROR');
  log(`  port: ${port || 'MISSING'}`);
  log(`  pluginUUID: ${pluginUUID || 'MISSING'}`);
  log(`  registerEvent: ${registerEvent || 'MISSING'}`);
  log(`  info: ${info ? 'present' : 'MISSING'}`);
  // Don't exit - allow WebSocket server to run anyway for manual testing
  // process.exit(1);
}
