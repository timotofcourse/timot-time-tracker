let currentTab = null;
let startTime = null;
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
function startTracking(tab) {
  console.log('startTracking called with:', tab?.url);
  
  // Stop current tracking first
  stopTracking();
  
  if (!tab || !tab.url) {
    console.log('No tab or URL provided');
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
  
  currentTab = {
    domain: domain,
    url: tab.url,
    title: tab.title || domain
  };
  
  startTime = Date.now();
  isIdle = false;
  
  console.log('🟢 Started tracking:', domain);
  
  // Save time every 10 seconds
  trackingInterval = setInterval(async () => {
    if (currentTab && startTime && !isIdle) {
      const timeSpent = Date.now() - startTime;
      if (timeSpent >= 1000) { // Only save if at least 1 second
        await saveTime(currentTab.domain, timeSpent, currentTab.title);
        startTime = Date.now(); // Reset for next interval
      }
    }
  }, 10000);
  
  // Also save immediately after 3 seconds for quick feedback
  setTimeout(async () => {
    if (currentTab && startTime && !isIdle) {
      const timeSpent = Date.now() - startTime;
      if (timeSpent >= 1000) {
        await saveTime(currentTab.domain, timeSpent, currentTab.title);
        startTime = Date.now();
      }
    }
  }, 3000);
}

// Stop tracking
async function stopTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  
  // Save final time
  if (currentTab && startTime && !isIdle) {
    const timeSpent = Date.now() - startTime;
    if (timeSpent >= 1000) {
      await saveTime(currentTab.domain, timeSpent, currentTab.title);
      console.log('🔴 Stopped tracking:', currentTab.domain);
    }
  }
  
  currentTab = null;
  startTime = null;
}

// Tab activated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    startTracking(tab);
  } catch (error) {
    console.error('Error on tab activation:', error);
  }
});

// Tab updated
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only handle active tabs
  if (!tab.active) return;
  
  try {
    // URL changed
    if (changeInfo.url) {
      console.log('URL changed to:', changeInfo.url);
      const newDomain = getDomain(changeInfo.url);
      
      // If domain changed, restart tracking
      if (!currentTab || currentTab.domain !== newDomain) {
        startTracking(tab);
      } else if (currentTab) {
        // Same domain, just update URL and title
        currentTab.url = changeInfo.url;
        currentTab.title = tab.title || currentTab.title;
      }
    }
    
    // Tab finished loading and we're not tracking anything
    if (changeInfo.status === 'complete' && !currentTab) {
      console.log('Tab completed loading, starting tracking');
      startTracking(tab);
    }
  } catch (error) {
    console.error('Error on tab update:', error);
  }
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
      // Going idle - save current time
      if (currentTab && startTime && !isIdle) {
        const timeSpent = Date.now() - startTime;
        if (timeSpent >= 1000) {
          await saveTime(currentTab.domain, timeSpent, currentTab.title);
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
      
      if (currentTab) {
        // Resume tracking
        startTime = Date.now();
        trackingInterval = setInterval(async () => {
          if (currentTab && startTime && !isIdle) {
            const timeSpent = Date.now() - startTime;
            if (timeSpent >= 1000) {
              await saveTime(currentTab.domain, timeSpent, currentTab.title);
              startTime = Date.now();
            }
          }
        }, 10000);
      } else {
        // Get current tab and start tracking
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs[0]) {
          startTracking(tabs[0]);
        }
      }
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