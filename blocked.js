// 現在時刻を表示する関数
function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString();
  const clockElement = document.getElementById('current-time');
  if (clockElement) {
    clockElement.textContent = timeString;
  }
}

// URLパラメータから元のURLを取得
function getOriginalUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('url') || '';
}

// 元のURLを保存する関数
function saveOriginalUrl(url) {
  if (url) {
    localStorage.setItem('blockedUrl', url);
  }
}

// 保存されたURLを読み込む関数
function loadSavedUrl() {
  return localStorage.getItem('blockedUrl') || '';
}

// 休憩モード情報を取得する
async function checkBreakMode() {
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getBreakInfo' }, (response) => {
        resolve(response);
      });
    });

    if (response && response.success && response.breakInfo) {
      return response.breakInfo;
    }
  } catch (error) {
    console.error('休憩モード情報取得エラー:', error);
  }

  return { active: false, endTime: null };
}

// 休憩モードの場合は元のページに戻る
async function redirectIfBreakMode() {
  const breakInfo = await checkBreakMode();

  if (breakInfo.active && breakInfo.endTime) {
    const now = new Date().getTime();
    if (now < breakInfo.endTime) {
      // 休憩モード中なら元のURLにリダイレクト
      const originalUrl = getOriginalUrl() || loadSavedUrl();
      if (originalUrl) {
        window.location.href = originalUrl;
      }
    }
  }
}

// DOMがロードされたら初期化
document.addEventListener('DOMContentLoaded', function () {
  // 時計を初期化
  updateClock();
  setInterval(updateClock, 1000);

  // URLを取得して表示
  const originalUrl = getOriginalUrl();
  const urlElement = document.getElementById('blocked-url');

  if (originalUrl) {
    // 新しいURLがある場合は保存
    saveOriginalUrl(originalUrl);
    if (urlElement) {
      urlElement.textContent = originalUrl;
    }
  } else {
    // 保存されたURLを表示
    const savedUrl = loadSavedUrl();
    if (urlElement && savedUrl) {
      urlElement.textContent = savedUrl;
    }
  }

  // 戻るボタンの設定
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', function () {
      const urlToReturn = originalUrl || loadSavedUrl();
      if (urlToReturn) {
        window.location.href = urlToReturn;
      }
    });
  }

  // 休憩モード中なら元のページに戻る
  redirectIfBreakMode();

  // 休憩状態を定期的にチェック（10秒ごと）
  setInterval(redirectIfBreakMode, 10000);
});