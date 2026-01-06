// Popup script for StreamDeck URL Switcher

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const tabsListEl = document.getElementById('tabsList');
  const urlInput = document.getElementById('urlInput');
  const switchBtn = document.getElementById('switchBtn');
  
  // Check StreamDeck plugin connection status
  const status = await chrome.runtime.sendMessage({ action: 'getStatus' });
  if (status.pluginConnected) {
    statusEl.className = 'status connected';
    statusEl.textContent = '✓ Connected to StreamDeck';
  } else {
    statusEl.className = 'status disconnected';
    statusEl.textContent = '✗ StreamDeck not connected - Start StreamDeck';
  }
  
  // Load tabs
  async function loadTabs() {
    const response = await chrome.runtime.sendMessage({ action: 'getTabs' });
    const tabs = response.tabs || [];
    
    tabsListEl.innerHTML = tabs.map(tab => `
      <div class="tab-item" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">
        <img src="${tab.favIconUrl || 'icons/icon16.png'}" onerror="this.src='icons/icon16.png'">
        <div class="tab-info">
          <div class="title">${escapeHtml(tab.title)}</div>
          <div class="url">${escapeHtml(tab.url)}</div>
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    tabsListEl.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', async () => {
        const tabId = parseInt(item.dataset.tabId);
        const windowId = parseInt(item.dataset.windowId);
        await chrome.runtime.sendMessage({ 
          action: 'activateTab', 
          tabId, 
          windowId 
        });
        window.close();
      });
    });
  }
  
  await loadTabs();
  
  // Switch button handler
  switchBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    
    // Add protocol if missing
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      fullUrl = 'https://' + url;
    }
    
    await chrome.runtime.sendMessage({ action: 'switchToURL', url: fullUrl });
    window.close();
  });
  
  // Enter key handler
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      switchBtn.click();
    }
  });
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
