document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupEventListeners();
});

let currentTab = 'today';
let timeData = {};

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentTab = e.target.dataset.tab;
      renderContent();
    });
  });
  
  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportData);
}

async function loadData() {
  const result = await chrome.storage.local.get(['timeData']);
  timeData = result.timeData || {};
  renderContent();
  updateStats();
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days >0){
    return `${days}d`
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

function getDomainIcon(domain) {
  // Cyberpunk-themed icons
  const iconMap = {
    'youtube.com': '🎥',
    'google.com': '🔎',
    'facebook.com': '👤',
    'twitter.com': '👤',
    'x.com': '👤',
    'instagram.com': '👤',
    'linkedin.com': '👷',
    'reddit.com': '👤',
    'stackoverflow.com': '🖥️',
    'github.com': '🖥️',
    'gitlab.com': '🖥️',
    'netflix.com': '🎥',
    'amazon.com': '🛍️',
    'ebay.com': '🛍️',
    'gmail.com': '📧',
    'discord.com': '💬',
    'twitch.tv': '🎥',
    'spotify.com': '🎵',
    'tiktok.com': '🎥',
    'kick.com': '🎥',
    'mastodon.social': '👤',
    'threads.com': '👤',
    'primevideo.com': '🎥',
    'crunchyroll.com': '🎥',
    'aniwatchtv.to': '🎥',
    'outlook.com': '📧',
    'tuta.com': '📧',
    'wikipedia.org': '📔',
    'chatgpt.com': '🤖',
    'characterai.com': '🤖',
    'janitorai.com': '🤖',
    'character-tavern.com': '🤖',
    'flowgpt.com': '🤖',
    'chub.ai': '🤖',
    'emochi.com': '🤖',
    'copilot.microsoft.com': '🤖',
    'claude.ai': '🤖',
    'guilded.gg': '💬',
    'steam.com': '🎮',
    'steampowered.com': '🎮',
    'roblox.com': '🎮',
    'epicgames.com': '🎮',
    'gog.com': '🎮',
    'itch.io': '🎮',
    'instant-gaming.com': '🎮',
    'g2a.com': '🎮',
    'grepolis.com': '🎮',
    'search.brave.com': '🔎',
    'bing.com': '🔎',
    'duckduckgo.com': '🔎',
    'modrinth.com': '🎮',
    'curseforge.com': '🎮',
    'nexusmods.com': '🎮',
    'degmods.com': '🎮',
    'windows.com': '🪟',
    'linux.org': '🐧',
    'kernel.org': '🐧',
    'debian.org': '🐧',
    'ubuntu.com': '🐧',
    'getfedora.org': '🐧',
    'fedoraproject.org': '🐧',
    'launchpad.net': '🐧',
    'archlinux.org': '🐧',
    'edubuntu.org': '🐧',
    'kubuntu.org': '🐧',
    'lubuntu.me': '🐧',
    'ubuntubudgie.org': '🐧',
    'ubuntucinnamon.org': '🐧',
    'ubuntukylin.com': '🐧',
    'ubuntu-mate.org': '🐧',
    'ubuntustudio.org': '🐧',
    'ubuntuunity.org': '🐧',
    'xubuntu.org': '🐧',
    'linuxmint.com': '🐧',
    'zorin.com': '🐧',
    'protondb.com': '🎮',
    'markdownguide.org': '📔',
    'whatsapp.com': '💬',
    'fandom.com': '📔',
    't.me': '💬',
    'chiptec.net': '🛍️',
    'signal.org': '💬'

  };
  
  return iconMap[domain] || '🌍';
}

function updateStats() {
  let todayTotal = 0;
  let sitesCount = 0;
  
  for (let domain in timeData) {
    if (timeData[domain].todayTime > 0) {
      todayTotal += timeData[domain].todayTime;
      sitesCount++;
    }
  }
  
  document.getElementById('todayTotal').textContent = formatTime(todayTotal);
  document.getElementById('sitesCount').textContent = sitesCount;
}

function renderContent() {
  const content = document.getElementById('content');
  
  // Get sorted data based on current tab
  const sortedSites = Object.entries(timeData)
    .filter(([domain, data]) => {
      return currentTab === 'today' ? data.todayTime > 0 : data.totalTime > 0;
    })
    .sort(([, a], [, b]) => {
      const timeA = currentTab === 'today' ? a.todayTime : a.totalTime;
      const timeB = currentTab === 'today' ? b.todayTime : b.totalTime;
      return timeB - timeA;
    });
  
  if (sortedSites.length === 0) {
    content.innerHTML = '<div class="no-data">⚡ No active data streams detected in the neural network ⚡</div>';
    return;
  }
  
  const html = sortedSites.map(([domain, data]) => {
    const time = currentTab === 'today' ? data.todayTime : data.totalTime;
    const lastVisit = new Date(data.lastVisit).toLocaleDateString();
    
    return `
      <div class="site-item">
        <div class="site-icon">${getDomainIcon(domain)}</div>
        <div class="site-info">
          <div class="site-name">${domain}</div>
          <div class="site-time">Last visited: ${lastVisit}</div>
        </div>
        <div class="time-display">${formatTime(time)}</div>
      </div>
    `;
  }).join('');
  
  content.innerHTML = html;
}

function exportData() {
  const exportObject = {
    exportDate: new Date().toISOString(),
    data: timeData,
    summary: {
      totalSites: Object.keys(timeData).length,
      totalTimeAllSites: Object.values(timeData).reduce((sum, site) => sum + site.totalTime, 0)
    }
  };
  
  const dataStr = JSON.stringify(exportObject, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `website-time-tracker-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
}

// Refresh data every 5 seconds when popup is open
setInterval(loadData, 5000);