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

if (errors.length || warnings.length) {
  if (errors.length) console.error('Data errors:\n- ' + errors.join('\n- '));
  if (warnings.length) console.warn('Data warnings:\n- ' + warnings.join('\n- '));
  process.exitCode = errors.length ? 1 : 0;
} else {
  console.log('BLITZ data validation passed with no errors or warnings.');
}
