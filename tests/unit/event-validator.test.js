'use strict';
// Unit tests for prezi_panel/event-validator.js (mirrors the CHECK constraints in supabase/schema.sql).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const V = require(path.join('..', '..', 'prezi_panel', 'event-validator.js'));

const good = () => ({ id: 'code-verse-2026', title: 'Code Verse', category: 'Hackathon', description: 'A build night.', date: '2026-11-05', layout: 'competition', published: false });
const fields = (r) => r.errors.map((e) => e.field);
const check = (patch, opts) => V.validateRecord(Object.assign(good(), patch), opts);

test('a normal event is valid', () => {
  const r = V.validateRecord(good(), { isNew: true, existingIds: ['other'] });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('non-objects are rejected without throwing', () => {
  for (const bad of [null, undefined, 'x', 5, [], true]) assert.equal(V.validateRecord(bad).ok, false);
});

test('required fields are named individually', () => {
  const r = V.validateRecord({}, { requireDescription: true });
  assert.deepEqual(['id', 'title', 'category', 'description'].filter((f) => !fields(r).includes(f)), []);
  assert.ok(!V.validateRecord({ id: 'ab', title: 't', category: 'c', placeholder: true }, { requireDescription: true }).errors.some((e) => e.field === 'description'), 'placeholders may have no description');
  assert.ok(fields(check({ title: '   ' })).includes('title'), 'whitespace-only title');
});

test('ids: slug rules and duplicate detection (new events only)', () => {
  for (const id of ['Bad ID!', 'UPPER', '-lead', 'a', 'x'.repeat(80), 'under_score', 'sp ace']) assert.ok(fields(check({ id })).includes('id'), id);
  for (const id of ['ab', 'a-b-1', '2026-hack']) assert.equal(check({ id }).ok, true, id);
  assert.ok(fields(check({}, { isNew: true, existingIds: ['code-verse-2026'] })).includes('id'));
  assert.equal(check({}, { isNew: false, existingIds: ['code-verse-2026'] }).ok, true, 'editing keeps its own id');
});

test('dates must be real calendar dates', () => {
  for (const date of ['2026-02-31', '2026-13-01', '05-11-2026', '2026-1-1', 'tomorrow', 20261105]) assert.ok(fields(check({ date })).includes('date'), String(date));
  for (const date of ['2026-02-28', '2028-02-29', '', null]) assert.equal(check({ date }).ok, true, String(date));
  assert.equal(V.isValidDate('2027-02-29'), false);
});

test('layout and booleans are enums/booleans', () => {
  assert.ok(fields(check({ layout: 'weird' })).includes('layout'));
  for (const layout of V.LAYOUTS) assert.equal(check({ layout }).ok, true, layout);
  assert.ok(fields(check({ published: 'yes' })).includes('published'));
  assert.ok(fields(check({ placeholder: 1 })).includes('placeholder'));
});

test('length limits match the database', () => {
  assert.ok(fields(check({ title: 'x'.repeat(201) })).includes('title'));
  assert.equal(check({ title: 'x'.repeat(200) }).ok, true);
  assert.ok(fields(check({ description: 'x'.repeat(2001) })).includes('description'));
  assert.ok(fields(check({ speakers: Array(31).fill('a') })).includes('speakers'));
  assert.ok(fields(check({ key_points: ['x'.repeat(301)] })).includes('key_points[0]'));
  assert.ok(fields(check({ winners: Array(31).fill({}) })).includes('winners'));
  assert.ok(fields(check({ sessions: [{ t: 'x'.repeat(20001) }] })).includes('sessions'));
});

test('links must be https with a label', () => {
  assert.equal(check({ links: [{ label: 'Register', url: 'https://example.org/r' }] }).ok, true);
  for (const url of ['http://x.org', 'javascript:alert(1)', 'ftp://x', '//x.org', '', 'https://']) assert.ok(fields(check({ links: [{ label: 'L', url }] })).includes('links[0].url'), url);
  assert.ok(fields(check({ links: [{ label: '', url: 'https://x.org' }] })).includes('links[0].label'));
  assert.ok(fields(check({ links: ['x'] })).includes('links[0]'));
  assert.ok(fields(check({ links: Array(21).fill({ label: 'a', url: 'https://x.org' }) })).includes('links'));
});

test('image, logo and brochure references cannot escape or point outside', () => {
  for (const image of ['assets/events/a.webp', 'storage:events/a.webp']) assert.equal(check({ image }).ok, true, image);
  for (const image of ['../secret.png', 'assets/../../etc/passwd', 'http://evil/x.png', 'javascript:alert(1)', '/abs/path.png', 'data:image/png;base64,AAAA']) assert.ok(fields(check({ image })).includes('image'), image);
  assert.ok(fields(check({ logo: 'https://cdn.example/logo.png' })).includes('logo'));
  assert.equal(check({ brochure: 'https://example.org/b.pdf' }).ok, true);
  assert.equal(check({ brochure: 'assets/brochures/b.pdf' }).ok, true);
  for (const brochure of ['javascript:alert(1)', 'http://x.org/b.pdf', 'assets/../x.pdf']) assert.ok(fields(check({ brochure })).includes('brochure'), brochure);
});

test('event_details: object only, size-capped, links checked by path, scripts refused', () => {
  assert.equal(check({ event_details: {} }).ok, true);
  assert.equal(check({ event_details: { objectives: ['a'], registration: { url: 'https://x.org/r' } } }).ok, true);
  for (const bad of [[], 'x', 5, true]) assert.ok(fields(check({ event_details: bad })).includes('event_details'), JSON.stringify(bad));
  const paths = fields(check({ event_details: { registration: { url: 'javascript:alert(1)' }, links: ['http://insecure.example'], nested: { website: 'ftp://x' } } }));
  assert.ok(paths.includes('event_details.registration.url'), paths.join());
  assert.ok(paths.includes('event_details.links[0]'), paths.join());
  assert.ok(paths.includes('event_details.nested.website'), paths.join());
  assert.ok(fields(check({ event_details: { note: 'javascript:alert(1)' } })).includes('event_details.note'), 'script scheme in any string');
  assert.ok(fields(check({ event_details: { note: ' DaTa:text/html,<b>' } })).includes('event_details.note'));
  assert.ok(fields(check({ event_details: { status: 'x'.repeat(61) } })).includes('event_details.status'));
  let deep = { v: 1 }; for (let i = 0; i < 12; i++) deep = { n: deep };
  assert.ok(fields(check({ event_details: deep })).some((f) => f.startsWith('event_details')), 'too deeply nested');
  assert.ok(fields(check({ event_details: { list: Array(501).fill(1) } })).includes('event_details.list'));
});

test('event_details size uses the way Postgres prints jsonb (": " and ", " separators)', () => {
  assert.equal(V.pgJsonLength({}), 2);
  assert.equal(V.pgJsonLength({ a: 1 }), 8);               // {"a": 1}
  assert.equal(V.pgJsonLength({ a: 1, b: [1, 2] }), 21);   // {"a": 1, "b": [1, 2]}  (21 bytes, confirmed with octet_length(jsonb::text))
  assert.equal(V.pgJsonLength({ s: 'é' }), 11);            // é is 2 bytes in UTF-8 (11 confirmed with octet_length(jsonb::text))
  const limit = V.LIMITS.detailsBytes;
  const fill = (n) => ({ p: 'x'.repeat(n) });
  const base = V.pgJsonLength(fill(0));
  assert.equal(check({ event_details: fill(limit - base) }).ok, true, 'exactly at the limit');
  const over = check({ event_details: fill(limit - base + 1) });
  assert.equal(over.ok, false);
  assert.match(over.errors[0].message, /too large/i);
  assert.equal(check({ event_details: fill(Math.floor(limit * 0.95) - base) }).warnings.length, 1, 'warns near the limit');
});

test('errors never throw on hostile input', () => {
  const hostile = { id: {}, title: [], category: 5, description: null, date: {}, layout: [], speakers: 'x', key_points: {}, links: 'x', image: 5, logo: [], brochure: {}, event_details: { a: undefined } };
  assert.doesNotThrow(() => V.validateRecord(hostile, { isNew: true, existingIds: null }));
  const cyc = { id: 'ab', title: 't', category: 'c' };
  assert.doesNotThrow(() => V.validateRecord(Object.assign(cyc, { event_details: { a: { b: { c: 1 } } } })));
});
