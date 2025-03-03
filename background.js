// 休憩モード情報
let breakInfo = {
  active: false,
  endTime: null
};

// デバッグ用ロギング関数
function log(message) {
  console.log(`[WebBlocker] ${message}`);
}

// 設定をロード
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

// 休憩開始機能
function startBreak(durationMinutes) {
  log(`休憩モードを開始: ${durationMinutes}分間`);

  const endTime = new Date().getTime() + (durationMinutes * 60 * 1000);

  breakInfo = {
    active: true,
    endTime: endTime
  };

  // 休憩情報を保存
  chrome.storage.local.set({ breakInfo: breakInfo });

  // 休憩終了のアラームを設定
  setBreakEndAlarm();

  return breakInfo;
}

// 休憩終了アラームをセット
function setBreakEndAlarm() {
  if (!breakInfo.active || !breakInfo.endTime) return;

  // まず既存のアラームをクリア
  chrome.alarms.clear("breakEnd", () => {
    // 現在時刻と終了時刻の差分を計算（分単位）
    const remainingMinutes = (breakInfo.endTime - new Date().getTime()) / (60 * 1000);

    if (remainingMinutes <= 0) {
      // 既に終了時間を過ぎている場合は休憩モードを終了
      endBreak();
      return;
    }

    // 休憩終了アラームを設定
    chrome.alarms.create("breakEnd", { delayInMinutes: remainingMinutes });
    log(`休憩終了アラームを設定: 残り約${Math.round(remainingMinutes)}分`);
  });
}

// 休憩終了処理
function endBreak() {
  log("休憩モードを終了します");

  breakInfo = {
    active: false,
    endTime: null
  };

  // 休憩情報を更新
  chrome.storage.local.set({ breakInfo: breakInfo });

  // アラームを削除
  chrome.alarms.clear("breakEnd");

  // すべてのタブを再チェック
  checkAllTabs();
}

// すべてのタブをチェックする関数
function checkAllTabs() {
  chrome.tabs.query({}, function (tabs) {
    for (const tab of tabs) {
      // chrome://などの特殊なURLは無視
      if (!tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("about:") ||
        tab.url.startsWith(chrome.runtime.getURL(''))) {
        continue;
      }

      // ブロックすべきURLかチェック
      if (shouldBlockUrl(tab.url)) {
        log(`休憩終了時にブロック: ${tab.url}`);
        // ブロックページにリダイレクト
        const blockUrl = chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(tab.url)}`);
        chrome.tabs.update(tab.id, { url: blockUrl });
      }
    }
  });
}

// 初期化処理
function initialize() {
  log("拡張機能を初期化しています...");

  // ストレージから設定と休憩情報をロード
  chrome.storage.local.get(['settings', 'breakInfo'], function (result) {
    if (result.settings) {
      settings = result.settings;
      log("設定をロードしました");
    } else {
      // 初期設定を保存
      chrome.storage.local.set({ settings: settings });
      log("デフォルト設定を保存しました");
    }

    // 休憩情報があれば読み込む
    if (result.breakInfo) {
      breakInfo = result.breakInfo;

      // 休憩中だが、既に終了時間を過ぎている場合はリセット
      if (breakInfo.active && breakInfo.endTime && new Date().getTime() > breakInfo.endTime) {
        breakInfo = { active: false, endTime: null };
        chrome.storage.local.set({ breakInfo: breakInfo });
        log("期限切れの休憩モードをリセットしました");
      } else if (breakInfo.active) {
        log(`休憩モードを再開: ${new Date(breakInfo.endTime).toLocaleTimeString()}まで`);
        // 休憩終了アラームを再設定
        setBreakEndAlarm();
      }
    }

    // アラームをセットアップ
    setupBlockingSystem();
  });
}

// 設定が変更されたら更新
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace === 'local' && changes.settings) {
    log("設定が更新されました");
    settings = changes.settings.newValue;
    setupBlockingSystem(); // 設定変更時にアラームを再設定
  }
});

// ブロッキングシステムのセットアップ
function setupBlockingSystem() {
  // 既存のアラームをクリア
  chrome.alarms.clear("blockCheck", () => {
    log("既存のアラームをクリアしました");

    // 新しいアラームを作成（30秒ごと）
    chrome.alarms.create("blockCheck", { periodInMinutes: 0.5 });
    log("新しいアラームを設定しました (30秒間隔)");

    // 初回実行（即時）
    setTimeout(checkActiveTab, 1000);
  });
}

// アラームイベントのリスナー
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === "blockCheck") {
    log("アラームが発火: アクティブタブをチェックします");
    checkActiveTab();
  } else if (alarm.name === "breakEnd") {
    log("休憩終了アラームが発火");
    endBreak();
  }
});

// アクティブなタブのみをチェック
function checkActiveTab() {
  if (!settings || !settings.enabled) {
    log("ブロッカーは無効化されています");
    return;
  }

  // 休憩モードがアクティブならチェックしない
  if (breakInfo.active && breakInfo.endTime) {
    const now = new Date().getTime();
    if (now < breakInfo.endTime) {
      log("休憩モード中: アクティブタブをチェックしません");
      return;
    } else {
      // 休憩時間が終了している場合は休憩モードを終了
      endBreak();
    }
  }

  log("アクティブタブをチェック中...");
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || tabs.length === 0) {
      log("アクティブタブが見つかりません");
      return;
    }

    const tab = tabs[0];
    if (!tab || !tab.url) return;

    // chrome://やchrome-extension://で始まるURLは無視
    if (tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("about:") ||
      tab.url.startsWith(chrome.runtime.getURL(''))) {
      return;
    }

    log(`アクティブタブをチェック: ${tab.url}`);

    try {
      // ブロックチェック
      if (shouldBlockUrl(tab.url)) {
        log(`ブロック決定: ${tab.url}`);
        // ブロックページに切り替え（元のURLをパラメータとして渡す）
        const blockUrl = chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(tab.url)}`);
        chrome.tabs.update(tab.id, { url: blockUrl });
      }
    } catch (error) {
      console.error(`タブチェックエラー (${tab.url}):`, error);
    }
  });
}

