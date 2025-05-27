// Default settings
const defaultSettings = {
  ruleSets: [], // { enabled: true, type: 'WHITELIST' | 'BLACKLIST', urls: ['example.com'], times: [{start: '08:00', end: '12:00'}] }
  isExtensionEnabled: true,
  isBreakActive: false,
  breakEndTime: 0,
};

// Initialize storage with default settings if not already set
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get((currentSettings) => {
    const newSettings = { ...defaultSettings, ...currentSettings };
    chrome.storage.local.set(newSettings, () => {
      console.log('Extension settings initialized/loaded.');
      updateAlarms(newSettings);
    });
  });
});

// Listen for storage changes to update alarms
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    chrome.storage.local.get((settings) => {
      console.log('Settings changed, updating alarms.');
      updateAlarms(settings);
    });
  }
});

// --- Alarm Management ---
function updateAlarms(settings) {
  chrome.alarms.clearAll(() => {
    console.log('All alarms cleared.');
    if (!settings.isExtensionEnabled) {
      console.log('Extension is disabled, no alarms will be set.');
      return;
    }

    if (settings.isBreakActive && settings.breakEndTime > Date.now()) {
      chrome.alarms.create('breakEndAlarm', { when: settings.breakEndTime });
      console.log(`Break active. Alarm set for break end: ${new Date(settings.breakEndTime).toLocaleTimeString()}`);
      // During a break, no other blocking alarms are set.
      return;
    }

    settings.ruleSets.forEach((ruleSet, setIndex) => {
      if (!ruleSet.enabled) return;

      ruleSet.times.forEach((timeSlot, timeIndex) => {
        const alarmNameStart = `rule-${setIndex}-time-${timeIndex}-start`;
        const alarmNameEnd = `rule-${setIndex}-time-${timeIndex}-end`;

        const now = new Date();
        const [startHour, startMinute] = timeSlot.start.split(':').map(Number);
        const [endHour, endMinute] = timeSlot.end.split(':').map(Number);

        let startTime = new Date(now);
        startTime.setHours(startHour, startMinute, 0, 0);

        let endTime = new Date(now);
        endTime.setHours(endHour, endMinute, 0, 0);

        // If start time is in the past for today, schedule for tomorrow
        if (startTime < now && !(now >= startTime && now < endTime) ) { // if not currently in an active block
            // If start time has passed and it's not an active block, schedule for tomorrow
        }

        // If end time is earlier than start time, it means it spans across midnight
        if (endTime <= startTime) {
            // If current time is after start (today) or before end (tomorrow)
            if (now >= startTime || now < endTime) { // Currently in blocking period spanning midnight
                 // If it's currently after start (today) and end time is tomorrow
                if (now >= startTime) {
                    endTime.setDate(endTime.getDate() + 1); // End time is tomorrow
                }
                // If it's currently before end time (today) but start was yesterday (implies we started up in the middle of a block)
                // This case is complex as we need to know if the block *should* have started yesterday.
                // For simplicity, we'll assume if end time is tomorrow, and start time is "today", the block is for "today into tomorrow".
            } else { // Block is in the future (e.g. starts tonight, ends tomorrow morning)
                if (startTime < now) startTime.setDate(startTime.getDate() + 1); // Start is tomorrow
                endTime.setDate(endTime.getDate() + 1); // End is also tomorrow (or day after if start was already moved)
            }
        }


        // Only set alarms if the time slot is relevant (end time is in the future)
        // And avoid setting alarms for start times that have already passed today unless it's an ongoing block
        if (endTime > now) {
            // Don't set start alarm if we are already past start time but before end time (ongoing block)
            if (startTime > now) {
                 chrome.alarms.create(alarmNameStart, { when: startTime.getTime() });
                 console.log(`Alarm START set for: ${ruleSet.type} ${ruleSet.urls.join(', ')} at ${timeSlot.start} (Effective: ${startTime.toLocaleString()})`);
            } else if (now >= startTime && now < endTime) {
                // Already in blocking period, trigger check immediately
                console.log(`Currently in active block for ruleSet ${setIndex}, timeSlot ${timeIndex}. Triggering check.`);
                checkAndBlockTabs(settings);
            }

            chrome.alarms.create(alarmNameEnd, { when: endTime.getTime() });
            console.log(`Alarm END set for: ${ruleSet.type} ${ruleSet.urls.join(', ')} at ${timeSlot.end} (Effective: ${endTime.toLocaleString()})`);
        } else {
            console.log(`Time slot ${timeSlot.start}-${timeSlot.end} for ruleSet ${setIndex} has already passed today. Not setting alarms.`);
        }
      });
    });
    scheduleDailyAlarmRefresh();
  });
}

