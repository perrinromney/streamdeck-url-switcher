# StreamDeck URL Switcher

A combined Chrome/Edge extension and Stream Deck plugin that lets you quickly switch to browser tabs by URL, or open new ones if not found.

## Features

- 🔍 **Find existing tabs** - Searches all open tabs for matching URL
- 🪟 **Activate & focus** - Brings the browser window and tab to foreground
- 🆕 **Open if missing** - Opens a new tab if URL isn't already open
- 🔗 **Smart URL matching** - Ignores http/https, www, trailing slashes
- 🚀 **No external servers** - Plugin hosts WebSocket server directly

## Components

- **Browser Extension** (`chrome-extension/`) - Connects to plugin via WebSocket, controls browser tabs
- **Stream Deck Plugin** (`streamdeck-plugin/`) - Hosts WebSocket server on port 9334

## Architecture

```
┌─────────────────────────────────────┐
│  StreamDeck Plugin                  │
│  ┌───────────────────────────────┐  │
│  │ WebSocket Server (port 9334)  │  │
│  └───────────────┬───────────────┘  │
└──────────────────┼──────────────────┘
                   │ WebSocket
                   ▼
┌─────────────────────────────────────┐
│  Chrome/Edge Extension              │
│  (connects as WebSocket client)     │
└─────────────────────────────────────┘
```

No native messaging host or external servers required!

## Installation

### Prerequisites
- Node.js 18+
- Chrome or Microsoft Edge
- Elgato Stream Deck software

### Step 1: Clone & Install Dependencies

```bash
git clone https://github.com/your-repo/streamdeck-url-switcher.git
cd streamdeck-url-switcher
npm install
cd streamdeck-plugin/com.streamdeck.urlswitcher.sdPlugin && npm install && cd ../..
```

### Step 2: Install the Stream Deck Plugin

**Option A: Use the restart script (recommended)**
```bash
node scripts/restart-streamdeck.js
```

**Option B: Manual install**

Copy the plugin folder to Stream Deck's plugins directory:

**Windows:**
```
Copy: streamdeck-plugin\com.streamdeck.urlswitcher.sdPlugin
To:   %APPDATA%\Elgato\StreamDeck\Plugins\
```

**macOS:**
```
Copy: streamdeck-plugin/com.streamdeck.urlswitcher.sdPlugin
To:   ~/Library/Application Support/com.elgato.StreamDeck/Plugins/
```

Then restart the Stream Deck software.

### Step 3: Load the Browser Extension

1. Open `edge://extensions` (Edge) or `chrome://extensions` (Chrome)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder

The extension will automatically connect to the Stream Deck plugin's WebSocket server.

## Usage

1. In Stream Deck software, drag **"Switch to URL"** action to a button
2. In the action settings, enter the URL you want to switch to
3. Press the button!

## Configuration Examples

| URL Setting | Behavior |
|-------------|----------|
| `https://github.com` | Switches to any GitHub tab |
| `https://mail.google.com` | Switches to Gmail |
| `localhost:3000` | Switches to local dev server |
| `https://docs.google.com/document/d/abc123` | Switches to specific Google Doc |

## Troubleshooting

### "Not connected" in property inspector
- Make sure the browser extension is installed and enabled
- Check that Edge/Chrome is running
- Restart Stream Deck software

### Button shows alert (X)
- The URL may not be set in the action settings
- Browser extension not connected
- Browser may be closed

### Check plugin logs
```bash
# Windows
type "%APPDATA%\Elgato\StreamDeck\Plugins\com.streamdeck.urlswitcher.sdPlugin\plugin.log"

# Or check source folder
type streamdeck-plugin\com.streamdeck.urlswitcher.sdPlugin\plugin.log
```

## Development

```bash
# Restart StreamDeck with fresh plugin
node scripts/restart-streamdeck.js

# View plugin logs (Windows PowerShell)
Get-Content "$env:APPDATA\Elgato\StreamDeck\Plugins\com.streamdeck.urlswitcher.sdPlugin\plugin.log" -Wait
```

## License

MIT