// メッセージハンドラ
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'startBreak') {
    const duration = request.duration || 30; // デフォルトは30分
    const breakInfoResult = startBreak(duration);
    sendResponse({ success: true, breakInfo: breakInfoResult });
    return true;
  }
  else if (request.action === 'endBreak') {
    endBreak();
    sendResponse({ success: true });
    return true;
  }
  else if (request.action === 'getBreakInfo') {
    sendResponse({ success: true, breakInfo: breakInfo });
    return true;
  }
});

// タブがアクティブになったときのイベント
chrome.tabs.onActivated.addListener(function (activeInfo) {
  log("タブがアクティブになりました: " + activeInfo.tabId);
  setTimeout(checkActiveTab, 500); // 少し遅延を入れて確実にURL情報を取得
});

// ナビゲーションが開始されたときに実行
chrome.webNavigation.onBeforeNavigate.addListener(function (details) {
  // メインフレームのみを処理（iframeなどは無視）
  if (details.frameId !== 0) return;

  // 拡張機能が無効の場合はすべて許可
  if (!settings || !settings.enabled) return;

  // chrome://やchrome-extension://で始まるURLは無視
  if (details.url.startsWith("chrome://") ||
    details.url.startsWith("chrome-extension://") ||
    details.url.startsWith("about:") ||
    details.url.startsWith(chrome.runtime.getURL(''))) {
    return;
  }

  log(`ナビゲーション: ${details.url}`);

  // ブロックチェック
  if (shouldBlockUrl(details.url)) {
    log(`ナビゲーションをブロック: ${details.url}`);
    // 現在のタブでブロックページに遷移（元のURLをパラメータとして渡す）
    const blockUrl = chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(details.url)}`);
    chrome.tabs.update(details.tabId, { url: blockUrl });
  }
});

// URLをブロックすべきかどうかを判断する関数
function shouldBlockUrl(url) {
  try {
    // 休憩モードがアクティブならブロックしない
    if (breakInfo.active && breakInfo.endTime && new Date().getTime() < breakInfo.endTime) {
      log(`休憩モード中: ${url} はブロックされません`);
      return false;
    }

    // URLからドメインを抽出
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    log(`ドメインを検証: ${domain}`);

    // アプリケーションプロトコルは無視（chrome://など）
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      log(`非HTTP/HTTPSプロトコル: ${urlObj.protocol} - スキップ`);
      return false;
    }

    // 現在の時刻を取得
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes; // 分単位に変換

    log(`現在時刻: ${hours}:${minutes} (${currentTime}分)`);

    // settings.setsが存在するか確認
    if (!settings.sets || !Array.isArray(settings.sets) || settings.sets.length === 0) {
      log("有効なセット設定がありません");
      return false;
    }

    // 各セットをチェック
    for (const set of settings.sets) {
      // 必要なプロパティが存在するかチェック
      if (!set || !set.timeRanges || !Array.isArray(set.timeRanges) || !set.sites || !Array.isArray(set.sites)) {
        log("セットの形式が無効です - スキップ");
        continue;
      }

      log(`セットを検証: ${set.name} (${set.isWhitelist ? 'ホワイトリスト' : 'ブラックリスト'})`);

      // 各時間帯をチェック
      for (const range of set.timeRanges) {
        if (!range || !range.start || !range.end) {
          continue;
        }

        // 時間範囲の開始・終了を分単位に変換
        const [startHours, startMinutes] = range.start.split(':').map(Number);
        const [endHours, endMinutes] = range.end.split(':').map(Number);

        const startTime = startHours * 60 + startMinutes;
        const endTime = endHours * 60 + endMinutes;

        log(`時間帯: ${range.start}-${range.end} (${startTime}分-${endTime}分)`);

        // 現在の時刻が範囲内かチェック
        const isInTimeRange = currentTime >= startTime && currentTime <= endTime;

        if (isInTimeRange) {
          log(`時間帯内: ${range.start}-${range.end}`);

          // ドメインの確認（サブドメインも含めて）
          const isDomainInList = set.sites.some(site => {
            if (!site) return false;
            const match = domain === site || domain.endsWith('.' + site);
            if (match) log(`ドメインマッチ: ${domain} -> ${site}`);
            return match;
          });

          // ホワイトリストモードの場合
          if (set.isWhitelist) {
            if (!isDomainInList) {
              log(`ホワイトリスト ${set.name}: ${domain} は許可リストにないためブロック`);
              return true; // ブロック
            } else {
              log(`ホワイトリスト ${set.name}: ${domain} は許可リストにあるため許可`);
            }
          }
          // ブラックリストモードの場合
          else {
            if (isDomainInList) {
              log(`ブラックリスト ${set.name}: ${domain} はブロックリストにあるためブロック`);
              return true; // ブロック
            } else {
              log(`ブラックリスト ${set.name}: ${domain} はブロックリストにないため許可`);
            }
          }
        } else {
          log(`時間帯外: ${range.start}-${range.end}`);
        }
      }
    }

    // ブロック条件に当てはまらない場合
    log(`${domain} はブロック条件に当てはまらないため許可`);
    return false;
  } catch (error) {
    console.error("URL処理エラー:", error);
    return false;
  }
}

// 拡張機能起動時に初期化
initialize();

// Service Workerの起動確認
log("Service Worker が起動しました");