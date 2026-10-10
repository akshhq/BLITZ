#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productionBase = 'https://keshav.du.ac.in/blitz/';
const errors = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function checkHtml(file, canonical) {
  const html = read(file);
  assert(html.includes(`<link rel="canonical" href="${canonical}"`), `${file}: canonical URL mismatch`);
  assert(/<title>[^<]+<\/title>/.test(html), `${file}: missing title`);
  assert(/<meta\s+[^>]*name="description"[^>]*content="[^"]+"/.test(html), `${file}: missing description`);
  assert(/<link\s+[^>]*href="styles\.css"/.test(html), `${file}: missing stylesheet`);

  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:[a-z]+:|\/\/|#)/i.test(value));
  references.forEach((reference) => {
    const localPath = reference.split(/[?#]/, 1)[0];
    if (localPath && !fs.existsSync(path.join(root, localPath))) {
      errors.push(`${file}: missing local reference ${reference}`);
    }
  });
}

checkHtml('index.html', productionBase);
checkHtml('event.html', `${productionBase}event.html`);

const sitemap = read('sitemap.xml');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(sitemapUrls.length === 2, 'sitemap.xml: expected homepage and event page only');
assert(sitemapUrls.includes(productionBase), 'sitemap.xml: missing homepage URL');
assert(sitemapUrls.includes(`${productionBase}event.html`), 'sitemap.xml: missing event page URL');
assert(!/<lastmod>/.test(sitemap), 'sitemap.xml: unverified lastmod must not be published');

const robots = read('robots.txt');
assert(robots.includes(`Sitemap: ${productionBase}sitemap.xml`), 'robots.txt: sitemap URL mismatch');

if (errors.length) {
  console.error('Site validation errors:\n- ' + errors.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Site URL, metadata, sitemap, robots, and local references passed.');
}
