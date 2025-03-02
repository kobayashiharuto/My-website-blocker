// グローバル設定オブジェクト
let settings = {
  enabled: true,
  sets: [
    {
      name: "デフォルトセット",
      isWhitelist: true,
      sites: ["notion.com", "google.com"],
      timeRanges: [
        { start: "08:00", end: "23:59" }
      ]
    }
  ]
};

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', function () {
  initializePopup();
});

// ポップアップの初期化
function initializePopup() {
  // 設定を読み込み
  chrome.storage.local.get(['settings'], function (result) {
    if (result.settings) {
      settings = result.settings;
    }

    // UI更新
    const enableBlocker = document.getElementById('enable-blocker');
    if (enableBlocker) {
      enableBlocker.checked = settings.enabled;

      // 有効/無効チェックボックスのイベントリスナー
      enableBlocker.addEventListener('change', function (e) {
        settings.enabled = e.target.checked;
      });
    }

    // セット追加ボタンのイベントリスナー
    const addSetBtn = document.getElementById('add-set');
    if (addSetBtn) {
      addSetBtn.addEventListener('click', function () {
        settings.sets = settings.sets || [];
        settings.sets.push({
          name: "新しいセット",
          isWhitelist: true,
          sites: ["example.com"],
          timeRanges: [
            { start: "09:00", end: "17:00" }
          ]
        });
        renderSets();
      });
    }

    // 保存ボタンのイベントリスナー
    const saveBtn = document.getElementById('save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        updateSettingsFromUI();

        // 設定を保存
        chrome.storage.local.set({ settings: settings }, function () {
          // 保存完了メッセージ
          const status = document.createElement('div');
          status.textContent = '設定を保存しました。';
          status.style.color = 'green';
          status.style.marginTop = '10px';
          document.body.appendChild(status);
          setTimeout(function () {
            status.remove();
          }, 1500);
        });
      });
    }

    // セットを表示
    renderSets();
  });
}

// UIから現在の設定を取得
function updateSettingsFromUI() {
  const setContainers = document.querySelectorAll('.set-container');
  if (!setContainers || setContainers.length === 0) {
    return;
  }

  settings.sets = [];

  setContainers.forEach(setElement => {
    const nameInput = setElement.querySelector('.set-name-input');
    const typeSwitch = setElement.querySelector('.list-type-switch');
    if (!nameInput || !typeSwitch) return;

    const name = nameInput.value;
    const isWhitelist = typeSwitch.checked;

    // サイトリストの取得
    const siteInputs = setElement.querySelectorAll('.site-input');
    const sites = [];
    if (siteInputs && siteInputs.length > 0) {
      siteInputs.forEach(input => {
        if (input.value.trim() !== '') {
          sites.push(input.value.trim());
        }
      });
    }

    // 時間帯の取得
    const timeRanges = [];
    const timeRangeElements = setElement.querySelectorAll('.time-range');
    if (timeRangeElements && timeRangeElements.length > 0) {
      timeRangeElements.forEach(rangeElement => {
        const startInput = rangeElement.querySelector('.start-time');
        const endInput = rangeElement.querySelector('.end-time');
        if (!startInput || !endInput) return;

        const start = startInput.value;
        const end = endInput.value;

        if (start && end) {
          timeRanges.push({ start, end });
        }
      });
    }

    settings.sets.push({
      name: name,
      isWhitelist: isWhitelist,
      sites: sites,
      timeRanges: timeRanges
    });
  });
}

