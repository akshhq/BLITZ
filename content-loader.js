
(function () {
  'use strict';

  var E = window.BLITZ_ERRORS || null;       // error-catalog.js + error-handler.js, loaded first; the page still works without them
  if (E) E.install();

  var DATA = window.BLITZ_DATA;
  var COLLECTIONS = (window.BLITZ_MAP && window.BLITZ_MAP.COLLECTIONS) || [];
  var cfg = window.BLITZ_CONFIG || {};
  var url = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  var key = String(cfg.supabaseKey || '');
  var CACHE_KEY = 'blitz:content:v1';
  var CACHE_MAX_AGE = 30 * 24 * 3600 * 1000;
  var REFETCH_AFTER = 2 * 60 * 1000; // when a tab becomes visible again
  var FETCH_TIMEOUT = 8000;
  var AUTO_RETRIES = 2;              // after the first try; bounded, transient failures only

  var listeners = [];
  var statusListeners = [];
  var changed = false;

  /*
   * What the visitor is looking at, always one of:
   *   source 'live'      this response just came from the database
   *   source 'cache'     a copy this browser saved earlier (cachedAt says when)
   *   source 'snapshot'  the content bundled with the site (data.js)
   * status: 'snapshot' (live updates not configured) | 'pending' | 'live' | 'fallback' (live was tried and failed)
   */
  var live = window.BLITZ_LIVE = {
    enabled: false,
    status: 'snapshot',
    source: 'snapshot',
    cachedAt: 0,
    lastSync: 0,
    error: null,
    onChange: function (fn) {
      listeners.push(fn);
      if (changed) fn();
    },
    onStatus: function (fn) {
      statusListeners.push(fn);
      try { fn(live); } catch (e) { report(e, 'status-listener'); }
    },
    retry: function () { if (live.enabled) fetchLive(true); }
  };

  function report(err, operation, extra) {
    if (E) return E.report(err, Object.assign({ operation: operation, service: 'supabase', silent: true }, extra || {}));
    if (window.console && console.warn) console.warn('[BLITZ] ' + operation + ':', err && err.message);
    return null;
  }

  function looksPrivileged(value) {
    if (/^sb_secret_/.test(value)) return true;
    var parts = value.split('.');
    if (parts.length !== 3) return false;
    try {
      var json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json).role === 'service_role';
    } catch (e) { return false; }
  }

  function dateText(ms) {
    try { return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  /* Say plainly which copy is on screen. Silence only when live content is on screen or live updates were never set up. */
  function renderNotice() {
    if (!E || !E.ui) return;
    if (live.status === 'live' || live.status === 'pending' || live.status === 'snapshot') { E.ui.hideNotice('content-status'); return; }
    var actions = live.error && live.error.code !== 'BLITZ-CFG-001' && live.error.code !== 'BLITZ-CFG-003'
      ? [{ label: 'Try again', onClick: function () { live.retry(); }, dismiss: false }] : [];
    var cached = live.source === 'cache';
    E.ui.showNotice({
      id: 'content-status',
      kind: 'warning',
      title: cached ? 'Showing saved content.' : 'Showing built-in content.',
      message: cached
        ? 'We could not reach live updates, so this is the copy saved on ' + dateText(live.cachedAt) + '. Events and announcements may be out of date.'
        : 'Live updates are unavailable right now, so events and announcements may be out of date.',
      code: live.error ? live.error.code : '',
      actions: actions
    });
  }

  function setStatus(status, source, error) {
    live.status = status;
    live.source = source;
    live.error = error || null;
    var root = document.documentElement;
    root.setAttribute('data-content-status', status);
    root.setAttribute('data-content-source', source);
    renderNotice();
    statusListeners.slice().forEach(function (fn) { try { fn(live); } catch (e) { report(e, 'status-listener'); } });
  }

  var blank = !url && !key;
  if (!DATA || !window.BLITZ_MAP) return;                    // nothing to update
  if (blank) { setStatus('snapshot', 'snapshot'); return; }  // live updates intentionally not configured: bundled content only

  var valid = /^(https:\/\/[^\/\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i.test(url) && key.length >= 20;
  if (valid && looksPrivileged(key)) {
    valid = false;                                           // never run with a secret key in the browser
    if (window.console && console.error) console.error('[BLITZ] BLITZ-CFG-003 config.js contains a secret/service_role key. Remove it and use the public publishable key only.');
  }
  if (!valid) {
    var cfgNormalized = E ? Object.assign({}, E.normalize('config', { operation: 'config' }), E.catalog.get('BLITZ-CFG-001'), { operation: 'config' }) : null;
    if (E) E.report('config.js is missing or invalid', { operation: 'config', silent: true });
    setStatus('fallback', 'snapshot', cfgNormalized);
    return;
  }
  live.enabled = true;

  var mapper = window.BLITZ_MAP.create(url);
  function map(raw) { return mapper.all(raw); }

  function fingerprint() {
    return JSON.stringify(COLLECTIONS.map(function (k) { return DATA[k]; }));
  }

  function apply(mapped) {
    COLLECTIONS.forEach(function (k) { DATA[k] = mapped[k]; });
  }

  var startSource = 'snapshot';
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.v && Date.now() - cached.t < CACHE_MAX_AGE && map(cached.raw)) {
      apply(map(cached.raw));
      startSource = 'cache';
      live.cachedAt = cached.t;
    }
  } catch (e) { report(e, 'read-cache'); }
  setStatus('pending', startSource);

  var applied = fingerprint();
  var lastFetch = 0;
  var inFlight = false;

  // One request. Rejects with the server's own error body when there is one, so it can be classified precisely.
  function requestOnce() {
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, FETCH_TIMEOUT);
    return fetch(url + '/rest/v1/rpc/site_content', {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (response.ok) return response.json();
      return response.text().then(function (body) {
        var err;
        try { err = JSON.parse(body); } catch (e) { err = {}; }
        if (!err || typeof err !== 'object') err = {};
        err.status = response.status;
        err.message = err.message || ('HTTP ' + response.status);
        throw err;
      });
    }).then(function (raw) {
      clearTimeout(timer);
      return raw;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function fetchLive(manual) {
    if (inFlight) return;
    inFlight = true;
    lastFetch = Date.now();
    if (manual && live.status === 'fallback') setStatus('pending', live.source);

    var run = E
      ? E.retry(requestOnce, { idempotent: true, retries: AUTO_RETRIES, baseMs: 1000, maxMs: 4000, ctx: { service: 'supabase', operation: 'load-content' } })
      : requestOnce();

    run.then(function (raw) {
      var mapped = map(raw);
      if (!mapped) {
        var bad = new Error('empty or malformed response');
        bad.name = 'DataError';
        throw bad;
      }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: 1, raw: raw })); } catch (e) { /* storage full or blocked: fine */ }
      apply(mapped);
      live.lastSync = Date.now();
      setStatus('live', 'live');
      var now = fingerprint();
      if (now !== applied) {
        applied = now;
        changed = true;
        listeners.slice().forEach(function (fn) {
          try { fn(); } catch (err) { report(err, 'render-after-update'); }
        });
      }
    }).catch(function (err) {
      var n = E ? E.normalize(err, { service: 'supabase', operation: 'load-content', kind: err && err.name === 'DataError' ? 'data' : undefined }) : null;
      report(err, 'load-content', { kind: err && err.name === 'DataError' ? 'data' : undefined });
      setStatus('fallback', live.source, n);
    }).then(function () {
      inFlight = false;
    });
  }

  fetchLive(false);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - lastFetch > REFETCH_AFTER) fetchLive(false);
  });
  window.addEventListener('online', function () { if (live.status === 'fallback') fetchLive(true); });
}());
