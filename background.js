let activeTabs = new Map(); // tabId -> { domain, url, title, startTime }
let isIdle = false;
let trackingInterval = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Website Time Tracker installed');
  await initializeStorage();
  
  // Start tracking current tab immediately
  setTimeout(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        console.log('Starting initial tracking for:', tabs[0].url);
        startTracking(tabs[0]);
      }
    } catch (error) {
      console.error('Error starting initial tracking:', error);
    }
  }, 1000);
});

// Initialize storage structure
async function initializeStorage() {
  try {
    const result = await chrome.storage.local.get(['timeData', 'lastResetDate']);
    if (!result.timeData) {
      await chrome.storage.local.set({
        timeData: {},
        lastResetDate: new Date().toDateString()
      });
      console.log('Initialized storage');
    } else {
      console.log('Storage already exists with', Object.keys(result.timeData).length, 'domains');
    }
  } catch (error) {
    console.error('Error initializing storage:', error);
  }
}

// Get domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (error) {
    console.error('Error parsing URL:', url, error);
    return 'unknown';
  }
}

// Save time to storage
async function saveTime(domain, timeSpent, title) {
  try {
    const today = new Date().toDateString();
    const result = await chrome.storage.local.get(['timeData', 'lastResetDate']);
    let timeData = result.timeData || {};
    
    // Reset data if it's a new day
    if (result.lastResetDate !== today) {
      console.log('New day detected, resetting daily counters');
      for (let d in timeData) {
        if (!timeData[d].history) {
          timeData[d].history = [];
        }
        if (timeData[d].todayTime > 0) {
          timeData[d].history.push({
            date: result.lastResetDate,
            time: timeData[d].todayTime
          });
        }
        timeData[d].todayTime = 0;
      }
      await chrome.storage.local.set({ lastResetDate: today });
    }
    
    // Initialize domain if needed
    if (!timeData[domain]) {
      timeData[domain] = {
        totalTime: 0,
        todayTime: 0,
        lastVisit: Date.now(),
        title: title || domain,
        history: []
      };
      console.log('Initialized new domain:', domain);
    }
    
    // Update times
    timeData[domain].totalTime += timeSpent;
    timeData[domain].todayTime += timeSpent;
    timeData[domain].lastVisit = Date.now();
    timeData[domain].title = title || timeData[domain].title;
    
    await chrome.storage.local.set({ timeData });
    
    console.log(`✓ Saved ${Math.round(timeSpent/1000)}s for ${domain} (Today: ${Math.round(timeData[domain].todayTime/1000)}s)`);
    
    return true;
  } catch (error) {
    console.error('Error saving time:', error);
    return false;
  }
}

// Start tracking
async function startTracking(tab) {
  console.log('startTracking called with:', tab?.url);
  
  if (!tab || !tab.url || !tab.id) {
    console.log('No tab, URL, or ID provided');
    return;
  }
  
  // Skip chrome:// and extension URLs
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
    console.log('Skipping internal URL:', tab.url);
    return;
  }
  
  const domain = getDomain(tab.url);
  if (!domain || domain === 'unknown') {
    console.log('Invalid domain for URL:', tab.url);
    return;
  }
  
  // Check if already tracking this tab
  if (activeTabs.has(tab.id)) {
    return;
  }
  
  activeTabs.set(tab.id, {
    domain: domain,
    url: tab.url,
    title: tab.title || domain,
    startTime: Date.now()
  });
  
  console.log('🟢 Started tracking:', domain, 'on tab', tab.id);
}

