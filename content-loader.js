
(function () {
  'use strict';

  var DATA = window.BLITZ_DATA;
  var COLLECTIONS = (window.BLITZ_MAP && window.BLITZ_MAP.COLLECTIONS) || [];
  var cfg = window.BLITZ_CONFIG || {};
  var url = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  var key = String(cfg.supabaseKey || '');
  var CACHE_KEY = 'blitz:content:v1';
  var CACHE_MAX_AGE = 30 * 24 * 3600 * 1000;
  var REFETCH_AFTER = 2 * 60 * 1000; // when a tab becomes visible again

  var listeners = [];
  var changed = false;
  window.BLITZ_LIVE = {
    enabled: false,
    onChange: function (fn) {
      listeners.push(fn);
      if (changed) fn();
    }
  };
  if (!DATA || !window.BLITZ_MAP || !/^(https:\/\/[^\/\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i.test(url) || key.length < 20) return; // not configured: snapshot only
  window.BLITZ_LIVE.enabled = true;

  var mapper = window.BLITZ_MAP.create(url);
  function map(raw) { return mapper.all(raw); }

  function fingerprint() {
    return JSON.stringify(COLLECTIONS.map(function (k) { return DATA[k]; }));
  }

  function apply(mapped) {
    COLLECTIONS.forEach(function (k) { DATA[k] = mapped[k]; });
  }
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.v && Date.now() - cached.t < CACHE_MAX_AGE && map(cached.raw)) {
      apply(map(cached.raw));
    }
  } catch (e) {  }

  var applied = fingerprint();
  var lastFetch = 0;
  var inFlight = false;
  function fetchLive() {
    if (inFlight) return;
    inFlight = true;
    lastFetch = Date.now();
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 8000);

    fetch(url + '/rest/v1/rpc/site_content', {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (raw) {
      var mapped = map(raw);
      if (!mapped) throw new Error('empty or malformed response');
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: 1, raw: raw })); } catch (e) {  }
      apply(mapped);
      var now = fingerprint();
      if (now !== applied) {
        applied = now;
        changed = true;
        listeners.forEach(function (fn) {
          try { fn(); } catch (err) { console.error('[BLITZ] render after update failed', err); }
        });
      }
    }).catch(function (err) {
      if (window.console && console.warn) console.warn('[BLITZ] live content unavailable, showing saved content:', err && err.message);
    }).then(function () {
      clearTimeout(timer);
      inFlight = false;
    });
  }

  fetchLive();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - lastFetch > REFETCH_AFTER) fetchLive();
  });
}());
