/*
 * Behaviour shared by the static error pages (404, 403, 500, 503, offline).
 * The pages work without JavaScript (every action that needs it starts hidden and plain links always work);
 * this file only reveals the buttons that need a script.
 */
(function () {
  'use strict';

  var status = document.getElementById('err-status');
  function say(text) { if (status) status.textContent = text; }
  function each(sel, fn) { [].forEach.call(document.querySelectorAll(sel), fn); }

  // "Go back" only makes sense when there is somewhere to go back to.
  each('[data-action="back"]', function (btn) {
    if (window.history.length > 1) btn.hidden = false;
    btn.addEventListener('click', function () { window.history.back(); });
  });

  // 403: offer sign-in only when the blocked address is the admin area. Nowhere else do we hint that it exists.
  each('[data-show-if-path]', function (el) {
    if (window.location.pathname.indexOf(el.getAttribute('data-show-if-path')) >= 0) el.hidden = false;
  });

  // 500 / 503: retry, with a short pause so a tired server is not hammered by repeated clicks.
  each('[data-action="reload"]', function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      say('Trying again…');
      window.setTimeout(function () { window.location.reload(); }, 800);
    });
  });

  // Offline: only the address the person came from is allowed (same site, relative), never an arbitrary URL.
  function returnTarget() {
    var from = new URLSearchParams(window.location.search).get('from') || '';
    return /^[A-Za-z0-9_\-./]+(\?[A-Za-z0-9_\-.=&%]*)?(#[A-Za-z0-9_\-]*)?$/.test(from) && from.indexOf('..') < 0 && from.charAt(0) !== '/' ? from : 'index.html';
  }
  each('[data-action="recheck"]', function (btn) {
    btn.hidden = false;
    function check() {
      btn.disabled = true;
      say('Checking your connection…');
      fetch('index.html', { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('not ok');
        say('Back online. Taking you back…');
        window.location.replace(returnTarget());
      }).catch(function () {
        btn.disabled = false;
        say("Still offline. We'll keep trying when your connection returns.");
      });
    }
    btn.addEventListener('click', check);
    window.addEventListener('online', check);
  });
}());