function scheduleDailyAlarmRefresh() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0); // 00:01 AM tomorrow

    chrome.alarms.create('dailyAlarmRefresh', { when: tomorrow.getTime() });
    console.log(`Scheduled daily alarm refresh for: ${tomorrow.toLocaleString()}`);
}


chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('Alarm triggered:', alarm.name);
  chrome.storage.local.get((settings) => {
    if (alarm.name === 'breakEndAlarm') {
      settings.isBreakActive = false;
      settings.breakEndTime = 0;
      chrome.storage.local.set({ isBreakActive: false, breakEndTime: 0 }, () => {
        console.log('Break finished.');
        updateAlarms(settings); // Re-evaluate and set regular alarms
        checkAndBlockTabs(settings); // Re-check tabs after break ends
      });
      return;
    }
    
    if (alarm.name === 'dailyAlarmRefresh') {
        console.log('Daily alarm refresh triggered.');
        updateAlarms(settings); // This will re-evaluate and set alarms for the new day.
        return;
    }

    // For rule-based alarms
    checkAndBlockTabs(settings);
  });
});


// --- Tab Management ---
async function checkAndBlockTabs(settings) {
  if (!settings.isExtensionEnabled || (settings.isBreakActive && settings.breakEndTime > Date.now())) {
    console.log('Extension disabled or break active, skipping blocking.');
    // If extension is disabled or break is active, try to unblock currently blocked tabs.
    const tabs = await chrome.tabs.query({url: chrome.runtime.getURL("html/blocked.html*")});
    for (const tab of tabs) {
        try {
            const originalUrl = new URL(tab.url).searchParams.get('originalUrl');
            if (originalUrl) {
                await chrome.tabs.update(tab.id, { url: decodeURIComponent(originalUrl) });
            }
        } catch (e) {
            console.error('Error trying to unblock tab:', e);
        }
    }
    return;
  }

  const activeTabs = await chrome.tabs.query({ active: true }); // Get all active tabs in all windows
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  for (const tab of activeTabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith(chrome.runtime.getURL("")) ) continue;

    let shouldBlock = false;
    let activeRuleType = null;

    for (const ruleSet of settings.ruleSets) {
      if (!ruleSet.enabled) continue;

      for (const timeSlot of ruleSet.times) {
        if (isTimeWithinSlot(currentTime, timeSlot.start, timeSlot.end)) {
          // This rule set is active for the current time
          const tabHostname = new URL(tab.url).hostname;
          const isListed = ruleSet.urls.some(urlPattern => {
            try {
                // Support both full domain and subdomains like *.example.com
                if (urlPattern.startsWith("*.")) {
                    const baseDomain = urlPattern.substring(2);
                    return tabHostname === baseDomain || tabHostname.endsWith("." + baseDomain);
                }
                return tabHostname === urlPattern;
            } catch (e) { return false; }
          });


          if (ruleSet.type === 'WHITELIST') {
            if (!isListed) {
              shouldBlock = true;
              activeRuleType = 'WHITELIST';
              // console.log(`WHITELIST BLOCK: ${tab.url} not in [${ruleSet.urls.join(', ')}] during ${timeSlot.start}-${timeSlot.end}`);
            } else {
              // console.log(`WHITELIST ALLOW: ${tab.url} in [${ruleSet.urls.join(', ')}] during ${timeSlot.start}-${timeSlot.end}`);
              shouldBlock = false; // Whitelisted, so explicitly don't block, even if a later blacklist rule might apply.
              activeRuleType = null;
              break; // Stop checking other rules in this set, and other sets. Whitelist match takes precedence.
            }
          } else if (ruleSet.type === 'BLACKLIST') {
            if (isListed) {
              shouldBlock = true;
              activeRuleType = 'BLACKLIST';
              // console.log(`BLACKLIST BLOCK: ${tab.url} in [${ruleSet.urls.join(', ')}] during ${timeSlot.start}-${timeSlot.end}`);
              break; // Blacklist match, block immediately
            } else {
              // console.log(`BLACKLIST ALLOW: ${tab.url} not in [${ruleSet.urls.join(', ')}] during ${timeSlot.start}-${timeSlot.end}`);
            }
          }
        }
      }
      if (shouldBlock && activeRuleType === 'BLACKLIST') break; // A blacklist match means we must block.
      if (!shouldBlock && activeRuleType === null && ruleSet.type === 'WHITELIST') break; // A whitelist allowed it.
    }


    // If after checking all rules, it's a whitelist block, or a blacklist block, then block.
    if (shouldBlock) {
        console.log(`Blocking ${tab.url} based on ${activeRuleType} rule.`);
      const blockedPageUrl = chrome.runtime.getURL(`html/blocked.html?originalUrl=${encodeURIComponent(tab.url)}&timestamp=${Date.now()}`);
      // Check if already on blocked page for this URL to prevent reload loops
      if (!tab.url.startsWith(chrome.runtime.getURL("html/blocked.html"))) {
        chrome.tabs.update(tab.id, { url: blockedPageUrl });
      }
    } else {
        // If the tab is currently showing our blocked page, but it shouldn't be blocked anymore
        if (tab.url.startsWith(chrome.runtime.getURL("html/blocked.html"))) {
            const originalUrlParams = new URL(tab.url).searchParams;
            const originalUrl = originalUrlParams.get('originalUrl');
            if (originalUrl) {
                console.log(`Unblocking ${originalUrl} as it's no longer matching rules.`);
                chrome.tabs.update(tab.id, { url: decodeURIComponent(originalUrl) });
            }
        }
    }
  }
}


