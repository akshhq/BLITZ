'use strict';
// Unit tests for error-catalog.js and error-handler.js. Run: node --test tests/unit
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const catalog = require(path.join('..', '..', 'error-catalog.js'));
const E = require(path.join('..', '..', 'error-handler.js'));

const code = (input, ctx) => E.normalize(input, ctx).code;

test('catalog: codes are unique, well-formed and every entry has text a visitor can read', () => {
  const seen = new Set();
  for (const e of catalog.list) {
    assert.match(e.code, /^BLITZ-(NET|DB|SCH|AUTH|PERM|VAL|DATA|CFG|IMG|OP|JS|HTTP)-\d{3}$/, e.code);
    assert.ok(!seen.has(e.code), 'duplicate ' + e.code);
    seen.add(e.code);
    assert.ok(e.message && e.hint && e.title, e.code + ' needs title, message and hint');
    assert.ok(['info', 'warning', 'error'].includes(e.severity), e.code);
    assert.equal(typeof e.retryable, 'boolean', e.code);
    // visitor-facing text must never carry implementation detail
    assert.doesNotMatch(e.message + ' ' + e.hint, /select |insert |update |delete |supabase|postgres|rls|stack|jwt|sql/i, e.code + ' leaks internals to visitors');
  }
  assert.equal(catalog.get('NOPE').code, 'BLITZ-JS-001');
});

test('classify: network, timeout and offline', () => {
  assert.equal(code(new TypeError('Failed to fetch')), 'BLITZ-NET-002');
  assert.equal(code({ message: 'TypeError: Load failed' }), 'BLITZ-NET-002');
  const abort = new Error('aborted'); abort.name = 'AbortError';
  assert.equal(code(abort), 'BLITZ-NET-003');
  assert.equal(code({ status: 429, message: 'x' }), 'BLITZ-NET-004');
  assert.equal(code({ status: 408 }), 'BLITZ-NET-003');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  assert.equal(code(new TypeError('Failed to fetch')), 'BLITZ-NET-001');
  delete globalThis.navigator;
});

