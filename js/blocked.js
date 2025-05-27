document.addEventListener('DOMContentLoaded', () => {
  const goBackButton = document.getElementById('goBackButton');
  const urlParams = new URLSearchParams(window.location.search);
  const originalUrl = urlParams.get('originalUrl');

  if (goBackButton && originalUrl) {
    goBackButton.addEventListener('click', () => {
      // Try to inform the background script to check if unblocking is allowed.
      // However, direct navigation is simpler if we assume the user clicks this
      // when they believe the block should be over.
      // For a more robust solution, background would re-evaluate and redirect if necessary.
      window.location.href = decodeURIComponent(originalUrl);
    });
  } else if (goBackButton) {
    goBackButton.textContent = '元のURLが見つかりません';
    goBackButton.disabled = true;
  }
}); 