function isTimeWithinSlot(currentTime, startTime, endTime) {
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const startTotalMinutes = startHour * 60 + startMinute;
  let endTotalMinutes = endHour * 60 + endMinute;

  // Handle overnight slots (e.g., 22:00 - 02:00)
  if (endTotalMinutes < startTotalMinutes) {
    // If current time is past midnight (and part of the overnight slot) or before end time (same day as start)
    // e.g. Slot is 22:00 to 02:00.
    // Current time 23:00 -> (23*60) >= (22*60) -> true
    // Current time 01:00 -> (01*60) < (02*60) -> true (if we adjust endTotalMinutes for current time)
    if (currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes) {
        return true;
    }
  } else {
    // Normal same-day slot
    if (currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes) {
      return true;
    }
  }
  return false;
}

// Listen for tab updates (e.g., navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Wait for the tab to complete loading to ensure URL is final
  if (changeInfo.status === 'complete' && tab.active) {
    chrome.storage.local.get((settings) => {
        if (settings.isExtensionEnabled && (!settings.isBreakActive || settings.breakEndTime <= Date.now())) {
            checkAndBlockTabs(settings);
        }
    });
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.storage.local.get((settings) => {
    if (settings.isExtensionEnabled && (!settings.isBreakActive || settings.breakEndTime <= Date.now())) {
        checkAndBlockTabs(settings);
    }
  });
});

// Initial check when the background script starts (e.g., after installation or browser start)
chrome.runtime.onStartup.addListener(() => {
    console.log("Extension startup, performing initial check.");
    chrome.storage.local.get(updateAlarms); // Load settings and update alarms
});

console.log('Background script loaded.');
// Perform an initial check and alarm setup when the script is loaded (e.g., on install/update/browser start)
chrome.storage.local.get(updateAlarms); 