test('classify: Supabase / PostgREST / Postgres errors map to the right diagnosis', () => {
  assert.equal(code({ code: 'PGRST204', message: "Could not find the 'event_details' column of 'events' in the schema cache" }), 'BLITZ-SCH-001');
  assert.equal(code({ code: '42703', message: 'column events.nope does not exist' }), 'BLITZ-SCH-001');
  assert.equal(code({ code: 'PGRST205', message: "Could not find the table 'public.events' in the schema cache" }), 'BLITZ-SCH-002');
  assert.equal(code({ code: '42P01', message: 'relation "public.events" does not exist' }), 'BLITZ-SCH-002');
  assert.equal(code({ code: 'PGRST202', message: 'Could not find the function public.site_content without parameters in the schema cache' }), 'BLITZ-SCH-003');
  assert.equal(code({ code: '42883', message: 'function public.site_content() does not exist' }), 'BLITZ-SCH-003');
  assert.equal(code({ code: '42501', message: 'new row violates row-level security policy for table "events"' }), 'BLITZ-PERM-001');
  assert.equal(code({ message: 'permission denied for table events' }), 'BLITZ-PERM-001');
  assert.equal(code({ code: '23505', message: 'duplicate key value violates unique constraint "events_pkey"' }), 'BLITZ-DB-004');
  assert.equal(code({ code: '23514', message: 'new row for relation "events" violates check constraint' }), 'BLITZ-DB-003');
  assert.equal(code({ code: '22P02', message: 'invalid input syntax for type json' }), 'BLITZ-DB-003');
  assert.equal(code({ code: 'PGRST301', message: 'JWT expired' }), 'BLITZ-AUTH-002');
  assert.equal(code({ message: 'JWT expired', status: 401 }), 'BLITZ-AUTH-002');
  assert.equal(code({ code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.', status: 503 }), 'BLITZ-DB-002');
  assert.equal(code({ status: 503, message: 'upstream' }), 'BLITZ-DB-002');
  assert.equal(code({ status: 500, message: 'boom' }), 'BLITZ-DB-001');
  assert.equal(code({ status: 401, message: 'Invalid API key' }), 'BLITZ-CFG-003');
  assert.equal(code({ status: 404, message: 'no Route matched' }, { service: 'supabase' }), 'BLITZ-CFG-002');
  assert.equal(code({ message: 'Bucket not found', status: 404 }), 'BLITZ-IMG-003');
  assert.equal(code({ name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' }), 'BLITZ-AUTH-001');
  assert.equal(code({ name: 'AuthApiError', status: 429, message: 'Too many requests' }, { area: 'auth' }), 'BLITZ-AUTH-004');
  assert.equal(code({ code: 'refresh_token_not_found', message: 'Invalid Refresh Token' }), 'BLITZ-AUTH-002');
  assert.equal(code('something odd'), 'BLITZ-JS-001');
  assert.equal(code('something odd', { kind: 'promise' }), 'BLITZ-JS-002');
});

test('classify: an HTML error page where JSON was expected is a server problem, not a script bug', () => {
  assert.equal(code({ message: '<!DOCTYPE HTML>\n<html><head><title>Error response</title>' }), 'BLITZ-DB-001');
  assert.equal(code({ message: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" }), 'BLITZ-DB-001');
  assert.equal(code({ message: '<html>maintenance</html>', status: 503 }), 'BLITZ-DB-002');
  assert.equal(code({ status: 500, code: 'XX000', message: 'internal' }), 'BLITZ-DB-001');
  assert.equal(code({ code: '53300', message: 'too many connections' }), 'BLITZ-DB-001');
});

test('schema diagnosis does not blindly recommend a migration or a column type', () => {
  const known = E.explain({ code: 'PGRST204', message: "Could not find the 'event_details' column of 'events' in the schema cache" }, { audience: 'admin' });
  assert.match(known, /event_details/);
  assert.match(known, /jsonb/);                                   // the real type, never "text"
  assert.match(known, /migration_add_event_details\.sql/);
  assert.match(known, /if it exists, the schema cache is stale/i);
  assert.doesNotMatch(known, /ADD COLUMN/i);
  const unknown = E.explain({ code: 'PGRST204', message: "Could not find the 'mystery' column of 'events' in the schema cache" }, { audience: 'admin' });
  assert.doesNotMatch(unknown, /ADD COLUMN|migration_add/i);       // not a known column: no migration is suggested
  assert.match(unknown, /schema\.sql/);
  const visitor = E.explain({ code: 'PGRST204', message: "Could not find the 'event_details' column of 'events' in the schema cache" });
  assert.doesNotMatch(visitor, /event_details|events|schema|migration|pgrst/i);   // visitors never see database detail
});

test('redaction removes tokens, keys, emails, rows and paths', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV';
  const dirty = `Bearer ${jwt} apikey=sb_publishable_abcDEF123456 sb_secret_zzz9 user bob@example.com Failing row contains (a, b, c) at /home/ubuntu/app/x.js file:///C:/Users/x/y.js password: hunter2 Key (id)=(secret-slug) already exists`;
  const out = E.redact(dirty);
  for (const leak of [jwt, 'sb_publishable_abc', 'sb_secret_zzz9', 'bob@example.com', '(a, b, c)', '/home/ubuntu', 'file:///', 'hunter2', 'secret-slug']) {
    assert.ok(!out.includes(leak), 'leaked: ' + leak + ' in ' + out);
  }
  assert.ok(E.redact('x'.repeat(1000)).length <= 301);
});

test('normalized errors carry no raw detail in user-facing fields and have correlation ids', () => {
  const n = E.normalize({ code: '42501', message: 'permission denied for table events (user bob@example.com)' }, { operation: 'save-event' });
  assert.equal(n.operation, 'save-event');
  assert.match(n.correlationId, /^BZ-/);
  assert.ok(!/bob@example/.test(JSON.stringify(n)), 'email leaked into normalized object');
  assert.notEqual(E.newCorrelationId(), E.newCorrelationId());
  assert.equal(E.normalize(n), n);                                  // idempotent
});

test('report de-duplicates the same failure and still records the first', () => {
  E._reset();
  let notified = 0;
  E.configure({ ui: 'none' });
  E.onError(() => { notified += 1; });
  const err = { code: '42501', message: 'permission denied for table events' };
  const a = E.report(err, { operation: 'save' });
  const b = E.report(err, { operation: 'save' });
  const c = E.report(err, { operation: 'save' });
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(c.duplicate, true);
  assert.equal(notified, 1);
  assert.equal(E.recent().length, 1);
  E.report(err, { operation: 'delete' });                           // a different operation is a different failure
  assert.equal(notified, 2);
  E.report(err, { operation: 'quiet', silent: true });
  assert.equal(notified, 2);
});

test('retry: transient reads are retried a bounded number of times with backoff', async () => {
  const delays = [];
  let calls = 0;
  const res = await E.retry(() => { calls += 1; return calls < 3 ? Promise.resolve({ error: { message: 'Failed to fetch' } }) : Promise.resolve({ data: [1] }); },
    { idempotent: true, retries: 2, sleep: (ms) => { delays.push(ms); return Promise.resolve(); }, random: () => 0.5 });
  assert.equal(calls, 3);
  assert.deepEqual(res, { data: [1] });
  assert.equal(delays.length, 2);
  assert.ok(delays[1] > delays[0], 'backoff grows');

  calls = 0;
  const gaveUp = await E.retry(() => { calls += 1; return Promise.resolve({ error: { message: 'Failed to fetch' } }); },
    { idempotent: true, retries: 2, sleep: () => Promise.resolve() });
  assert.equal(calls, 3, '1 try + 2 retries, never more');
  assert.ok(gaveUp.error, 'the last error is handed back to the caller');

  let thrown = 0;
  await assert.rejects(E.retry(() => { thrown += 1; return Promise.reject(new TypeError('Failed to fetch')); }, { idempotent: true, retries: 1, sleep: () => Promise.resolve() }));
  assert.equal(thrown, 2);
});

test('retry: never retries writes, permanent failures, or an offline device', async () => {
  let calls = 0;
  await E.retry(() => { calls += 1; return Promise.resolve({ error: { message: 'Failed to fetch' } }); }, { sleep: () => Promise.resolve() });   // idempotent not declared
  assert.equal(calls, 1, 'a write (idempotent not declared) is never retried');

  calls = 0;
  await E.retry(() => { calls += 1; return Promise.resolve({ error: { code: '42501', message: 'permission denied' } }); }, { idempotent: true, retries: 3, sleep: () => Promise.resolve() });
  assert.equal(calls, 1, 'permission errors are permanent');

  calls = 0;
  await E.retry(() => { calls += 1; return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } }); }, { idempotent: true, retries: 3, sleep: () => Promise.resolve() });
  assert.equal(calls, 1, 'duplicates are permanent');

  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  calls = 0;
  await E.retry(() => { calls += 1; return Promise.resolve({ error: { message: 'Failed to fetch' } }); }, { idempotent: true, retries: 3, sleep: () => Promise.resolve() });
  delete globalThis.navigator;
  assert.equal(calls, 1, 'offline: wait for the connection instead of spinning');

  calls = 0;
  await E.retry(() => { calls += 1; return Promise.resolve({ error: { message: 'x' } }); }, { idempotent: true, retries: 99, sleep: () => Promise.resolve() });
  assert.ok(calls <= 1, 'unknown errors are not transient');
  calls = 0;
  await E.retry(() => { calls += 1; return Promise.resolve({ error: { message: 'Failed to fetch' } }); }, { idempotent: true, retries: 99, sleep: () => Promise.resolve() });
  assert.equal(calls, 6, 'the retry cap is 5 no matter what is asked');
});

test('withTimeout rejects with a TimeoutError that classifies as a time-out', async () => {
  await assert.rejects(E.withTimeout(new Promise(() => {}), 20, 'Save'), (e) => e.name === 'TimeoutError' && E.normalize(e).code === 'BLITZ-NET-003');
  assert.equal(await E.withTimeout(Promise.resolve(7), 50), 7);
});

test('explain(): a lost connection during a write warns that the outcome is unknown', () => {
  const t = E.explain(new TypeError('Failed to fetch'), { ambiguousWrite: true });
  assert.match(t, /could not confirm whether the change was saved/i);
  assert.match(t, /Code BLITZ-NET-002/);
  const read = E.explain(new TypeError('Failed to fetch'));
  assert.doesNotMatch(read, /could not confirm/i);
});
