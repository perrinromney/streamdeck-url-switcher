// Install script for StreamDeck URL Switcher
// Run with: node scripts/install.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ROOT_DIR = path.join(__dirname, '..');
const NATIVE_HOST_DIR = path.join(ROOT_DIR, 'native-host');
const CHROME_EXT_DIR = path.join(ROOT_DIR, 'chrome-extension');
const STREAMDECK_PLUGIN_DIR = path.join(ROOT_DIR, 'streamdeck-plugin', 'com.streamdeck.urlswitcher.sdPlugin');

console.log('='.repeat(60));
console.log('StreamDeck URL Switcher - Installer');
console.log('='.repeat(60));
console.log('');

async function main() {
  // Step 1: Install native host dependencies
  console.log('[1/4] Installing native host dependencies...');
  try {
    execSync('npm install', { cwd: NATIVE_HOST_DIR, stdio: 'inherit' });
    console.log('✓ Dependencies installed\n');
  } catch (error) {
    console.error('✗ Failed to install dependencies');
    process.exit(1);
  }

  // Step 2: Get Chrome extension ID
  console.log('[2/4] Chrome Extension Setup');
  console.log('');
  console.log('Please load the Chrome extension first:');
  console.log('  1. Open Edge/Chrome and go to edge://extensions or chrome://extensions');
  console.log('  2. Enable "Developer mode"');
  console.log('  3. Click "Load unpacked"');
  console.log('  4. Select folder: ' + CHROME_EXT_DIR);
  console.log('  5. Copy the Extension ID shown');
  console.log('');
  
  const extensionId = await question('Enter your Extension ID: ');
  
  if (!extensionId || extensionId.length < 20) {
    console.error('Invalid extension ID');
    process.exit(1);
  }

  // Step 3: Configure native host manifest
  console.log('\n[3/4] Configuring native messaging host...');
  
  const nativeHostExe = path.join(NATIVE_HOST_DIR, 'run-host.bat');
  const nativeManifestPath = path.join(NATIVE_HOST_DIR, 'manifest.json');
  
  // Create batch file to run the native host
  const batContent = `@echo off
cd /d "${NATIVE_HOST_DIR}"
node native-host.js
`;
  fs.writeFileSync(nativeHostExe, batContent);
  
  // Update manifest with correct path and extension ID
  const manifest = {
    name: 'com.streamdeck.urlswitcher',
    description: 'StreamDeck URL Switcher Native Host',
    path: nativeHostExe,
    type: 'stdio',
    allowed_origins: [
      `chrome-extension://${extensionId}/`
    ]
  };
  
  fs.writeFileSync(nativeManifestPath, JSON.stringify(manifest, null, 2));
  console.log('✓ Native host manifest configured');
  
  // Step 4: Register native messaging host in registry
  console.log('\n[4/4] Registering native messaging host...');
  
  const registryPath = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.streamdeck.urlswitcher';
  const edgeRegistryPath = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.streamdeck.urlswitcher';
  
  try {
    // Register for Chrome
    execSync(`reg add "${registryPath}" /ve /t REG_SZ /d "${nativeManifestPath}" /f`, { stdio: 'pipe' });
    console.log('✓ Registered for Chrome');
  } catch (e) {
    console.log('⚠ Could not register for Chrome (may need admin rights)');
  }
  
  try {
    // Register for Edge
    execSync(`reg add "${edgeRegistryPath}" /ve /t REG_SZ /d "${nativeManifestPath}" /f`, { stdio: 'pipe' });
    console.log('✓ Registered for Edge');
  } catch (e) {
    console.log('⚠ Could not register for Edge (may need admin rights)');
  }

  // Done
  console.log('\n' + '='.repeat(60));
  console.log('Installation Complete!');
  console.log('='.repeat(60));
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('1. Start the native host:');
  console.log('   Run: node ' + path.join(NATIVE_HOST_DIR, 'native-host.js'));
  console.log('   (Or add to startup for automatic launch)');
  console.log('');
  console.log('2. Install StreamDeck plugin:');
  console.log('   Copy folder: ' + STREAMDECK_PLUGIN_DIR);
  console.log('   To: %APPDATA%\\Elgato\\StreamDeck\\Plugins\\');
  console.log('');
  console.log('3. Restart StreamDeck software');
  console.log('');
  console.log('4. Add "Switch to URL" action to your StreamDeck');
  console.log('');
  
  rl.close();
}

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

main().catch(console.error);
