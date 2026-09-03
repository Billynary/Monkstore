// Home page. Shows an optional notice from the URL.
import { initNav } from './nav.js';

document.addEventListener('DOMContentLoaded', () => {
  initNav();

  // Convenience: pages can link here with ?ref=<message> to show a banner.
  const ref = new URLSearchParams(location.search).get('ref');
  const notice = document.getElementById('notice');
  if (ref && notice) {
    // [HIDDEN] URL parameter rendered via innerHTML (DOM-based XSS).
    notice.innerHTML = `👋 ${ref}`;
    notice.style.display = 'block';
  }
});
