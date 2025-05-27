document.addEventListener('DOMContentLoaded', () => {
  const extensionEnabledSwitch = document.getElementById('extensionEnabledSwitch');
  const breakDurationInput = document.getElementById('breakDuration');
  const startBreakButton = document.getElementById('startBreakButton');
  const breakStatusDisplay = document.getElementById('breakStatus');
  const breakTimeRemainingSpan = document.getElementById('breakTimeRemaining');
  const ruleSetsContainer = document.getElementById('ruleSetsContainer');
  const addRuleSetButton = document.getElementById('addRuleSetButton');
  const saveAllSettingsButton = document.getElementById('saveAllSettingsButton');
  const endBreakButton = document.getElementById('endBreakButton');

  let currentSettings = {};
  let breakIntervalId = null;
  const defaultSettingsFromBackground = {
      ruleSets: [], 
      isExtensionEnabled: true,
      isBreakActive: false,
      breakEndTime: 0,
  };

  function loadSettings() {
    chrome.storage.local.get(defaultSettingsFromBackground, (settings) => {
      currentSettings = JSON.parse(JSON.stringify(settings));
      extensionEnabledSwitch.checked = currentSettings.isExtensionEnabled;
      renderRuleSets(currentSettings.ruleSets || []);
      updateBreakStatus(currentSettings);
    });
  }

  function saveAllRuleSettings() {
    chrome.storage.local.set(currentSettings, () => {
      console.log('All settings saved to storage.');
      alert('ルール設定が保存されました。');
    });
  }

  function updateBreakStatus(settingsToUpdate) {
    if (settingsToUpdate.isBreakActive && settingsToUpdate.breakEndTime > Date.now()) {
      breakStatusDisplay.style.display = 'block';
      startBreakButton.style.display = 'none';
      breakDurationInput.style.display = 'none';
      endBreakButton.style.display = 'block';

      if (breakIntervalId) clearInterval(breakIntervalId);
      breakIntervalId = setInterval(() => {
        const timeLeft = Math.max(0, Math.round((settingsToUpdate.breakEndTime - Date.now()) / 1000));
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        breakTimeRemainingSpan.textContent = `${minutes}分${seconds}秒`;
        if (timeLeft <= 0) {
          clearInterval(breakIntervalId);
          currentSettings.isBreakActive = false;
          currentSettings.breakEndTime = 0;
          chrome.storage.local.set({ isBreakActive: false, breakEndTime: 0 }, () => {
            console.log('Break finished automatically, state saved immediately.');
            updateBreakStatus(currentSettings);
          });
        }
      }, 1000);
    } else {
      breakStatusDisplay.style.display = 'none';
      startBreakButton.style.display = 'block';
      breakDurationInput.style.display = 'block';
      endBreakButton.style.display = 'none';
      if (breakIntervalId) clearInterval(breakIntervalId);
      if (settingsToUpdate.isBreakActive === false) {
          currentSettings.isBreakActive = false;
      }
    }
  }

  extensionEnabledSwitch.addEventListener('change', () => {
    const newState = extensionEnabledSwitch.checked;
    currentSettings.isExtensionEnabled = newState;
    chrome.storage.local.set({ isExtensionEnabled: newState }, () => {
        console.log('Extension enabled state saved immediately:', newState);
    });
  });

  startBreakButton.addEventListener('click', () => {
    const durationMinutes = parseInt(breakDurationInput.value, 10);
    if (durationMinutes >= 1 && durationMinutes <= 60) {
      const newBreakEndTime = Date.now() + durationMinutes * 60 * 1000;
      currentSettings.isBreakActive = true;
      currentSettings.breakEndTime = newBreakEndTime;
      
      chrome.storage.local.set({ isBreakActive: true, breakEndTime: newBreakEndTime }, () => {
        console.log('Break state saved immediately.');
        updateBreakStatus(currentSettings);
      });
    } else {
      alert('休憩時間は1分から60分の間で設定してください。');
    }
  });

  endBreakButton.addEventListener('click', () => {
    if (breakIntervalId) clearInterval(breakIntervalId);
    currentSettings.isBreakActive = false;
    currentSettings.breakEndTime = 0;
    chrome.storage.local.set({ isBreakActive: false, breakEndTime: 0 }, () => {
      console.log('Break ended by user, state saved immediately.');
      updateBreakStatus(currentSettings);
    });
  });

  function renderRuleSets(ruleSets) {
    ruleSetsContainer.innerHTML = '';
    (ruleSets || []).forEach((ruleSet, index) => {
      const setDiv = document.createElement('div');
      setDiv.classList.add('rule-set');
      setDiv.innerHTML = `
        <h3>ルールセット ${index + 1} <button class="removeRuleSetButton remove-button" data-index="${index}" style="float:right;">削除</button></h3>
        <label><input type="checkbox" class="ruleSetEnabled" data-index="${index}" ${ruleSet.enabled ? 'checked' : ''}> 有効</label>
        <label>タイプ:
          <select class="ruleSetType" data-index="${index}">
            <option value="WHITELIST" ${ruleSet.type === 'WHITELIST' ? 'selected' : ''}>ホワイトリスト</option>
            <option value="BLACKLIST" ${ruleSet.type === 'BLACKLIST' ? 'selected' : ''}>ブラックリスト</option>
          </select>
        </label>
        <label>新しいURL (例: example.com または *.example.com):</label>
        <div style="display: flex; margin-bottom: 5px;">
          <input type="text" class="newUrlInput" data-index="${index}" style="flex-grow: 1; margin-right: 5px; margin-bottom: 0;">
          <button class="addUrlButton" data-index="${index}" style="white-space: nowrap;">追加</button>
        </div>
        <div class="urlsList" data-index="${index}" style="margin-top: 5px; max-height: 100px; overflow-y: auto; border: 1px solid #eee; padding: 5px; border-radius: 3px;"></div>
        <h4>時間帯:</h4>
        <div class="timeSlotsContainer" data-ruleset-index="${index}"></div>
        <button class="addTimeSlotButton" data-ruleset-index="${index}">時間帯を追加</button>
      `;

      const urlsListDiv = setDiv.querySelector('.urlsList');
      renderUrlsList(urlsListDiv, index, ruleSet.urls || []);

      setDiv.querySelector('.addUrlButton').addEventListener('click', () => {
        const newUrlInput = setDiv.querySelector('.newUrlInput');
        const newUrl = newUrlInput.value.trim();
        if (newUrl) {
          if (!currentSettings.ruleSets[index].urls.includes(newUrl)) {
            currentSettings.ruleSets[index].urls.push(newUrl);
            renderUrlsList(urlsListDiv, index, currentSettings.ruleSets[index].urls);
            newUrlInput.value = '';
          } else { alert('このURLは既に追加されています。'); }
        } else { alert('URLを入力してください。'); }
      });

      setDiv.querySelector('.ruleSetEnabled').addEventListener('change', (e) => {
        currentSettings.ruleSets[index].enabled = e.target.checked;
      });
      setDiv.querySelector('.ruleSetType').addEventListener('change', (e) => {
        currentSettings.ruleSets[index].type = e.target.value;
      });
      setDiv.querySelector('.removeRuleSetButton').addEventListener('click', () => {
        currentSettings.ruleSets.splice(index, 1);
        renderRuleSets(currentSettings.ruleSets);
      });

      const timeSlotsContainer = setDiv.querySelector('.timeSlotsContainer');
      renderTimeSlots(timeSlotsContainer, index, ruleSet.times || []);

      setDiv.querySelector('.addTimeSlotButton').addEventListener('click', () => {
        if (!currentSettings.ruleSets[index].times) currentSettings.ruleSets[index].times = [];
        currentSettings.ruleSets[index].times.push({ start: '09:00', end: '17:00' });
        renderTimeSlots(timeSlotsContainer, index, currentSettings.ruleSets[index].times);
      });
      ruleSetsContainer.appendChild(setDiv);
    });
  }

  function renderTimeSlots(container, ruleSetIndex, timeSlots) {
    container.innerHTML = '';
    (timeSlots || []).forEach((slot, slotIndex) => {
      const slotDiv = document.createElement('div');
      slotDiv.classList.add('time-slot');
      slotDiv.innerHTML = `
        <input type="time" class="timeSlotStart" value="${slot.start}" data-ruleset-index="${ruleSetIndex}" data-slot-index="${slotIndex}">
        <span> - </span>
        <input type="time" class="timeSlotEnd" value="${slot.end}" data-ruleset-index="${ruleSetIndex}" data-slot-index="${slotIndex}">
        <button class="removeTimeSlotButton remove-button" data-ruleset-index="${ruleSetIndex}" data-slot-index="${slotIndex}">削除</button>
      `;
      slotDiv.querySelector('.timeSlotStart').addEventListener('change', (e) => {
        currentSettings.ruleSets[ruleSetIndex].times[slotIndex].start = e.target.value;
      });
      slotDiv.querySelector('.timeSlotEnd').addEventListener('change', (e) => {
        currentSettings.ruleSets[ruleSetIndex].times[slotIndex].end = e.target.value;
      });
      slotDiv.querySelector('.removeTimeSlotButton').addEventListener('click', () => {
        currentSettings.ruleSets[ruleSetIndex].times.splice(slotIndex, 1);
        renderTimeSlots(container, ruleSetIndex, currentSettings.ruleSets[ruleSetIndex].times);
      });
      container.appendChild(slotDiv);
    });
  }

  function renderUrlsList(container, ruleSetIndex, urls) {
    container.innerHTML = '';
    (urls || []).forEach((url, urlItemIndex) => {
      const urlDiv = document.createElement('div');
      urlDiv.classList.add('url-item');
      urlDiv.innerHTML = `<span>${url}</span> <button class="removeUrlButton remove-button" data-ruleset-index="${ruleSetIndex}" data-url-index="${urlItemIndex}">削除</button>`;
      container.appendChild(urlDiv);
      urlDiv.querySelector('.removeUrlButton').addEventListener('click', (e) => {
        const clickedUrlIndex = parseInt(e.target.dataset.urlIndex, 10);
        currentSettings.ruleSets[ruleSetIndex].urls.splice(clickedUrlIndex, 1);
        renderUrlsList(container, ruleSetIndex, currentSettings.ruleSets[ruleSetIndex].urls);
      });
    });
  }

  addRuleSetButton.addEventListener('click', () => {
    if (!currentSettings.ruleSets) currentSettings.ruleSets = [];
    currentSettings.ruleSets.push({
      enabled: true, type: 'WHITELIST', urls: [],
      times: [{ start: '09:00', end: '17:00' }]
    });
    renderRuleSets(currentSettings.ruleSets);
  });

  saveAllSettingsButton.addEventListener('click', saveAllRuleSettings);

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let refreshRules = false;
      let refreshBreak = false;
      let refreshSwitch = false;

      for (let key in changes) {
        const change = changes[key];
        if (key === 'isExtensionEnabled') {
          if (currentSettings.isExtensionEnabled !== change.newValue) {
            currentSettings.isExtensionEnabled = change.newValue;
            refreshSwitch = true;
          }
        }
        if (key === 'isBreakActive' || key === 'breakEndTime') {
          let breakChanged = false;
          if (key === 'isBreakActive' && currentSettings.isBreakActive !== change.newValue) {
            currentSettings.isBreakActive = change.newValue;
            breakChanged = true;
          }
          if (key === 'breakEndTime' && currentSettings.breakEndTime !== change.newValue) {
            currentSettings.breakEndTime = change.newValue;
            breakChanged = true;
          }
          if (breakChanged) refreshBreak = true;
        }
        if (key === 'ruleSets') {
          if (JSON.stringify(currentSettings.ruleSets) !== JSON.stringify(change.newValue)) {
            currentSettings.ruleSets = JSON.parse(JSON.stringify(change.newValue || defaultSettingsFromBackground.ruleSets));
            refreshRules = true;
          }
        }
      }

      if (refreshSwitch) {
        extensionEnabledSwitch.checked = currentSettings.isExtensionEnabled;
        console.log('Popup: Extension enabled state updated from storage.');
      }
      if (refreshBreak) {
        updateBreakStatus(currentSettings);
        console.log('Popup: Break status updated from storage.');
      }
      if (refreshRules) {
        renderRuleSets(currentSettings.ruleSets);
        console.log('Popup: Rules updated from storage.');
      }
    }
  });

  loadSettings();
}); 