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

// 休憩情報
let breakInfo = {
  active: false,
  endTime: null
};

// 選択されたインポートファイル
let selectedImportFile = null;

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', function () {
  initializePopup();
});

// ポップアップの初期化
function initializePopup() {
  // 設定を読み込み
  chrome.storage.local.get(['settings', 'breakInfo'], function (result) {
    if (result.settings) {
      settings = result.settings;
    }

    if (result.breakInfo) {
      breakInfo = result.breakInfo;
    }

    // UI更新
    updateUI();

    // イベントリスナーのセットアップ
    setupEventListeners();

    // 休憩モードのUIを更新
    updateBreakModeUI();
  });
}

// 休憩モードのUIを更新
function updateBreakModeUI() {
  const breakModeSection = document.getElementById('break-mode-section');
  const takeBreakBtn = document.getElementById('take-break-btn');
  const breakTimer = document.getElementById('break-timer');

  if (!breakModeSection || !takeBreakBtn || !breakTimer) {
    return;
  }

  if (breakInfo.active && breakInfo.endTime) {
    // 休憩モードがアクティブな場合
    const endTime = new Date(breakInfo.endTime);
    const now = new Date();
    const remainingMs = endTime - now;

    if (remainingMs <= 0) {
      // 休憩時間が終了している場合
      breakTimer.textContent = '';
      takeBreakBtn.textContent = '30分間の休憩を取る';
      takeBreakBtn.disabled = false;
    } else {
      // 休憩中の場合
      const remainingMinutes = Math.floor(remainingMs / (60 * 1000));
      const remainingSeconds = Math.floor((remainingMs % (60 * 1000)) / 1000);

      breakTimer.textContent = `残り時間: ${remainingMinutes}分 ${remainingSeconds}秒`;
      takeBreakBtn.textContent = '休憩を終了する';
      takeBreakBtn.disabled = false;

      // タイマーを1秒ごとに更新
      setTimeout(updateBreakModeUI, 1000);
    }
  } else {
    // 休憩モードが無効な場合
    breakTimer.textContent = '';
    takeBreakBtn.textContent = '30分間の休憩を取る';
    takeBreakBtn.disabled = false;
  }
}

// UIを更新
function updateUI() {
  const enableBlocker = document.getElementById('enable-blocker');
  if (enableBlocker) {
    enableBlocker.checked = settings.enabled;
  }

  // セットを表示
  renderSets();
}

// イベントリスナーのセットアップ
function setupEventListeners() {
  // 有効/無効チェックボックスのイベントリスナー
  const enableBlocker = document.getElementById('enable-blocker');
  if (enableBlocker) {
    enableBlocker.addEventListener('change', function (e) {
      if (e.target.checked) {
        // 有効化は簡単に
        settings.enabled = true;
        updateUI();
        chrome.storage.local.set({ settings: settings });
        showMessage("ブロッカーを有効化しました", "success");
      } else {
        // 無効化は複雑なチャレンジを経て
        e.target.checked = true; // 一旦元に戻す
        disableBlockerWithChallenge();
      }
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
        showMessage("設定を保存しました", "success");
      });
    });
  }

  // ファイル選択イベントリスナー
  const importFile = document.getElementById('import-file');
  if (importFile) {
    importFile.addEventListener('change', function (e) {
      const fileDisplay = document.getElementById('filename-display');
      if (e.target.files.length > 0) {
        selectedImportFile = e.target.files[0];
        if (fileDisplay) {
          fileDisplay.textContent = selectedImportFile.name;
        }
      } else {
        selectedImportFile = null;
        if (fileDisplay) {
          fileDisplay.textContent = "ファイルが選択されていません";
        }
      }
    });
  }

  // インポートボタンのイベントリスナー
  const importBtn = document.getElementById('import-btn');
  if (importBtn) {
    importBtn.addEventListener('click', function () {
      if (!selectedImportFile) {
        showMessage("ファイルが選択されていません", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const importedSettings = JSON.parse(e.target.result);

          // 設定の検証
          if (!validateSettings(importedSettings)) {
            showMessage("不正な設定ファイルです", "error");
            return;
          }

          // 設定を適用
          settings = importedSettings;
          chrome.storage.local.set({ settings: settings }, function () {
            updateUI();
            showMessage("設定をインポートしました", "success");
          });
        } catch (err) {
          console.error("インポートエラー:", err);
          showMessage("インポートに失敗しました: " + err.message, "error");
        }
      };

      reader.onerror = function () {
        showMessage("ファイルの読み込みに失敗しました", "error");
      };

      reader.readAsText(selectedImportFile);
    });
  }

  // エクスポートボタンのイベントリスナー
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      updateSettingsFromUI(); // 現在のUI状態を設定に反映

      // JSON文字列の作成
      const settingsJson = JSON.stringify(settings, null, 2);

      // ファイルとしてダウンロード
      const blob = new Blob([settingsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'web-blocker-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage("設定をエクスポートしました", "success");
    });
  }

  const takeBreakBtn = document.getElementById('take-break-btn');
  if (takeBreakBtn) {
    takeBreakBtn.addEventListener('click', function () {
      if (breakInfo.active) {
        // 休憩中なら終了する
        chrome.runtime.sendMessage({ action: 'endBreak' }, function (response) {
          if (response && response.success) {
            breakInfo = { active: false, endTime: null };
            updateBreakModeUI();
            showMessage("休憩を終了しました", "success");
          }
        });
      } else {
        // 休憩を開始する
        chrome.runtime.sendMessage({ action: 'startBreak', duration: 30 }, function (response) {
          if (response && response.success) {
            breakInfo = response.breakInfo;
            updateBreakModeUI();
            showMessage("30分間の休憩を開始しました", "success");
          }
        });
      }
    });
  }
}

