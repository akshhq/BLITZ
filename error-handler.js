/*
 * BLITZ central error handler (public site and Prezi Panel share this one file).
 *
 *   BLITZ_ERRORS.normalize(anything, ctx)  -> { code, message, hint, retryable, ... }
 *   BLITZ_ERRORS.report(anything, ctx)     -> normalize + log (redacted) + de-duplicate + notify
 *   BLITZ_ERRORS.explain(anything, ctx)    -> one human sentence with the code, safe to show
 *   BLITZ_ERRORS.retry(fn, opts)           -> bounded retry with backoff, only for idempotent work
 *   BLITZ_ERRORS.withTimeout(p, ms)        -> rejects with a TimeoutError
 *   BLITZ_ERRORS.ui.showNotice / hideNotice
 *   BLITZ_ERRORS.install()                 -> global error / unhandledrejection / offline / broken-image handling
 *
 * Needs error-catalog.js loaded first. Works in a browser and in Node (for tests).
 * Nothing here ever shows a stack trace, SQL, token or internal path to a visitor.
 */
(function (root, factory) {
  'use strict';
  var catalog = (typeof module === 'object' && module.exports && typeof require === 'function')
    ? require('./error-catalog.js') : (root && root.BLITZ_ERROR_CATALOG);
  var api = factory(root, catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BLITZ_ERRORS = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root, catalog) {
  'use strict';

  if (!catalog) throw new Error('error-handler.js needs error-catalog.js to be loaded first');

  var hasDom = typeof document !== 'undefined' && !!document.createElement;
  var DEDUPE_MS = 8000;
  var MAX_NOTIFY_PER_MINUTE = 20;
  var RECENT_MAX = 50;

  var seen = {};            // dedupe key -> { t, count }
  var recent = [];          // last normalized errors, newest last (for diagnostics and tests)
  var listeners = [];
  var burst = { start: 0, n: 0, warned: false };
  var config = { ui: 'notice', debug: false };
  var installed = false;
  var sessionId = Math.random().toString(36).slice(2, 6);
  var counter = 0;

  /* ---------------------------------------------------------------- redaction */
  function redact(value) {
    var s = String(value === null || value === undefined ? '' : value);
    s = s.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[token]')
      .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[key]')
      .replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [token]')
      .replace(/(apikey|api_key|access_token|refresh_token|token|password|secret|service_role)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, '$1$2[redacted]')
      .replace(/Failing row contains \([^)]*\)/gi, 'Failing row contains [row]')
      .replace(/Key \([^)]*\)=\([^)]*\)/g, 'Key [..]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/file:\/\/\/?[^\s'")]+/gi, '[path]')
      .replace(/(?:[A-Za-z]:\\|\/)(?:Users|home|var|etc|opt|srv|root|usr|tmp)[\\/][^\s'")]+/g, '[path]');
    return s.length > 300 ? s.slice(0, 300) + '…' : s;
  }

  /* ---------------------------------------------------------------- ids */
  function newCorrelationId() {
    counter += 1;
    return 'BZ-' + sessionId + '-' + counter.toString(36) + Date.now().toString(36).slice(-4);
  }

  /* ---------------------------------------------------------------- classification */
  function toRaw(input) {
    if (input === null || input === undefined) return { message: '' };
    if (typeof input === 'string') return { message: input };
    if (typeof input !== 'object' && typeof input !== 'function') return { message: String(input) };
    var message = input.message;
    if (typeof message !== 'string') message = typeof input.error_description === 'string' ? input.error_description : (typeof input.msg === 'string' ? input.msg : '');
    var status = Number(input.status || input.statusCode || input.httpStatus || 0) || 0;
    return {
      name: String(input.name || ''),
      message: message,
      code: input.code === undefined || input.code === null ? (input.error_code ? String(input.error_code) : '') : String(input.code),
      status: status,
      details: typeof input.details === 'string' ? input.details : '',
      hint: typeof input.hint === 'string' ? input.hint : ''
    };
  }

  function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  var PG_VALUE = { '22P02': 1, '22007': 1, '22008': 1, '22001': 1, '22003': 1, '22023': 1, '23502': 1, '23514': 1, '22P05': 1 };

  function classify(raw, ctx) {
    var msg = raw.message || '', code = raw.code || '', status = raw.status || 0, name = raw.name || '';
    var text = msg + ' ' + (raw.details || '');
    var m;

    // Time-outs and connectivity first: they hide every other cause.
    if (name === 'AbortError' || name === 'TimeoutError' || /timed? ?out|timeout/i.test(msg) && !/jwt/i.test(msg)) return 'BLITZ-NET-003';
    if (/failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|err_network|err_connection|err_name_not_resolved/i.test(msg) ||
      (name === 'TypeError' && status === 0 && /fetch/i.test(msg))) {
      return isOffline() ? 'BLITZ-NET-001' : 'BLITZ-NET-002';
    }

    if (code === 'BLITZ_NOROWS') return 'BLITZ-DB-005';                 // raised by the panel when a write touched zero rows

    // A proxy, firewall or host answered with a web page instead of JSON: the service is not reachable in a usable way.
    if (/^\s*<(!doctype|html|\?xml)/i.test(msg) || /unexpected token '?<|is not valid json/i.test(msg)) return status === 503 ? 'BLITZ-DB-002' : 'BLITZ-DB-001';

    // PostgREST (Supabase REST layer) codes.
    if (code === 'PGRST204') return 'BLITZ-SCH-001';
    if (code === 'PGRST205') return 'BLITZ-SCH-002';
    if (code === 'PGRST202') return 'BLITZ-SCH-003';
    if (code === 'PGRST301') return 'BLITZ-AUTH-002';
    if (code === 'PGRST302') return 'BLITZ-AUTH-003';
    if (code === 'PGRST002') return 'BLITZ-DB-002';
    if (code === 'PGRST116') return 'BLITZ-DB-005';

    // PostgreSQL SQLSTATE codes.
    if (code === '42703') return 'BLITZ-SCH-001';
    if (code === '42P01') return 'BLITZ-SCH-002';
    if (code === '42883') return 'BLITZ-SCH-003';
    if (code === '42501') return 'BLITZ-PERM-001';
    if (code === '23505') return 'BLITZ-DB-004';
    if (code === '23503') return 'BLITZ-DB-006';
    if (PG_VALUE[code]) return 'BLITZ-DB-003';
    if (code === '54000') return 'BLITZ-DB-007';
    if (code === '57014' || /^(XX\d{3}|53\d{3}|58\d{3}|57P\d{2})$/.test(code)) return 'BLITZ-DB-001';   // timeout, internal, out-of-resources, shutdown

    // Supabase Auth / Storage codes.
    if (/^(invalid_credentials|invalid_grant)$/.test(code) || /invalid login credentials/i.test(msg)) return 'BLITZ-AUTH-001';
    if (/^(session_not_found|session_expired|refresh_token_not_found|refresh_token_already_used|bad_jwt)$/.test(code) ||
      /jwt expired|auth session missing|invalid refresh token|refresh token not found/i.test(msg)) return 'BLITZ-AUTH-002';
    if (/^(over_request_rate_limit|over_email_send_rate_limit)$/.test(code)) return 'BLITZ-AUTH-004';
    if (/bucket not found/i.test(msg)) return 'BLITZ-IMG-003';
    if (/exceeded the maximum allowed size|payload too large|entity too large|mime type .* (is )?not supported/i.test(msg)) return 'BLITZ-VAL-006';

    // Message shapes.
    if (/could not find the '[^']+' column of '[^']+'/i.test(text)) return 'BLITZ-SCH-001';
    if (/could not find the table|relation .* does not exist/i.test(text)) return 'BLITZ-SCH-002';
    if (/could not find the function|function .* does not exist/i.test(text)) return 'BLITZ-SCH-003';
    if (/schema cache/i.test(text) && status === 503) return 'BLITZ-DB-002';
    if (/invalid api key|no api key found|invalid apikey/i.test(msg)) return 'BLITZ-CFG-003';
    if (/row-level security|permission denied|insufficient[_ ]privilege|not authorized/i.test(text)) return 'BLITZ-PERM-001';
    if (/rate limit|too many requests/i.test(msg)) return (ctx && ctx.area === 'auth') || /^Auth/.test(name) ? 'BLITZ-AUTH-004' : 'BLITZ-NET-004';
    if (/invalid jwt|jwt/i.test(msg) && status === 401) return 'BLITZ-AUTH-002';

    // Bare HTTP status.
    if (status === 401) return 'BLITZ-AUTH-003';
    if (status === 403) return 'BLITZ-PERM-001';
    if (status === 404) return ctx && ctx.service ? 'BLITZ-CFG-002' : 'BLITZ-DATA-001';
    if (status === 408) return 'BLITZ-NET-003';
    if (status === 413) return 'BLITZ-DB-007';
    if (status === 429) return (ctx && ctx.area === 'auth') ? 'BLITZ-AUTH-004' : 'BLITZ-NET-004';
    if (status === 503) return 'BLITZ-DB-002';
    if (status >= 500) return 'BLITZ-DB-001';
    if (status === 400 && ctx && ctx.service) return 'BLITZ-DB-003';

    if (ctx && ctx.operation && /upload/i.test(ctx.operation)) return 'BLITZ-IMG-002';
    if (ctx && ctx.kind === 'data') return 'BLITZ-DATA-004';
    if (ctx && ctx.kind === 'resource') return 'BLITZ-JS-003';
    if (ctx && ctx.kind === 'promise') return 'BLITZ-JS-002';
    return 'BLITZ-JS-001';
  }

  function schemaTarget(raw) {
    var text = (raw.message || '') + ' ' + (raw.details || '');
    var m = /could not find the '([^']+)' column of '([^']+)'/i.exec(text);
    if (m) return { column: m[1], table: m[2] };
    m = /column ([a-z_0-9]+)\.([a-z_0-9]+) does not exist/i.exec(text);   // PostgreSQL 42703
    return m ? { table: m[1], column: m[2] } : null;
  }

  function normalize(input, ctx) {
    ctx = ctx || {};
    if (input && input.blitz === true && input.code) return input;   // already normalized
    var raw = toRaw(input);
    var code = classify(raw, ctx);
    var entry = catalog.get(code);
    var n = {
      blitz: true,
      code: entry.code,
      category: entry.category,
      severity: entry.severity,
      retryable: entry.retryable,
      title: entry.title,
      message: entry.message,
      hint: entry.hint,
      admin: entry.admin,
      operation: ctx.operation || '',
      correlationId: ctx.correlationId || newCorrelationId(),
      timestamp: new Date().toISOString(),
      status: raw.status || null,
      sourceCode: raw.code || '',
      safeDetail: redact(raw.message || ''),
      duplicate: false
    };
    if (code === 'BLITZ-SCH-001' || code === 'BLITZ-SCH-002') {
      var target = schemaTarget(raw);
      if (target) { n.column = target.column; n.table = target.table; }
    }
    return n;
  }

  /* ---------------------------------------------------------------- messages for people */
  function adminSchemaText(n) {
    if (!n.column) return n.admin;
    var base = "The database does not recognise column '" + n.column + "' on '" + n.table + "'. ";
    var known = n.table === 'events' ? catalog.KNOWN_EVENT_COLUMNS[n.column] : (n.table === 'event_images' ? catalog.KNOWN_IMAGE_COLUMNS[n.column] : null);
    if (known) {
      return base + 'It belongs to the current schema (type ' + known.type + '). Check whether it exists with the diagnostic query in ERRORS.md. ' +
        'If it is missing, run ' + known.migration + ' in the Supabase SQL Editor; if it exists, the schema cache is stale: run NOTIFY pgrst, \'reload schema\';';
    }
    return base + 'Either it is missing or the schema cache has not reloaded. Compare the project with supabase/schema.sql using the diagnostic query in ERRORS.md, then reload the schema cache. ' +
      'Do not add the column by hand unless the schema file defines it.';
  }

  function explain(input, ctx) {
    ctx = ctx || {};
    var n = normalize(input, ctx);
    var parts = [n.message];
    if (ctx.audience === 'admin') {
      var extra = (n.code === 'BLITZ-SCH-001' || n.code === 'BLITZ-SCH-002') ? adminSchemaText(n) : n.admin;
      if (extra) parts.push(extra);
      if (n.hint && !extra) parts.push(n.hint);
    } else if (n.hint) {
      parts.push(n.hint);
    }
    var text = parts.join(' ');
    if (ctx.ambiguousWrite && n.code.indexOf('BLITZ-NET-') === 0) {
      text += ' ' + catalog.get('BLITZ-OP-002').message + ' ' + catalog.get('BLITZ-OP-002').hint;
    }
    return text + ' (Code ' + n.code + (ctx.showCorrelation === false ? '' : ' · ' + n.correlationId) + ')';
  }

  /* ---------------------------------------------------------------- reporting */
  function log(n, level) {
    if (typeof console === 'undefined') return;
    var line = '[BLITZ] ' + n.code + (n.operation ? ' (' + n.operation + ')' : '') + ' ' + n.correlationId + ' – ' + n.safeDetail;
    var fn = level === 'debug' ? (console.debug || console.log) : (n.severity === 'error' ? console.error : console.warn);
    if (fn) fn.call(console, line);
  }

  function report(input, ctx) {
    ctx = ctx || {};
    var n = normalize(input, ctx);
    var key = n.code + '|' + n.operation + '|' + n.safeDetail;
    var now = Date.now();
    var prev = seen[key];
    if (prev && now - prev.t < DEDUPE_MS) {
      prev.count += 1;
      n.duplicate = true;
      return n;                                   // same failure again: no second log line, no second notice
    }
    seen[key] = { t: now, count: 1 };
    recent.push(n);
    if (recent.length > RECENT_MAX) recent.shift();
    log(n);
    if (ctx.silent) return n;

    if (now - burst.start > 60000) { burst.start = now; burst.n = 0; burst.warned = false; }
    burst.n += 1;
    if (burst.n > MAX_NOTIFY_PER_MINUTE) {
      if (!burst.warned && typeof console !== 'undefined') { burst.warned = true; console.warn('[BLITZ] Too many errors; further notices suppressed for a minute.'); }
      return n;
    }
    listeners.slice().forEach(function (fn) { try { fn(n, ctx); } catch (e) { /* a broken listener must not hide the error */ } });
    return n;
  }

  function onError(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /* ---------------------------------------------------------------- timeouts and retries */
  function withTimeout(thenable, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        var err = new Error((label || 'Request') + ' timed out after ' + ms + ' ms');
        err.name = 'TimeoutError';
        reject(err);
      }, ms);
      Promise.resolve(thenable).then(function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
        function (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    });
  }

  /*
   * Retry only transient failures, a bounded number of times, with jittered backoff.
   * Safe by default: unless opts.idempotent === true there are NO retries, so a write can never be
   * repeated automatically. `fn` may reject, or resolve to a Supabase-style { data, error }.
   */
  function retry(fn, opts) {
    opts = opts || {};
    var max = opts.idempotent === true ? Math.min(opts.retries === undefined ? 2 : Number(opts.retries) || 0, 5) : 0;
    var base = opts.baseMs || 500, cap = opts.maxMs || 5000;
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var attempt = 0;
    function failure(err) {
      var n = normalize(err, opts.ctx);
      return attempt <= max && n.retryable && n.code !== 'BLITZ-NET-001' ? n : null;   // offline: wait for "online", do not spin
    }
    function next(err) {
      var n = failure(err);
      if (!n) return null;
      var delay = Math.round(Math.min(cap, base * Math.pow(2, attempt - 1)) * (0.5 + (opts.random ? opts.random() : Math.random()) * 0.5));
      if (typeof opts.onRetry === 'function') { try { opts.onRetry(n, attempt, delay); } catch (e) { /* ignore */ } }
      return sleep(delay).then(run);
    }
    function run() {
      attempt += 1;
      return Promise.resolve().then(function () { return fn(attempt); }).then(function (res) {
        if (res && res.error) {
          if (!res.error.status && res.status) res.error.status = res.status;   // supabase-js keeps the HTTP status beside the error, not in it
          var again = next(res.error); if (again) return again;
        }
        return res;
      }, function (err) {
        var again = next(err);
        if (again) return again;
        throw err;
      });
    }
    return run();
  }

  /* ---------------------------------------------------------------- notices (DOM) */
  var ui = { notices: {} };

  function host() {
    if (!hasDom) return null;
    var h = document.getElementById('blitz-notices');
    if (!h) {
      h = document.createElement('div');
      h.id = 'blitz-notices';
      h.className = 'blitz-notices';
      (document.body || document.documentElement).appendChild(h);
    }
    return h;
  }

  /*
   * One notice per id: calling it again updates the existing one (so a repeated failure never stacks).
   * opts: { id, kind: 'info'|'warning'|'error', title, message, code, actions: [{label, onClick}], dismissible, autoHideMs }
   */
  function showNotice(opts) {
    var h = host();
    if (!h) return null;
    var id = opts.id || 'notice';
    var node = ui.notices[id];
    if (!node || !node.parentNode) {
      node = document.createElement('div');
      ui.notices[id] = node;
      h.appendChild(node);
    }
    var kind = opts.kind || 'info';
    node.className = 'blitz-notice blitz-notice--' + kind;
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.setAttribute('data-notice-id', id);
    node.textContent = '';
    var text = document.createElement('div');
    text.className = 'blitz-notice-text';
    if (opts.title) { var t = document.createElement('strong'); t.textContent = opts.title; text.appendChild(t); }
    if (opts.message) { var p = document.createElement('span'); p.textContent = (opts.title ? ' ' : '') + opts.message; text.appendChild(p); }
    if (opts.code) { var c = document.createElement('small'); c.className = 'blitz-notice-code'; c.textContent = 'Code ' + opts.code; text.appendChild(c); }
    node.appendChild(text);
    var row = document.createElement('div');
    row.className = 'blitz-notice-actions';
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'blitz-notice-btn';
      b.textContent = a.label;
      b.addEventListener('click', function () { try { a.onClick(); } finally { if (a.dismiss !== false) hideNotice(id); } });
      row.appendChild(b);
    });
    if (opts.dismissible !== false) {
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'blitz-notice-btn blitz-notice-btn--quiet';
      x.setAttribute('aria-label', 'Dismiss message');
      x.textContent = 'Dismiss';
      x.addEventListener('click', function () { hideNotice(id); });
      row.appendChild(x);
    }
    node.appendChild(row);
    if (node._timer) clearTimeout(node._timer);
    if (opts.autoHideMs) node._timer = setTimeout(function () { hideNotice(id); }, opts.autoHideMs);
    return node;
  }

  function hideNotice(id) {
    var node = ui.notices[id];
    if (node && node.parentNode) node.parentNode.removeChild(node);
    delete ui.notices[id];
  }

  ui.showNotice = showNotice;
  ui.hideNotice = hideNotice;

  // Default listener for the public site: one calm, de-duplicated notice for unexpected failures.
  function defaultNotify(n, ctx) {
    if (config.ui !== 'notice' || !hasDom) return;
    if (ctx && ctx.notice === false) return;
    if (n.severity === 'info') return;
    var actions = [];
    if (n.retryable || n.code.indexOf('BLITZ-JS-') === 0) actions.push({ label: 'Reload page', onClick: function () { root.location.reload(); }, dismiss: false });
    showNotice({ id: 'error:' + n.code, kind: n.severity === 'error' ? 'error' : 'warning', title: n.title + '.', message: n.hint, code: n.code, actions: actions, autoHideMs: 20000 });
  }
  listeners.push(defaultNotify);

  /* ---------------------------------------------------------------- global hooks */
  function installImageFallback() {
    if (!hasDom) return;
    document.addEventListener('error', function (ev) {
      var img = ev.target;
      if (!img || img.tagName !== 'IMG' || !img.getAttribute('src') || img.getAttribute('data-blitz-failed')) return;
      img.setAttribute('data-blitz-failed', 'true');
      // A missing team photo falls back to the neutral avatar instead of a broken-image icon.
      if (img.closest && img.closest('.team-card') && !/avatar-placeholder/.test(img.getAttribute('src'))) {
        try { img.src = new URL('assets/images/team/avatar-placeholder.svg', document.baseURI).href; img.removeAttribute('data-blitz-failed'); img.setAttribute('data-blitz-fallback', 'avatar'); return; } catch (e) { /* fall through */ }
      }
      img.classList.add('is-broken');
      var box = img.parentElement;
      if (box && img.clientWidth >= 120) box.classList.add('has-broken-image');
      report('Image failed to load: ' + String(img.getAttribute('src')).slice(0, 120), { operation: 'image', silent: true, kind: 'resource' });
    }, true);
  }

  function install(opts) {
    if (installed || !hasDom) return;
    installed = true;
    opts = opts || {};
    if (opts.ui) config.ui = opts.ui;
    root.addEventListener('error', function (ev) {
      var t = ev.target;
      if (t && t !== root && t.tagName) {                     // resource failed to load
        if (t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && t.rel === 'stylesheet')) {
          var url = String(t.src || t.href || '');
          if (url.indexOf(root.location.origin) === 0) report('Failed to load ' + url.slice(root.location.origin.length), { kind: 'resource', operation: 'load-asset' });
        }
        return;
      }
      var file = String(ev.filename || '');
      if (!file && /^script error\.?$/i.test(String(ev.message || ''))) return;     // cross-origin noise (extensions, ads)
      if (/ResizeObserver loop/i.test(String(ev.message || ''))) return;
      if (file && file.indexOf(root.location.origin) !== 0) return;                 // not our code
      report(ev.error || ev.message, { kind: 'script', operation: 'script' });
    }, true);
    root.addEventListener('unhandledrejection', function (ev) {
      report(ev.reason, { kind: 'promise', operation: 'promise' });
    });
    root.addEventListener('offline', function () {
      var n = catalog.get('BLITZ-NET-001');
      showNotice({ id: 'offline', kind: 'warning', title: n.title + '.', message: 'Pages you have already opened keep working; new content will load when you reconnect.', code: 'BLITZ-NET-001', dismissible: true });
    });
    root.addEventListener('online', function () { hideNotice('offline'); });
    installImageFallback();
  }

  function configure(opts) { opts = opts || {}; if (opts.ui) config.ui = opts.ui; if (opts.debug !== undefined) config.debug = !!opts.debug; }

  /* ---------------------------------------------------------------- test helpers */
  function _reset() { seen = {}; recent = []; burst = { start: 0, n: 0, warned: false }; }

  return {
    redact: redact,
    classify: function (input, ctx) { return classify(toRaw(input), ctx || {}); },
    normalize: normalize,
    explain: explain,
    report: report,
    onError: onError,
    retry: retry,
    withTimeout: withTimeout,
    newCorrelationId: newCorrelationId,
    install: install,
    configure: configure,
    recent: function () { return recent.slice(); },
    catalog: catalog,
    ui: ui,
    _reset: _reset
  };
}));
