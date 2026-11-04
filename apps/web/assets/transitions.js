(function () {
  'use strict';

  var seen = new Set();
  var connection = navigator.connection || {};
  var pointerTimer = null;

  function canPrefetch() {
    return !connection.saveData &&
      !['slow-2g', '2g'].includes(connection.effectiveType || '');
  }

  function prefetch(url) {
    if (!canPrefetch() || seen.has(url)) return;
    var target = new URL(url, location.href);
    if (target.origin !== location.origin) return;
    seen.add(url);
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = target.href;
    link.as = 'document';
    document.head.appendChild(link);
  }

  document.addEventListener('pointerover', function (event) {
    var anchor = event.target.closest('a[href]');
    if (!anchor || anchor.dataset.noPrefetch !== undefined) return;
    window.clearTimeout(pointerTimer);
    pointerTimer = window.setTimeout(function () {
      prefetch(anchor.href);
    }, 80);
  }, { passive: true });

  document.addEventListener('pointerout', function (event) {
    var anchor = event.target.closest('a[href]');
    if (!anchor) return;
    var related = event.relatedTarget;
    if (!related || !anchor.contains(related)) window.clearTimeout(pointerTimer);
  }, { passive: true });

  document.addEventListener('focusin', function (event) {
    var anchor = event.target.closest('a[href]');
    if (anchor && anchor.dataset.noPrefetch === undefined) prefetch(anchor.href);
  });

  document.addEventListener('focusout', function () {
    window.clearTimeout(pointerTimer);
  });

  window.addEventListener('pagehide', function () {
    try {
      sessionStorage.setItem(
        'knowtree.scroll:' + location.pathname + location.search,
        String(window.scrollY)
      );
    } catch (error) {
      /* Storage denial must not block navigation. */
    }
  });

  window.addEventListener('pageshow', function () {
    try {
      var saved = sessionStorage.getItem(
        'knowtree.scroll:' + location.pathname + location.search
      );
      if (saved !== null) {
        window.requestAnimationFrame(function () {
          window.scrollTo(0, Number(saved) || 0);
        });
      }
    } catch (error) {
      /* Storage denial must not block rendering. */
    }
  });

  window.KTTransitions = { prefetch: prefetch };
})();
