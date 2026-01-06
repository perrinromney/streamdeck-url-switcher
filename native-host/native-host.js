// Native Messaging Host for StreamDeck URL Switcher
// This runs as a Node.js process and bridges Chrome extension with StreamDeck plugin

const net = require('net');
const path = require('path');

// ============================================================
// Chrome Native Messaging Protocol
// Messages are length-prefixed (4 bytes, little-endian)
// ============================================================

function readNativeMessage(buffer) {
  if (buffer.length < 4) return null;
  
  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null;
  
  const message = buffer.slice(4, 4 + length).toString('utf8');
  return {
    message: JSON.parse(message),
    bytesRead: 4 + length
  };
}

function writeNativeMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.alloc(4 + json.length);
  buffer.writeUInt32LE(json.length, 0);
  buffer.write(json, 4);
  process.stdout.write(buffer);
}

// ============================================================
// WebSocket Server for StreamDeck Plugin
// ============================================================

const WebSocket = require('ws');
const WS_PORT = 9334;

let wss = null;
let wsClients = new Set();
let pendingRequests = new Map();
let requestId = 0;

function startWebSocketServer() {
  try {
    wss = new WebSocket.Server({ port: WS_PORT });
    
    wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      wsClients.add(ws);
      logSuccess(`StreamDeck plugin connected from ${clientIp}`);
      log(`Active connections: ${wsClients.size}`);
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logDebug(`← StreamDeck: ${JSON.stringify(message)}`);
          handleStreamDeckMessage(ws, message);
        } catch (e) {
          logError('Error parsing StreamDeck message: ' + e.message);
        }
      });
      
      ws.on('close', (code, reason) => {
        wsClients.delete(ws);
        logWarn(`StreamDeck plugin disconnected (code: ${code}, reason: ${reason || 'none'})`);
        log(`Active connections: ${wsClients.size}`);
      });
      
      ws.on('error', (error) => {
        logError('WebSocket client error: ' + error.message);
      });
    });
    
    wss.on('error', (error) => {
      logError('WebSocket server error: ' + error.message);
    });
    
    logSuccess(`WebSocket server listening on port ${WS_PORT}`);
  } catch (error) {
    logError(`Failed to start WebSocket server: ${error.message}`);
  }
}

function handleStreamDeckMessage(ws, message) {
  log(`Processing action: ${message.action}${message.url ? ` for URL: ${message.url}` : ''}`);
  
  // Forward to Chrome extension
  const id = ++requestId;
  pendingRequests.set(id, { ws, originalId: message.id, timestamp: Date.now() });
  
  logDebug(`→ Chrome: ${JSON.stringify({ id, action: message.action })}`);
  
  writeNativeMessage({
    id: id,
    action: message.action,
    url: message.url,
    tabId: message.tabId,
    windowId: message.windowId
  });
}

// ============================================================
// Chrome Extension Message Handling
// ============================================================

let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  
  while (true) {
    const result = readNativeMessage(inputBuffer);
    if (!result) break;
    
    inputBuffer = inputBuffer.slice(result.bytesRead);
    handleChromeMessage(result.message);
  }
});

function handleChromeMessage(message) {
  logDebug(`← Chrome: ${JSON.stringify(message)}`);
  
  // Find pending request and respond to StreamDeck
  const pending = pendingRequests.get(message.id);
  if (pending) {
    const duration = Date.now() - pending.timestamp;
    pendingRequests.delete(message.id);
    
    const response = {
      id: pending.originalId,
      ...message
    };
    
    if (pending.ws.readyState === WebSocket.OPEN) {
      pending.ws.send(JSON.stringify(response));
      
      if (message.result?.success) {
        logSuccess(`Action completed: ${message.result.action || 'unknown'} (${duration}ms)`);
      } else if (message.error) {
        logError(`Action failed: ${message.error}`);
      } else {
        log(`Response sent to StreamDeck (${duration}ms)`);
      }
    } else {
      logWarn('Cannot send response - StreamDeck WebSocket closed');
    }
  } else {
    logWarn(`Received response for unknown request ID: ${message.id}`);
  }
}

// ============================================================
// Logging
// ============================================================

const fs = require('fs');
const logFile = path.join(__dirname, 'native-host.log');

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  
  // Write to file
  fs.appendFileSync(logFile, line + '\n');
  
  // Also write to console with colors
  const colors = {
    INFO: '\x1b[36m',    // Cyan
    ERROR: '\x1b[31m',   // Red
    WARN: '\x1b[33m',    // Yellow
    SUCCESS: '\x1b[32m', // Green
    DEBUG: '\x1b[90m'    // Gray
  };
  const reset = '\x1b[0m';
  const color = colors[level] || '';
  
  console.error(`${color}${line}${reset}`);
}

function logError(message) {
  log(message, 'ERROR');
}

function logWarn(message) {
  log(message, 'WARN');
}

function logSuccess(message) {
  log(message, 'SUCCESS');
}

function logDebug(message) {
  log(message, 'DEBUG');
}

// ============================================================
// Initialize
// ============================================================

console.error(''); // Blank line for readability
log('═'.repeat(50));
logSuccess('Native messaging host started');
log(`Log file: ${logFile}`);
log(`WebSocket port: ${WS_PORT}`);
log('═'.repeat(50));

startWebSocketServer();

// Clean up stale pending requests every 30 seconds
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, pending] of pendingRequests.entries()) {
    if (now - pending.timestamp > 30000) {
      pendingRequests.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logWarn(`Cleaned up ${cleaned} stale pending request(s)`);
  }
}, 30000);

process.on('uncaughtException', (error) => {
  logError('Uncaught exception: ' + error.message);
  logError(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled rejection: ' + reason);
});

process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  if (wss) wss.close();
  process.exit(0);
});

process.on('exit', (code) => {
  log(`Native messaging host exiting with code ${code}`);
});