// Stop tracking
async function stopTracking(tabId = null) {
  if (tabId) {
    // Stop tracking specific tab
    const tabData = activeTabs.get(tabId);
    if (tabData && !isIdle) {
      const timeSpent = Date.now() - tabData.startTime;
      if (timeSpent >= 1000) {
        await saveTime(tabData.domain, timeSpent, tabData.title);
        console.log('🔴 Stopped tracking:', tabData.domain, 'on tab', tabId);
      }
    }
    activeTabs.delete(tabId);
  } else {
    // Stop all tracking
    for (const [id, tabData] of activeTabs) {
      if (!isIdle) {
        const timeSpent = Date.now() - tabData.startTime;
        if (timeSpent >= 1000) {
          await saveTime(tabData.domain, timeSpent, tabData.title);
          console.log('🔴 Stopped tracking:', tabData.domain, 'on tab', id);
        }
      }
    }
    activeTabs.clear();
  }
}

// Tab activated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
  await updateActiveTabsTracking();
});

// Tab updated
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Handle audible state changes or URL changes
  if (changeInfo.audible !== undefined || changeInfo.url || changeInfo.status === 'complete') {
    await updateActiveTabsTracking();
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await stopTracking(tabId);
});

// Window focus changed
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  console.log('Window focus changed:', windowId);
  try {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Lost focus
      await stopTracking();
    } else {
      // Gained focus
      const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
      if (tabs && tabs[0]) {
        startTracking(tabs[0]);
      }
    }
  } catch (error) {
    console.error('Error on window focus change:', error);
  }
});

// Idle state changed
chrome.idle.onStateChanged.addListener(async (state) => {
  console.log('Idle state changed:', state);
  try {
    if (state === 'idle' || state === 'locked') {
      // Going idle - save current time for all active tabs
      for (const [tabId, tabData] of activeTabs) {
        const timeSpent = Date.now() - tabData.startTime;
        if (timeSpent >= 1000) {
          await saveTime(tabData.domain, timeSpent, tabData.title);
        }
      }
      isIdle = true;
      
      // Stop interval but keep tracking info
      if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
      }
    } else if (state === 'active') {
      // Coming back from idle
      isIdle = false;
      
      // Resume tracking for all active tabs
      for (const [tabId, tabData] of activeTabs) {
        tabData.startTime = Date.now();
      }
      
      // Set up tracking interval
      if (!trackingInterval) {
        trackingInterval = setInterval(async () => {
          if (!isIdle && activeTabs.size > 0) {
            const now = Date.now();
            for (const [tabId, tabData] of activeTabs) {
              const timeSpent = now - tabData.startTime;
              if (timeSpent >= 1000) {
                await saveTime(tabData.domain, timeSpent, tabData.title);
                tabData.startTime = now;
              }
            }
          }
        }, 10000);
      }
      
      // Update active tabs tracking
      await updateActiveTabsTracking();
    }
  } catch (error) {
    console.error('Error handling idle state:', error);
  }
});

// Set idle detection to 30 seconds
chrome.idle.setDetectionInterval(30);

// Extension startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension starting up');
  try {
    // Wait a bit for browser to be ready
    setTimeout(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        startTracking(tabs[0]);
      }
    }, 2000);
  } catch (error) {
    console.error('Error on startup:', error);
  }
});

// Debug: Log storage contents every 30 seconds
setInterval(async () => {
  try {
    const result = await chrome.storage.local.get(['timeData']);
    const domains = Object.keys(result.timeData || {});
    console.log(`📊 Storage check: ${domains.length} domains tracked`);
    if (domains.length > 0) {
      console.log('Domains:', domains);
    }
  } catch (error) {
    console.error('Error checking storage:', error);
  }
}, 30000);

async function updateActiveTabsTracking() {
  try {
    const tabs = await chrome.tabs.query({});
    const currentlyActive = new Set();
    
    for (const tab of tabs) {
      // Track if tab is active OR audible (playing sound)
      if ((tab.active || tab.audible) && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        currentlyActive.add(tab.id);
        await startTracking(tab);
      }
    }
    
    // Stop tracking tabs that are no longer active or audible
    for (const tabId of activeTabs.keys()) {
      if (!currentlyActive.has(tabId)) {
        await stopTracking(tabId);
      }
    }
  } catch (error) {
    console.error('Error updating active tabs:', error);
  }
}