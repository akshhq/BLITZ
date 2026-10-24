#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
const data = context.window.BLITZ_DATA || {};
const errors = [];
const warnings = [];
const seenIds = new Set();

function checkLocalAsset(value, label) {
  if (!value || /^https?:\/\//i.test(value)) return;
  if (!fs.existsSync(path.join(root, value))) errors.push(`${label}: missing local asset ${value}`);
}

function validDate(value) {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3]);
}

(Array.isArray(data.events) ? data.events : []).forEach((event, index) => {
  const label = event && event.id ? event.id : `events[${index}]`;
  if (!event || typeof event !== 'object') return errors.push(`${label}: record must be an object`);
  if (!event.id || typeof event.id !== 'string') errors.push(`${label}: missing stable id`);
  if (seenIds.has(event.id)) errors.push(`${label}: duplicate id`);
  seenIds.add(event.id);
  ['title', 'category'].forEach((field) => {
    if (!event[field] || typeof event[field] !== 'string') errors.push(`${label}: missing ${field}`);
  });
  if ((!event.description || typeof event.description !== 'string') && !event.placeholder) {
    errors.push(`${label}: missing description`);
  }
  if (event.date && !validDate(event.date)) errors.push(`${label}: invalid date ${event.date}`);
  if (!event.date) warnings.push(`${label}: date requires society verification`);
  if (event.time && /conflict|pending|to be confirmed|to be announced/i.test(event.time)) {
    errors.push(`${label}: editorial or unresolved text in time`);
  }
  if (event.location && /conflict|pending|to be confirmed|to be announced/i.test(event.location)) {
    warnings.push(`${label}: unresolved text in location`);
  }
  if (event.image) checkLocalAsset(event.image, `${label}: image`);
  if (event.logo) checkLocalAsset(event.logo, `${label}: logo`);
});

(Array.isArray(data.announcements) ? data.announcements : []).forEach((item, index) => {
  const label = item && item.id ? item.id : `announcements[${index}]`;
  if (!item.title || typeof item.title !== 'string') errors.push(`${label}: missing title`);
  if (!validDate(item.date)) warnings.push(`${label}: date requires verification`);
  if (item.link && !/^https?:\/\//i.test(item.link)) errors.push(`${label}: unsupported link`);
});

(Array.isArray(data.gallery) ? data.gallery : []).forEach((item, index) => {
  if (!item || typeof item !== 'object') return errors.push(`gallery[${index}]: record must be an object`);
  if (item.image) {
    checkLocalAsset(item.image, `gallery[${index}]`);
    if (/\.svg(?:$|[?#])/i.test(item.image) && item.mediaType !== 'illustration') {
      errors.push(`gallery[${index}]: SVG media must be classified as an illustration`);
    }
  }
  if (item.mediaType === 'illustration' && item.alt && !/illustration|graphic|diagram|rendering/i.test(item.alt)) {
    warnings.push(`gallery[${index}]: illustration alt text should describe the artwork, not a photograph`);
  }
});

(Array.isArray(data.team) ? data.team : []).forEach((item, index) => {
  if (item && item.photo) checkLocalAsset(item.photo, `team[${index}]`);
});

// ---- Same rules the Prezi Panel enforces before a write (prezi_panel/event-validator.js), applied to the bundled events ----
const V = require(path.join(root, 'prezi_panel', 'event-validator.js'));
function toRow(e) {
  return {
    id: e.id, title: e.title, date: e.date || null, time: e.time, location: e.location, description: e.description || '', category: e.category,
    layout: e.layout, format: e.format, platform: e.platform, participants: e.participants, speakers: e.speakers, key_points: e.keyPoints,
    winners: e.winners, sessions: e.sessions, competition_sections: e.competitionSections, links: e.links, image: e.image, image_alt: e.imageAlt,
    logo: e.logo, brochure: e.brochure, additional_info: e.additionalInfo, placeholder: e.placeholder, published: true
  };
}
(Array.isArray(data.events) ? data.events : []).forEach((event, index) => {
  if (!event || typeof event !== 'object') return;
  const label = event.id || `events[${index}]`;
  const checked = V.validateRecord(toRow(event), { isNew: false });
  checked.errors.forEach((problem) => errors.push(`${label}: ${problem.field ? problem.field + ': ' : ''}${problem.message}`));
  if (event.brochure) checkLocalAsset(event.brochure, `${label}: brochure`);
});

// ---- JSON files: syntax, and the event template/sample must pass the importer's own validation ----
function jsonFiles(dir, found = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (['node_modules', '.git', 'vendor'].includes(entry.name)) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) jsonFiles(full, found);
    else if (entry.name.endsWith('.json')) found.push(full);
  });
  return found;
}
jsonFiles(root).forEach((file) => {
  try { JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { errors.push(`${path.relative(root, file)}: invalid JSON (${error.message})`); }
});
(function checkTemplates() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  ['prezi_panel/event-validator.js', 'prezi_panel/event-template.js'].forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file }));
  const T = sandbox.window.BLITZ_TEMPLATE;
  if (!T || typeof T.normalize !== 'function') return errors.push('prezi_panel/event-template.js: BLITZ_TEMPLATE.normalize is not exposed');
  ['BLITZ_EVENT_TEMPLATE.json', 'sample.json'].forEach((file) => {
    if (!fs.existsSync(path.join(root, file))) return;
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '')); } catch (error) { return; }
    const result = T.normalize(raw);
    // The blank template is allowed to be incomplete (it is a form to fill in); the sample must import cleanly.
    if (file === 'sample.json') (result.errors || []).forEach((message) => errors.push(`${file}: ${message}`));
    else if (!result.event && !(result.errors || []).length) errors.push(`${file}: importer produced nothing`);
  });
}());

if (errors.length || warnings.length) {
  if (errors.length) console.error('Data errors:\n- ' + errors.join('\n- '));
  if (warnings.length) console.warn('Data warnings:\n- ' + warnings.join('\n- '));
  process.exitCode = errors.length ? 1 : 0;
} else {
  console.log('BLITZ data validation passed with no errors or warnings.');
}
