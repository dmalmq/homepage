const status = document.body.dataset.spotifyStatus || 'failed';
try {
  if (window.opener) window.opener.postMessage({ spotify: status }, location.origin);
} catch {
  // The visible message still tells the user what happened.
}
window.close();
