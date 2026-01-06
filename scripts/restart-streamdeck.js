// Restart StreamDeck with updated plugin
// Usage: node scripts/restart-streamdeck.js

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'com.streamdeck.urlswitcher.sdPlugin';
const SOURCE_DIR = path.join(__dirname, '..', 'streamdeck-plugin', PLUGIN_NAME);
const DEST_DIR = path.join(process.env.APPDATA, 'Elgato', 'StreamDeck', 'Plugins', PLUGIN_NAME);
const STREAMDECK_EXE = 'C:\\Program Files\\Elgato\\StreamDeck\\StreamDeck.exe';

console.log('═'.repeat(60));
console.log('StreamDeck Plugin Restart Script');
console.log('═'.repeat(60));
console.log('');

// Step 1: Kill StreamDeck
console.log('[1/4] Stopping StreamDeck...');
try {
  execSync('taskkill /IM StreamDeck.exe /F', { stdio: 'pipe' });
  console.log('      ✓ StreamDeck stopped');
} catch (e) {
  console.log('      ⚠ StreamDeck was not running');
}

// Wait a moment for process to fully exit
sleep(1000);

// Step 2: Delete old plugin
console.log('[2/4] Removing old plugin...');
if (fs.existsSync(DEST_DIR)) {
  try {
    fs.rmSync(DEST_DIR, { recursive: true, force: true });
    console.log('      ✓ Old plugin removed');
  } catch (e) {
    console.error('      ✗ Failed to remove old plugin:', e.message);
    process.exit(1);
  }
} else {
  console.log('      ⚠ No existing plugin found');
}

// Step 3: Copy new plugin
console.log('[3/4] Copying new plugin...');
try {
  copyDir(SOURCE_DIR, DEST_DIR);
  console.log('      ✓ Plugin copied to:', DEST_DIR);
} catch (e) {
  console.error('      ✗ Failed to copy plugin:', e.message);
  process.exit(1);
}

// Step 4: Start StreamDeck
console.log('[4/4] Starting StreamDeck...');
try {
  spawn(STREAMDECK_EXE, [], { 
    detached: true, 
    stdio: 'ignore' 
  }).unref();
  console.log('      ✓ StreamDeck started');
} catch (e) {
  console.error('      ✗ Failed to start StreamDeck:', e.message);
  console.log('      Please start StreamDeck manually');
}

console.log('');
console.log('═'.repeat(60));
console.log('Done! Check the plugin log at:');
console.log(path.join(DEST_DIR, 'plugin.log'));
console.log('═'.repeat(60));

// ============================================================
// Helper functions
// ============================================================

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