// セットのUIを描画
function renderSets() {
  const container = document.getElementById('sets-container');
  if (!container) return;

  container.innerHTML = '';

  if (!settings.sets || settings.sets.length === 0) {
    settings.sets = [{
      name: "デフォルトセット",
      isWhitelist: true,
      sites: ["example.com"],
      timeRanges: [{ start: "09:00", end: "17:00" }]
    }];
  }

  settings.sets.forEach((set, setIndex) => {
    const setElement = document.createElement('div');
    setElement.className = 'set-container';

    // セットヘッダー
    const setHeader = document.createElement('div');
    setHeader.className = 'set-header';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'set-name-input';
    nameInput.value = set.name || "名前なしセット";

    const removeSetBtn = document.createElement('button');
    removeSetBtn.className = 'remove-btn';
    removeSetBtn.textContent = 'セットを削除';
    removeSetBtn.addEventListener('click', function () {
      setElement.remove();
    });

    setHeader.appendChild(nameInput);
    setHeader.appendChild(removeSetBtn);
    setElement.appendChild(setHeader);

    // リストタイプ切り替え
    const listTypeDiv = document.createElement('div');
    listTypeDiv.className = 'list-type';
    listTypeDiv.innerHTML = `
      <label>リストタイプ:</label>
      <label class="switch">
        <input type="checkbox" class="list-type-switch" ${set.isWhitelist ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
      <span class="list-type-text">${set.isWhitelist ? 'ホワイトリスト' : 'ブラックリスト'}</span>
    `;

    // スイッチのテキスト更新
    const typeSwitch = listTypeDiv.querySelector('.list-type-switch');
    const typeText = listTypeDiv.querySelector('.list-type-text');
    if (typeSwitch && typeText) {
      typeSwitch.addEventListener('change', function () {
        typeText.textContent = this.checked ? 'ホワイトリスト' : 'ブラックリスト';
      });
    }

    setElement.appendChild(listTypeDiv);

    // サイトリスト
    const sitesContainer = document.createElement('div');
    sitesContainer.className = 'sites-container';

    const sitesHeader = document.createElement('div');
    sitesHeader.className = 'section-header';
    sitesHeader.innerHTML = `
      <h4>サイトリスト:</h4>
      <button class="add-site add-btn">サイトを追加</button>
    `;

    const sitesListContainer = document.createElement('div');
    sitesListContainer.className = 'sites-list';

    // 各サイトの表示
    if (set.sites && set.sites.length > 0) {
      set.sites.forEach(site => {
        const siteElement = createSiteElement(site);
        sitesListContainer.appendChild(siteElement);
      });
    } else {
      // デフォルトで空のサイト入力欄を1つ追加
      const siteElement = createSiteElement("");
      sitesListContainer.appendChild(siteElement);
    }

    // サイト追加ボタンのイベントリスナー
    const addSiteBtn = sitesHeader.querySelector('.add-site');
    if (addSiteBtn) {
      addSiteBtn.addEventListener('click', function () {
        const siteElement = createSiteElement("");
        sitesListContainer.appendChild(siteElement);
      });
    }

    sitesContainer.appendChild(sitesHeader);
    sitesContainer.appendChild(sitesListContainer);
    setElement.appendChild(sitesContainer);

    // 時間帯リスト
    const timeRangesContainer = document.createElement('div');
    timeRangesContainer.className = 'time-ranges-container';

    const timeRangesHeader = document.createElement('div');
    timeRangesHeader.className = 'section-header';
    timeRangesHeader.innerHTML = `
      <h4>時間帯:</h4>
      <button class="add-time-range add-btn">時間帯を追加</button>
    `;

    const timeRangesListContainer = document.createElement('div');
    timeRangesListContainer.className = 'time-ranges-list';

    // 各時間帯の表示
    if (set.timeRanges && set.timeRanges.length > 0) {
      set.timeRanges.forEach(timeRange => {
        const timeRangeElement = createTimeRangeElement(timeRange.start, timeRange.end);
        timeRangesListContainer.appendChild(timeRangeElement);
      });
    } else {
      // デフォルトで時間帯入力欄を1つ追加
      const timeRangeElement = createTimeRangeElement("09:00", "17:00");
      timeRangesListContainer.appendChild(timeRangeElement);
    }

    // 時間帯追加ボタンのイベントリスナー
    const addTimeBtn = timeRangesHeader.querySelector('.add-time-range');
    if (addTimeBtn) {
      addTimeBtn.addEventListener('click', function () {
        const timeRangeElement = createTimeRangeElement("09:00", "17:00");
        timeRangesListContainer.appendChild(timeRangeElement);
      });
    }

    timeRangesContainer.appendChild(timeRangesHeader);
    timeRangesContainer.appendChild(timeRangesListContainer);
    setElement.appendChild(timeRangesContainer);

    container.appendChild(setElement);
  });
}

// サイト入力要素を作成
function createSiteElement(site) {
  const siteElement = document.createElement('div');
  siteElement.className = 'site';
  siteElement.innerHTML = `
    <input type="text" value="${site}" class="site-input" placeholder="example.com">
    <button class="remove-site remove-btn">-</button>
  `;

  // サイト削除ボタンのイベントリスナー
  const removeBtn = siteElement.querySelector('.remove-site');
  if (removeBtn) {
    removeBtn.addEventListener('click', function () {
      siteElement.remove();
    });
  }

  return siteElement;
}

// 時間帯入力要素を作成
function createTimeRangeElement(start, end) {
  const timeRangeElement = document.createElement('div');
  timeRangeElement.className = 'time-range';
  timeRangeElement.innerHTML = `
    <label>開始: <input type="time" class="start-time" value="${start || '09:00'}"></label>
    <label>終了: <input type="time" class="end-time" value="${end || '17:00'}"></label>
    <button class="remove-time-range remove-btn">-</button>
  `;

  // 時間帯削除ボタンのイベントリスナー
  const removeBtn = timeRangeElement.querySelector('.remove-time-range');
  if (removeBtn) {
    removeBtn.addEventListener('click', function () {
      timeRangeElement.remove();
    });
  }

  return timeRangeElement;
}

