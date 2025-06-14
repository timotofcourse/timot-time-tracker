let currentTab = null;
let startTime = null;
let isIdle = false;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Website Time Tracker installed');
  initializeStorage();
});

// Initialize storage structure
async function initializeStorage() {
  const result = await chrome.storage.local.get(['timeData']);
  if (!result.timeData) {
    await chrome.storage.local.set({
      timeData: {},
      lastResetDate: new Date().toDateString()
    });
  }
}

// Get domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

// Start tracking time for a website
function startTracking(tab) {
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }
  
  currentTab = {
    domain: getDomain(tab.url),
    url: tab.url,
    title: tab.title || 'Unknown'
  };
  startTime = Date.now();
  isIdle = false;
}

// Stop tracking and save time
async function stopTracking() {
  if (!currentTab || !startTime || isIdle) {
    return;
  }
  
  const timeSpent = Date.now() - startTime;
  
  // Only track if more than 1 second
  if (timeSpent < 1000) {
    return;
  }
  
  const today = new Date().toDateString();
  const result = await chrome.storage.local.get(['timeData', 'lastResetDate']);
  let timeData = result.timeData || {};
  
  // Reset data if it's a new day
  if (result.lastResetDate !== today) {
    // Keep historical data but reset daily counters
    for (let domain in timeData) {
      if (!timeData[domain].history) {
        timeData[domain].history = [];
      }
      if (timeData[domain].todayTime > 0) {
        timeData[domain].history.push({
          date: result.lastResetDate,
          time: timeData[domain].todayTime
        });
      }
      timeData[domain].todayTime = 0;
    }
    await chrome.storage.local.set({ lastResetDate: today });
  }
  
  // Initialize domain data if needed
  if (!timeData[currentTab.domain]) {
    timeData[currentTab.domain] = {
      totalTime: 0,
      todayTime: 0,
      lastVisit: Date.now(),
      title: currentTab.title,
      history: []
    };
  }
  
  // Update time data
  timeData[currentTab.domain].totalTime += timeSpent;
  timeData[currentTab.domain].todayTime += timeSpent;
  timeData[currentTab.domain].lastVisit = Date.now();
  timeData[currentTab.domain].title = currentTab.title;
  
  await chrome.storage.local.set({ timeData });
}

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await stopTracking();
  const tab = await chrome.tabs.get(activeInfo.tabId);
  startTracking(tab);
});

// Handle tab updates (URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await stopTracking();
    startTracking(tab);
  }
});

// Handle window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus
    await stopTracking();
    currentTab = null;
  } else {
    // Browser gained focus
    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tabs[0]) {
      startTracking(tabs[0]);
    }
  }
});

// Handle idle state
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'idle' || state === 'locked') {
    await stopTracking();
    isIdle = true;
  } else if (state === 'active') {
    isIdle = false;
    // Get current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      startTracking(tabs[0]);
    }
  }
});

// Set idle detection to 30 seconds
chrome.idle.setDetectionInterval(30);

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    startTracking(tabs[0]);
  }
});