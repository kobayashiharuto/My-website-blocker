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
});