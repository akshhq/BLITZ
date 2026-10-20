(function () {
  'use strict';

  var TEMPLATE = 'BLITZ_EVENT';
  var VERSION = 1;
  var MAX_BYTES = 1024 * 1024;
  var DIRECT = ['id', 'title', 'date', 'time', 'location', 'category', 'layout', 'format',
    'platform', 'participants', 'description', 'additional_info', 'placeholder', 'published'];
  var ARRAYS = ['objectives', 'highlights', 'activities', 'organizers', 'faculty', 'guests',
    'speakers', 'judges', 'agenda', 'sessions', 'teams', 'results', 'key_points',
    'competition_sections', 'winners', 'links', 'rules', 'eligibility', 'target_audience',
    'faculty_coordinators', 'student_organizers', 'mentors', 'partners', 'sponsors',
    'collaborators', 'participating_institutions', 'runner_ups', 'special_mentions',
    'prizes', 'outcomes', 'acknowledgements', 'registration_links', 'social_links',
    'resource_links', 'result_links', 'promotional_posters', 'booklets', 'certificates',
    'result_sheets'];
  var EXTRA_FIELDS = ['tagline', 'event_type', 'academic_year', 'organizing_department',
    'start_date', 'end_date', 'start_time', 'end_time', 'status', 'participant_count',
    'team_count', 'summary', 'theme', 'modules', 'official_website', 'homepage_featured',
    'display_order'];
  var ALL_FIELDS = DIRECT.concat(ARRAYS, EXTRA_FIELDS, ['media', 'registration', 'seo']);

  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function validLayout(value) {
    return ['event', 'workshop', 'competition', 'festival', 'speaker'].indexOf(value) >= 0;
  }
  function validDate(value) {
    if (!value) return true;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return false;
    var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return date.getFullYear() === Number(m[1]) && date.getMonth() === Number(m[2]) - 1 &&
      date.getDate() === Number(m[3]);
  }
  function safeJson(value) {
    try { return JSON.stringify(value == null ? {} : value, null, 2); } catch (e) { return '{}'; }
  }

  function normalize(raw) {
    var errors = [], warnings = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { errors: ['The template must contain a JSON object.'], warnings: [] };
    }
    if (raw.template !== TEMPLATE) errors.push('Unsupported template identifier. Download the current BLITZ event template.');
    if (raw.version !== VERSION) errors.push('Unsupported template version. Download the current BLITZ event template.');
    var source = raw.event;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push('Missing event object.');
      return { errors: errors, warnings: warnings };
    }
    var event = {};
    Object.keys(source).forEach(function (key) {
      if (ALL_FIELDS.indexOf(key) < 0) errors.push('Unsupported event field "' + key + '".');
    });
    DIRECT.forEach(function (key) {
      if (key !== 'published' && key !== 'placeholder' && source[key] !== undefined &&
        source[key] !== null && typeof source[key] !== 'string') {
        errors.push('Field "' + key + '" must be a string.');
      }
    });
    ARRAYS.forEach(function (key) {
      if (source[key] !== undefined && !Array.isArray(source[key])) errors.push('Field "' + key + '" must be an array.');
    });
    if (source.media !== undefined && (!source.media || typeof source.media !== 'object' || Array.isArray(source.media))) {
      errors.push('Field "media" must be an object.');
    }
    DIRECT.forEach(function (key) {
      if (key === 'published') return;
      event[key] = key === 'placeholder' ? source[key] === true : text(source[key]);
    });
    event.layout = validLayout(event.layout) ? event.layout : 'event';
    event.published = false;
    if (!event.date) event.date = text(source.start_date);
    if (!event.time) event.time = text(source.start_time);
    if (!event.id) event.id = text(source.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 78);
    if (!event.title) errors.push('Required field missing: title.');
    if (!event.category) errors.push('Required field missing: category.');
    if (!event.description && !event.placeholder) errors.push('Required field missing: description.');
    if (!validDate(event.date)) errors.push('Date must use YYYY-MM-DD.');
    if (source.layout && !validLayout(source.layout)) errors.push('Layout must be event, workshop, competition, festival, or speaker.');
    var details = {};
    ARRAYS.forEach(function (key) { details[key] = clone(array(source[key])); });
    EXTRA_FIELDS.forEach(function (key) {
      if (source[key] !== undefined) details[key] = clone(source[key]);
    });
    details.media = source.media && typeof source.media === 'object' ? clone(source.media) : {};
    details.media.gallery = array(details.media.gallery);
    details.media.documents = array(details.media.documents);
    details.registration = source.registration && typeof source.registration === 'object' ? clone(source.registration) : {};
    details.seo = source.seo && typeof source.seo === 'object' ? clone(source.seo) : {};
    details.template_version = VERSION;
    if (details.media.poster || details.media.cover || details.media.brochure ||
      details.media.gallery.length || details.media.documents.length) {
      warnings.push('Media references are notes only; upload each asset in the panel.');
    }
    if (details.registration.url && !/^https:\/\//i.test(details.registration.url)) {
      warnings.push('Registration URL needs attention: only HTTPS links are accepted.');
    }
    event.key_points = details.key_points;
    event.competition_sections = details.competition_sections;
    event.winners = details.winners;
    event.links = details.links;
    event.speakers = details.speakers;
    event.sessions = details.sessions;
    event.brochure = /^https:\/\//i.test(text(details.media.brochure)) ||
      /^assets\/[A-Za-z0-9/_.-]{1,200}$/.test(text(details.media.brochure))
      ? text(details.media.brochure) : '';
    if (details.media.brochure && !event.brochure) {
      warnings.push('Brochure reference was not copied as a URL; upload the brochure or provide an HTTPS/assets path.');
    }
    if (!/^[a-z0-9][a-z0-9-]{1,78}$/.test(event.id)) errors.push('ID must contain lowercase letters, numbers, and dashes only.');
    event.event_details = details;
    return { event: event, details: details, errors: errors, warnings: warnings };
  }

  function read(file) {
    return new Promise(function (resolve) {
      if (!file) return resolve({ errors: ['Choose an event template file first.'], warnings: [] });
      if (file.size > MAX_BYTES) return resolve({ errors: ['The template is larger than 1 MB.'], warnings: [] });
      if (file.type && file.type !== 'application/json' && !/\.json$/i.test(file.name || '')) {
        return resolve({ errors: ['Unsupported file type. Upload the downloaded .json event template.'], warnings: [] });
      }
      var reader = new FileReader();
      reader.onerror = function () { resolve({ errors: ['The template could not be read.'], warnings: [] }); };
      reader.onload = function () {
        var raw;
        try { raw = JSON.parse(String(reader.result || '')); }
        catch (e) { return resolve({ errors: ['Invalid JSON. Download a fresh template and keep the JSON structure intact.'], warnings: [] }); }
        resolve(normalize(raw));
      };
      reader.readAsText(file);
    });
  }

  window.BLITZ_TEMPLATE = {
    file: '../BLITZ_EVENT_TEMPLATE.json',
    maxBytes: MAX_BYTES,
    read: read,
    normalize: normalize,
    stringify: safeJson
  };
}());
