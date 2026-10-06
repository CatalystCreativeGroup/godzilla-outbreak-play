// iPad Safari ignores "user-scalable=no", so a quick double-tap or a two-finger pinch on the game could zoom the
// whole page in ("the screen zooms in and you can't see everything"). This blocks those zooms and, if the page
// somehow got zoomed anyway, snaps it back.

// two-finger pinch (Safari's own gesture events)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}
// double-tap to zoom
let lastTouchEnd = 0, lastTarget = null;
document.addEventListener('touchend', e => {
  const now = performance.now(), t = e.target;
  const quickRepeat = now - lastTouchEnd < 350 && t === lastTarget;
  if (quickRepeat && !t.closest?.('button, a, input, #minimap')) e.preventDefault();
  lastTouchEnd = now; lastTarget = t;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

// if the page is zoomed in anyway, re-applying the viewport settings makes Safari zoom back out
const meta = document.querySelector('meta[name="viewport"]');
const BASE = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
function unzoom() {
  if (!meta || !window.visualViewport || window.visualViewport.scale <= 1.01) return;
  meta.setAttribute('content', BASE + ', minimum-scale=1');
  requestAnimationFrame(() => meta.setAttribute('content', BASE));
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', unzoom);
window.addEventListener('orientationchange', () => setTimeout(unzoom, 300));
