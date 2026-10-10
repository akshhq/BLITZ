#!/usr/bin/env node
/**
 * Regenerates the <noscript> fallbacks in index.html from data.js, so visitors without
 * JavaScript (and link scrapers / simple crawlers) still get the team, events, contact
 * details and latest announcement as plain HTML.
 *
 *     node tools/sync-noscript.js
 *
 * Optional maintainer tool: Node.js only, no packages. The site itself never needs it.
 * It rewrites whatever sits between the `<!-- ns:NAME:start -->` / `<!-- ns:NAME:end -->`
 * markers in index.html. Run it after editing events, team, announcements or contact.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), ctx);
const DATA = ctx.window.BLITZ_DATA;

// Keep in sync with the `tiers` array in script.js (renderTeam).
const TIERS = [
  ['core', 'Leadership'],
  ['senior', 'Senior Executives'],
  ['junior', 'Junior Executives'],
  ['volunteer', 'Volunteers']
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => { const [y, m, d] = String(iso).split('-'); return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`; };
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const bare = (u) => u.replace(/^https?:\/\/(www\.)?/, '');
const ext = 'target="_blank" rel="noopener noreferrer"';

const blocks = {
  announcements() {
    const latest = [...DATA.announcements].sort(byDateDesc)[0];
    if (!latest) return '';
    return `<noscript><span class="announcement-item-btn"><span class="announcement-item-date">${esc(fmt(latest.date))}</span><span class="announcement-item-title">${esc(latest.title)}</span></span></noscript>`;
  },
  events() {
    const items = [...DATA.events].sort(byDateDesc).map((e) =>
      `<li><strong>${esc(e.title)}</strong> &mdash; ${esc(fmt(e.date))}, ${esc(e.location)}. ${esc(e.description)}</li>`).join('\n            ');
    return `<noscript>\n          <div class="ns-block">\n            <ul class="ns-list">\n            ${items}\n            </ul>\n          </div>\n        </noscript>`;
  },
  team() {
    const out = TIERS.map(([key, label]) => {
      const people = DATA.team.filter((m) => m.tier === key);
      if (!people.length) return '';
      return `<h3>${esc(label)}</h3>\n            <ul class="ns-list ns-list--dark">\n              ${people.map((m) => `<li>${esc(m.name)}, ${esc(m.position)}</li>`).join('\n              ')}\n            </ul>`;
    }).filter(Boolean).join('\n            ');
    return `<noscript>\n          <div class="ns-block ns-block--dark">\n            ${out}\n          </div>\n        </noscript>`;
  },
  contact() {
    const c = DATA.contact;
    return `<noscript>
          <ul class="ns-list">
            <li>Mail: <a href="mailto:${esc(c.mail)}">${esc(c.mail)}</a></li>
            <li>Instagram: <a href="${esc(c.instagram)}" ${ext}>${esc(c.instagramHandle)}</a></li>
            <li>LinkedIn: <a href="${esc(c.linkedin)}" ${ext}>${esc(bare(c.linkedin))}</a></li>
            <li>Location: <a href="${esc(c.mapsUrl)}" ${ext}>${esc(c.location)}</a></li>
          </ul>
        </noscript>`;
  }
};

const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');
for (const name of Object.keys(blocks)) {
  const re = new RegExp(`(<!-- ns:${name}:start -->)[\\s\\S]*?(<!-- ns:${name}:end -->)`);
  if (!re.test(html)) throw new Error(`Marker pair ns:${name} not found in index.html`);
  html = html.replace(re, (_, a, b) => `${a}\n          ${blocks[name]()}\n          ${b}`);
}
fs.writeFileSync(file, html);
console.log('index.html <noscript> blocks synced from data.js');
