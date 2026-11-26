/* Behaviour for the static error pages (404, 403, 500, 503, offline). Loaded with defer; no inline scripts. */
(function () {
  'use strict';

  function each(selector, fn) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i += 1) fn(nodes[i]);
  }
  function say(text, isError) {
    var el = document.getElementById('err-status');
    if (!el) return;
    el.classList.toggle('err-status--error', !!isError);
    el.textContent = text;
  }

  // Show a safe, redacted path context (pathname only, never query/hash tokens) when it adds useful detail.
  (function showSafePathContext() {
    var box = document.getElementById('err-context');
    if (!box) return;
    var page = document.body ? document.body.getAttribute('data-error-page') : '';
    var path = String(window.location.pathname || '').replace(/[\x00-\x1f\x7f]/g, '');
    if (!path || path === '/' || /\/(?:403|404|500|503|offline)\.html$/i.test(path)) return;
    if (path.length > 96) path = path.slice(0, 93) + '…';
    box.textContent = (page === '403' ? 'Blocked path: ' : 'Requested path: ') + path;
    box.hidden = false;
  }());

  // Reveal "Go back" only when there is safe same-origin history to return to.
  function canGoBackSafely() {
    if (!window.history || window.history.length <= 1) return false;
    if (!document.referrer) return false;
    try {
      return new URL(document.referrer).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }
  if (canGoBackSafely()) {
    each('[data-action="back"]', function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () { window.history.back(); });
    });
  }

  // 403: offer sign-in only when the blocked address is the admin area. Nowhere else do we hint that it exists.
  each('[data-show-if-path]', function (el) {
    var needle = String(el.getAttribute('data-show-if-path') || '').replace(/^\/+|\/+$/g, '');
    if (!needle) return;
    var segments = String(window.location.pathname || '').split('/').filter(Boolean);
    if (segments.indexOf(needle) >= 0) el.hidden = false;
  });

  // 500 / 503: retry with offline check and short cooldown so a tired server is not hammered.
  var reloadCooldownMs = 900;
  each('[data-action="reload"]', function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        say('Your device appears to be offline. Reconnect to the internet and try again.', true);
        return;
      }
      btn.disabled = true;
      say('Trying again…');
      window.setTimeout(function () { window.location.reload(); }, reloadCooldownMs);
    });
  });

  // Offline: only the address the person came from is allowed (same origin, relative), never an arbitrary URL or protocol.
  function returnTarget() {
    var from = new URLSearchParams(window.location.search).get('from') || '';
    var validShape = /^[A-Za-z0-9_\-./]+(\?[A-Za-z0-9_\-.=&%]*)?(#[A-Za-z0-9_\-]*)?$/.test(from);
    if (!validShape || from.indexOf('..') >= 0 || from.indexOf('//') >= 0 || from.charAt(0) === '/') return 'index.html';
    try {
      var probe = new URL(from, 'https://blitz.local/');
      if (probe.origin !== 'https://blitz.local') return 'index.html';
      return from;
    } catch (e) {
      return 'index.html';
    }
  }

  function runRecheck(btn) {
    if (btn) btn.disabled = true;
    say('Checking your connection…');
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = window.setTimeout(function () { if (controller) controller.abort(); }, 5000);
    fetch(returnTarget(), { method: 'HEAD', cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (r) {
        window.clearTimeout(timer);
        if (r && (r.ok || r.status < 500)) { window.location.replace(returnTarget()); return; }
        throw new Error('offline');
      })
      .catch(function () {
        window.clearTimeout(timer);
        if (btn) btn.disabled = false;
        say('Still offline. Please check your Wi-Fi or mobile data and try again.', true);
      });
  }

  each('[data-action="recheck"]', function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () { runRecheck(btn); });
    window.addEventListener('online', function () { runRecheck(btn); });
  });
}());
