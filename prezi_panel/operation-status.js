/*
 * Prezi Panel: one safe way to run anything that talks to the database.
 *
 *   PP.run({ key, buttons, busyText, operation, task, requireRows, write, success, onSuccess, onError }) -> Promise<{ ok, result?, error? }>
 *
 * Guarantees:
 *  - The same operation (same key) can never run twice at once, so a double click cannot double-write.
 *  - Buttons are disabled and relabelled while it runs, and restored afterwards whatever happens.
 *  - "Success" is announced only after the database confirmed it: no error AND (when requireRows) at least one row
 *    actually changed. An update that row level security silently filtered out is reported as a failure.
 *  - A hung connection ends with a time-out instead of an endless "Saving…".
 *  - Failures are normalised, logged without secrets, shown once, and never re-thrown at the caller.
 *  - Writes are never retried automatically. Reads go through PP.read, which retries only transient failures.
 *
 *   PP.read(fn, operation) -> Promise     bounded retry (idempotent reads only)
 */
(function () {
  'use strict';

  var PP = window.PP;
  var E = window.BLITZ_ERRORS;
  if (!PP || !E) return;

  var running = {};
  var WRITE_TIMEOUT = 30000;
  var READ_TIMEOUT = 15000;

  function list(v) { return v ? [].concat(v) : []; }

  function setBusy(buttons, text) {
    return list(buttons).map(function (b) {
      var before = { disabled: b.disabled, text: b.textContent };
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
      if (text) b.textContent = text;
      return { b: b, before: before };
    });
  }
  function restore(saved) {
    saved.forEach(function (s) {
      s.b.disabled = s.before.disabled;
      s.b.textContent = s.before.text;
      s.b.removeAttribute('aria-busy');
    });
  }

  function isSessionProblem(n) { return n.code === 'BLITZ-AUTH-002' || n.code === 'BLITZ-AUTH-003'; }

  PP.run = function (opts) {
    var key = opts.key || opts.operation || 'operation';
    if (running[key]) {
      PP.toast(E.catalog.get('BLITZ-OP-001').message + ' ' + E.catalog.get('BLITZ-OP-001').hint, '');
      return Promise.resolve({ ok: false, skipped: true });
    }
    running[key] = true;
    var saved = setBusy(opts.buttons, opts.busyText);
    var cid = E.newCorrelationId();
    var isWrite = opts.write !== false;

    return Promise.resolve()
      .then(function () { return E.withTimeout(Promise.resolve().then(opts.task), isWrite ? WRITE_TIMEOUT : READ_TIMEOUT, opts.operation || 'Request'); })
      .then(function (result) {
        if (result && result.error) { if (!result.error.status && result.status) result.error.status = result.status; throw result.error; }
        if (opts.requireRows && (!result || !Array.isArray(result.data) || result.data.length === 0)) {
          throw { code: 'BLITZ_NOROWS', message: 'The request succeeded but no row was changed.' };
        }
        // Only now is it true, so only now do we say so.
        var text = typeof opts.success === 'function' ? opts.success(result) : opts.success;
        if (text) PP.toast(text, 'ok');
        if (opts.onSuccess) opts.onSuccess(result);
        return { ok: true, result: result };
      })
      .catch(function (err) {
        var n = E.report(err, { operation: opts.operation || key, correlationId: cid, service: 'supabase', silent: true, area: opts.area });
        var text = E.explain(n, { audience: 'admin', ambiguousWrite: isWrite });
        PP.toast(text, 'error');
        if (isSessionProblem(n) && PP.onSessionExpired) PP.onSessionExpired(n);
        if (opts.onError) { try { opts.onError(n, err); } catch (e) { E.report(e, { operation: 'onError', silent: true }); } }
        return { ok: false, error: n };
      })
      .then(function (outcome) {
        restore(saved);
        delete running[key];
        return outcome;
      });
  };

  // Reads are safe to repeat, so they get a bounded retry on transient failures (network, time-out, 5xx).
  PP.read = function (fn, operation) {
    return E.retry(function () { return E.withTimeout(Promise.resolve().then(fn), READ_TIMEOUT, operation || 'Read'); },
      { idempotent: true, retries: 2, baseMs: 500, maxMs: 3000, ctx: { service: 'supabase', operation: operation || 'read' } });
  };

  /* Show a failed load inside the page with a Retry button, instead of a lone error line. */
  PP.loadFailure = function (host, err, operation, retryFn) {
    var n = E.report(err, { operation: operation, service: 'supabase', silent: true });
    PP.clear(host);
    var box = PP.el('div', { class: 'notice notice--error', role: 'alert' }, [
      PP.el('p', { text: E.explain(n, { audience: 'admin' }) }),
      retryFn ? PP.el('button', { type: 'button', class: 'btn btn--small', text: 'Try again', onclick: function () { retryFn(); } }) : null
    ]);
    host.appendChild(box);
    if (isSessionProblem(n) && PP.onSessionExpired) PP.onSessionExpired(n);
    return n;
  };
}());
