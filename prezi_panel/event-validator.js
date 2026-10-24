/*
 * Event validator for the Prezi Panel (browser) and for tools/tests (Node).
 *
 * It mirrors the CHECK constraints in supabase/schema.sql so a bad value is caught with a field-specific
 * message BEFORE any database write, instead of surfacing later as an opaque "check constraint" error.
 * The database remains the final authority: this module never replaces those constraints.
 *
 *   validateRecord(row, { isNew, existingIds, requireDescription }) -> { ok, errors: [{ field, message }], warnings: [] }
 *   validateDetails(details)                                         -> [{ field, message }]
 *
 * Source of truth for limits: public.events in supabase/schema.sql. Keep them in step.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BLITZ_EVENT_VALIDATOR = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var LAYOUTS = ['event', 'workshop', 'competition', 'festival', 'speaker'];
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{1,78}$/;
  var HTTPS_RE = /^https:\/\/[^\s<>"']+$/i;
  var IMAGE_RE = /^(assets\/|storage:)[A-Za-z0-9\/_.-]{1,200}$/;
  var BROCHURE_ASSET_RE = /^assets\/[A-Za-z0-9\/_.-]{1,200}$/;
  var UNSAFE_SCHEME_RE = /^\s*(javascript|data|vbscript):/i;
  var URL_KEY_RE = /(^|_)(url|link|links|website|href)$/i;
  var LIMITS = {
    detailsBytes: 50000, listBytes: 20000, detailsDepth: 10, detailsArray: 500,
    title: 200, time: 60, location: 200, description: 2000, category: 80, format: 120, platform: 80,
    participants: 80, imageAlt: 300, additionalInfo: 1500, speakers: 30, speaker: 120, keyPoints: 30, keyPoint: 300,
    jsonList: 30, links: 20, linkLabel: 100, url: 1000, statusText: 60
  };

  function utf8Bytes(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i += 1; }
      else n += 3;
    }
    return n;
  }

  // Length of the value as Postgres prints jsonb::text: ': ' after keys and ', ' between items.
  function pgJsonLength(value) {
    function len(v) {
      if (v === null || v === undefined) return 4;
      if (Array.isArray(v)) return 2 + v.reduce(function (a, x) { return a + len(x); }, 0) + Math.max(0, v.length - 1) * 2;
      if (typeof v === 'object') {
        var keys = Object.keys(v);
        return 2 + keys.reduce(function (a, k) { return a + utf8Bytes(JSON.stringify(k)) + 2 + len(v[k]); }, 0) + Math.max(0, keys.length - 1) * 2;
      }
      return utf8Bytes(JSON.stringify(v));
    }
    return len(value);
  }

  function isValidDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }
  function isStr(v) { return typeof v === 'string'; }
  function empty(v) { return v === undefined || v === null || v === ''; }

  /* ----------------------------------------------------------------------------- event_details */
  function validateDetails(details) {
    var errors = [];
    function add(path, message) { errors.push({ field: path, message: message }); }
    if (details === undefined || details === null) return errors;
    if (typeof details !== 'object' || Array.isArray(details)) {
      add('event_details', 'Event details must be a JSON object, not ' + (Array.isArray(details) ? 'a list' : typeof details) + '.');
      return errors;
    }
    var size = pgJsonLength(details);
    if (size > LIMITS.detailsBytes) add('event_details', 'Event details are too large (' + size + ' bytes; the limit is ' + LIMITS.detailsBytes + '). Remove some entries.');

    (function walk(value, path, depth) {
      if (errors.length > 40) return;                       // enough to act on; do not flood the screen
      if (depth > LIMITS.detailsDepth) { add(path, 'Nested too deeply (more than ' + LIMITS.detailsDepth + ' levels).'); return; }
      if (Array.isArray(value)) {
        if (value.length > LIMITS.detailsArray) add(path, 'Too many entries (' + value.length + '; the limit is ' + LIMITS.detailsArray + ').');
        value.forEach(function (item, i) {
          if (typeof item === 'string' && /(^|_)links?$/i.test(path.split('.').pop().replace(/\[\d+\]$/, '')) && item !== '' && !HTTPS_RE.test(item)) {
            add(path + '[' + i + ']', 'Links must start with https://');
          }
          walk(item, path + '[' + i + ']', depth + 1);
        });
        return;
      }
      if (value && typeof value === 'object') {
        Object.keys(value).forEach(function (k) {
          var child = value[k], p = path + '.' + k;
          if (isStr(child) && URL_KEY_RE.test(k) && child !== '' && !HTTPS_RE.test(child)) add(p, 'Must be a full link that starts with https://');
          else if (isStr(child) && URL_KEY_RE.test(k) && child.length > LIMITS.url) add(p, 'Link is too long.');
          walk(child, p, depth + 1);
        });
        return;
      }
      if (isStr(value) && UNSAFE_SCHEME_RE.test(value)) add(path, 'This value looks like a script or data link, which is not allowed.');
    }(details, 'event_details', 1));

    if (details.status !== undefined && details.status !== null && (!isStr(details.status) || details.status.length > LIMITS.statusText)) {
      add('event_details.status', 'Status must be short text (up to ' + LIMITS.statusText + ' characters).');
    }
    return errors;
  }

  /* ----------------------------------------------------------------------------- the event row */
  function validateRecord(row, opts) {
    opts = opts || {};
    var errors = [], warnings = [];
    function add(field, message) { errors.push({ field: field, message: message }); }
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { ok: false, errors: [{ field: '', message: 'The event must be an object.' }], warnings: warnings };

    function text(field, max, required) {
      var v = row[field];
      if (empty(v)) { if (required) add(field, 'This field is required.'); return; }
      if (!isStr(v)) { add(field, 'Must be text.'); return; }
      if (required && !v.trim()) add(field, 'This field is required.');
      if (v.length > max) add(field, 'Too long (' + v.length + ' characters; the limit is ' + max + ').');
    }
    function list(field, maxItems, maxEach) {
      var v = row[field];
      if (empty(v)) return;
      if (!Array.isArray(v)) { add(field, 'Must be a list.'); return; }
      if (v.length > maxItems) add(field, 'Too many entries (' + v.length + '; the limit is ' + maxItems + ').');
      v.forEach(function (x, i) {
        if (!isStr(x)) add(field + '[' + i + ']', 'Each entry must be text.');
        else if (x.length > maxEach) add(field + '[' + i + ']', 'Entry is too long (limit ' + maxEach + ' characters).');
      });
    }
    function jsonList(field) {
      var v = row[field];
      if (empty(v)) return;
      if (!Array.isArray(v)) { add(field, 'Must be a list.'); return; }
      if (v.length > LIMITS.jsonList) add(field, 'Too many entries (' + v.length + '; the limit is ' + LIMITS.jsonList + ').');
      if (pgJsonLength(v) > LIMITS.listBytes) add(field, 'Too large (limit ' + LIMITS.listBytes + ' bytes).');
    }

    // id
    if (empty(row.id)) add('id', 'This field is required.');
    else if (!isStr(row.id) || !SLUG_RE.test(row.id)) add('id', 'Use lowercase letters, numbers and dashes only (2 to 79 characters, starting with a letter or number).');
    else if (opts.isNew && Array.isArray(opts.existingIds) && opts.existingIds.indexOf(row.id) >= 0) add('id', 'Another event already uses this ID. Choose a different one.');

    text('title', LIMITS.title, true);
    text('category', LIMITS.category, true);
    text('time', LIMITS.time);
    text('location', LIMITS.location);
    text('format', LIMITS.format);
    text('platform', LIMITS.platform);
    text('participants', LIMITS.participants);
    text('image_alt', LIMITS.imageAlt);
    text('additional_info', LIMITS.additionalInfo);
    text('description', LIMITS.description, !!opts.requireDescription && row.placeholder !== true);

    if (!empty(row.date) && (!isStr(row.date) || !isValidDate(row.date))) add('date', 'Enter a real date in the form YYYY-MM-DD.');
    if (!empty(row.layout) && LAYOUTS.indexOf(row.layout) < 0) add('layout', 'Must be one of: ' + LAYOUTS.join(', ') + '.');
    if (row.published !== undefined && typeof row.published !== 'boolean') add('published', 'Must be true or false.');
    if (row.placeholder !== undefined && typeof row.placeholder !== 'boolean') add('placeholder', 'Must be true or false.');

    list('speakers', LIMITS.speakers, LIMITS.speaker);
    list('key_points', LIMITS.keyPoints, LIMITS.keyPoint);
    jsonList('winners');
    jsonList('sessions');
    jsonList('competition_sections');

    if (!empty(row.links)) {
      if (!Array.isArray(row.links)) add('links', 'Must be a list.');
      else {
        if (row.links.length > LIMITS.links) add('links', 'Too many links (limit ' + LIMITS.links + ').');
        row.links.forEach(function (l, i) {
          if (!l || typeof l !== 'object' || Array.isArray(l)) return add('links[' + i + ']', 'Each link needs a label and a URL.');
          if (!isStr(l.label) || l.label.length < 1 || l.label.length > LIMITS.linkLabel) add('links[' + i + '].label', 'Label is required (up to ' + LIMITS.linkLabel + ' characters).');
          if (!isStr(l.url) || !HTTPS_RE.test(l.url) || l.url.length > LIMITS.url) add('links[' + i + '].url', 'Link must start with https://');
        });
      }
    }

    ['image', 'logo'].forEach(function (f) {
      var v = row[f];
      if (empty(v)) return;
      if (!isStr(v) || !IMAGE_RE.test(v) || v.indexOf('..') >= 0) add(f, 'Image reference must be an uploaded image or an assets/ path (no "..", no external addresses).');
    });
    if (!empty(row.brochure)) {
      var b = row.brochure;
      if (!isStr(b) || !((HTTPS_RE.test(b) && b.length <= LIMITS.url) || (BROCHURE_ASSET_RE.test(b) && b.indexOf('..') < 0))) {
        add('brochure', 'Brochure must be an https:// link or an assets/ path.');
      }
    }

    validateDetails(row.event_details).forEach(function (e) { errors.push(e); });
    if (row.event_details && typeof row.event_details === 'object' && !Array.isArray(row.event_details)) {
      var size = pgJsonLength(row.event_details);
      if (size > LIMITS.detailsBytes * 0.9 && size <= LIMITS.detailsBytes) warnings.push('Event details are close to the size limit (' + size + ' of ' + LIMITS.detailsBytes + ' bytes).');
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  return {
    LIMITS: LIMITS,
    LAYOUTS: LAYOUTS,
    pgJsonLength: pgJsonLength,
    isValidDate: isValidDate,
    validateRecord: validateRecord,
    validateDetails: validateDetails
  };
}));