// 設定の検証
function validateSettings(settings) {
  // 基本構造のチェック
  if (!settings || typeof settings !== 'object') {
    return false;
  }

  // enabledプロパティが存在するか
  if (typeof settings.enabled !== 'boolean') {
    return false;
  }

  // setsプロパティが配列であるか
  if (!Array.isArray(settings.sets)) {
    return false;
  }

  // 各セットの検証
  for (const set of settings.sets) {
    // 必須プロパティの存在チェック
    if (!set.name || typeof set.isWhitelist !== 'boolean' ||
      !Array.isArray(set.sites) || !Array.isArray(set.timeRanges)) {
      return false;
    }

    // 時間範囲の検証
    for (const range of set.timeRanges) {
      if (!range.start || !range.end) {
        return false;
      }
    }
  }

  return true;
}

// 複雑なチャレンジを通じてブロッカーを無効化する関数
function disableBlockerWithChallenge() {
  const challenges = [
    {
      type: "math",
      generate: () => {
        const num1 = Math.floor(Math.random() * 20) + 10;
        const num2 = Math.floor(Math.random() * 20) + 10;
        const operation = ['+', '-', '*'][Math.floor(Math.random() * 3)];
        let answer;

        switch (operation) {
          case '+': answer = num1 + num2; break;
          case '-': answer = num1 - num2; break;
          case '*': answer = num1 * num2; break;
        }

        return {
          question: `${num1} ${operation} ${num2} = ?`,
          answer: answer.toString()
        };
      }
    },
    {
      type: "typing",
      generate: () => {
        const phrases = [
          "私は時間を大切にします",
          "集中力を維持して目標を達成します",
          "今この作業が最も重要であることを自覚しています",
          "短期的な満足より長期的な成功を選びます"
        ];
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        return {
          question: `次の文章を正確に入力してください: "${phrase}"`,
          answer: phrase
        };
      }
    },
    {
      type: "waiting",
      generate: () => {
        const seconds = Math.floor(Math.random() * 10) + 20; // 20-30秒のランダム待機
        return {
          question: `解除するには${seconds}秒間待ってください`,
          seconds: seconds
        };
      }
    }
  ];

  // チャレンジを開始する
  startChallengeSequence(challenges, 0);
}

// チャレンジシーケンスを実行
function startChallengeSequence(challenges, index) {
  if (index >= challenges.length) {
    // すべてのチャレンジをクリアしたら解除
    settings.enabled = false;
    updateUI();
    chrome.storage.local.set({ settings: settings });
    showMessage("ブロッカーを解除しました", "success");
    return;
  }

  const challenge = challenges[index];
  const generated = challenge.generate();

  // チャレンジUIを表示
  const challengeDiv = document.createElement('div');
  challengeDiv.className = 'challenge-container';

  if (challenge.type === "waiting") {
    // 待機チャレンジ
    challengeDiv.innerHTML = `
      <h3>チャレンジ ${index + 1}/${challenges.length}</h3>
      <p>${generated.question}</p>
      <div class="progress-container">
        <div class="progress-bar" id="waiting-progress"></div>
      </div>
      <p id="waiting-time">${generated.seconds}</p>
      <button id="cancel-challenge" class="btn btn-secondary">キャンセル</button>
    `;

    document.body.appendChild(challengeDiv);

    // キャンセルボタンのイベントリスナー
    document.getElementById('cancel-challenge').addEventListener('click', function () {
      challengeDiv.remove();
    });

    // プログレスバーとカウントダウン
    const progressBar = document.getElementById('waiting-progress');
    const timeDisplay = document.getElementById('waiting-time');
    let timeLeft = generated.seconds;
    const totalTime = generated.seconds;

    const timer = setInterval(() => {
      timeLeft -= 1;
      progressBar.style.width = `${(totalTime - timeLeft) / totalTime * 100}%`;
      timeDisplay.textContent = timeLeft;

      if (timeLeft <= 0) {
        clearInterval(timer);
        challengeDiv.remove();
        startChallengeSequence(challenges, index + 1);
      }
    }, 1000);
  } else {
    // 入力チャレンジ
    challengeDiv.innerHTML = `
      <h3>チャレンジ ${index + 1}/${challenges.length}</h3>
      <p>${generated.question}</p>
      <input type="text" id="challenge-answer" class="challenge-input" placeholder="答えを入力">
      <div class="button-group">
        <button id="submit-challenge" class="btn btn-primary">回答</button>
        <button id="cancel-challenge" class="btn btn-secondary">キャンセル</button>
      </div>
      <p id="challenge-feedback" class="feedback"></p>
    `;

    document.body.appendChild(challengeDiv);

    // 回答チェック
    document.getElementById('submit-challenge').addEventListener('click', function () {
      const answer = document.getElementById('challenge-answer').value;
      const feedback = document.getElementById('challenge-feedback');

      if (answer === generated.answer) {
        feedback.textContent = "正解です！";
        feedback.style.color = "green";

        setTimeout(() => {
          challengeDiv.remove();
          startChallengeSequence(challenges, index + 1);
        }, 1000);
      } else {
        feedback.textContent = "不正解です。もう一度試してください。";
        feedback.style.color = "red";
      }
    });

    // キャンセルボタン
    document.getElementById('cancel-challenge').addEventListener('click', function () {
      challengeDiv.remove();
    });

    // Enterキーでの送信
    document.getElementById('challenge-answer').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        document.getElementById('submit-challenge').click();
      }
    });
  }
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

// メッセージ表示関数
function showMessage(text, type) {
  const message = document.createElement('div');
  message.className = `message ${type}`;
  message.textContent = text;
  document.body.appendChild(message);

  setTimeout(() => message.remove(), 3000);
}