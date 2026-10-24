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

// ---------------------------------------------------------------------------------------------------------
// Error handling: pages, scripts, palette, catalog <-> documentation, secrets, hosting config, workflows
// ---------------------------------------------------------------------------------------------------------
const exists = (file) => fs.existsSync(path.join(root, file));

// 1. Static error pages exist, are noindex, share one <base>, and every local reference resolves.
const errorPages = ['404.html', '403.html', '500.html', '503.html', 'offline.html'];
const bases = new Set();
errorPages.forEach((file) => {
  if (!exists(file)) return errors.push(`${file}: error page is missing`);
  const html = read(file);
  const base = /<base href="([^"]+)"/.exec(html);
  assert(base, `${file}: needs <base href> because it is served at the failing URL`);
  if (base) bases.add(base[1]);
  assert(/<meta name="robots" content="noindex/.test(html), `${file}: must be noindex`);
  assert(/<link rel="stylesheet" href="error\.css"/.test(html), `${file}: must load error.css`);
  assert(/<script src="error-page\.js"/.test(html), `${file}: must load error-page.js`);
  assert(/<h1[ >]/.test(html) && /<main/.test(html), `${file}: needs a main landmark and an h1`);
  assert(/href="index\.html"/.test(html), `${file}: needs a way back to the homepage`);
  [...html.replace(/<base\b[^>]*>/gi, '').matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((v) => !/^(?:[a-z]+:|\/\/|#)/i.test(v)).forEach((ref) => {
    const local = ref.split(/[?#]/, 1)[0];
    if (local && !exists(local)) errors.push(`${file}: missing local reference ${ref}`);
  });
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), `${file}: no inline scripts`);
});
assert(bases.size <= 1, `error pages disagree on <base href>: ${[...bases].join(', ')}`);
const sitemapText = read('sitemap.xml');
errorPages.forEach((file) => assert(!sitemapText.includes(file), `sitemap.xml must not list ${file}`));

// 2. Script load order: the error modules must come first, and every referenced script must exist.
function scriptOrder(file, order) {
  const html = read(file);
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
  let last = -1;
  order.forEach((name) => {
    const at = scripts.findIndex((s) => s.endsWith(name));
    if (at < 0) return errors.push(`${file}: ${name} is not loaded`);
    if (at < last) errors.push(`${file}: ${name} is loaded too early; required order is ${order.join(' -> ')}`);
    last = at;
  });
  return scripts;
}
['index.html', 'event.html'].forEach((file) => {
  scriptOrder(file, ['error-catalog.js', 'error-handler.js', 'data.js', 'config.js', 'content-map.js', 'content-loader.js']);
  assert(/<link rel="stylesheet" href="error\.css"/.test(read(file)), `${file}: must load error.css`);
});
const panelScripts = scriptOrder('prezi_panel/index.html', ['vendor/supabase.js', '../error-catalog.js', '../error-handler.js', 'event-validator.js', 'admin-core.js',
  'database-diagnostics.js', 'operation-status.js', 'event-template.js', 'admin-forms.js', 'admin-app.js']);
panelScripts.forEach((src) => { if (!/^(?:[a-z]+:|\/\/)/i.test(src) && !fs.existsSync(path.join(root, 'prezi_panel', src))) errors.push(`prezi_panel/index.html: missing script ${src}`); });
assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(read('prezi_panel/index.html')), 'prezi_panel/index.html: inline scripts would break its Content-Security-Policy');
assert(/script-src 'self'/.test(read('prezi_panel/index.html')) && !/script-src[^;]*unsafe-inline/.test(read('prezi_panel/index.html')), 'prezi_panel/index.html: CSP must keep script-src \'self\' without unsafe-inline');

// 3. The error stylesheet's palette copies must not drift from styles.css.
const tokens = (text, names) => Object.fromEntries(names.map((n) => [n, (new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{3,8})`).exec(text) || [])[1]]));
const siteTokens = tokens(read('styles.css'), ['ink', 'maroon', 'maroon-deep', 'cream', 'accent']);
const errTokens = tokens(read('error.css').replace(/--e-/g, '--'), ['ink', 'maroon', 'maroon-deep', 'cream', 'accent']);
Object.keys(siteTokens).forEach((name) => {
  if (!siteTokens[name]) return errors.push(`styles.css: could not read --${name}`);
  assert((errTokens[name] || '').toLowerCase() === siteTokens[name].toLowerCase(), `error.css --e-${name} (${errTokens[name]}) differs from styles.css --${name} (${siteTokens[name]})`);
});

// 4. Every error code in the catalog is documented, and the docs name no code that does not exist.
const catalog = require(path.join(root, 'error-catalog.js'));
const errorsDoc = exists('ERRORS.md') ? read('ERRORS.md') : '';
assert(errorsDoc, 'ERRORS.md is missing');
catalog.list.forEach((entry) => assert(errorsDoc.includes(entry.code), `ERRORS.md does not document ${entry.code}`));
[...new Set(errorsDoc.match(/BLITZ-[A-Z]+-\d{3}/g) || [])].forEach((code) => assert(catalog.has(code), `ERRORS.md mentions ${code}, which is not in error-catalog.js`));
// Every code the source can produce must exist in the catalog.
['error-handler.js', 'content-loader.js', 'event-page.js', 'prezi_panel/admin-app.js', 'prezi_panel/database-diagnostics.js', 'prezi_panel/operation-status.js'].forEach((file) => {
  [...new Set(read(file).match(/BLITZ-[A-Z]+-\d{3}/g) || [])].forEach((code) => assert(catalog.has(code), `${file} uses ${code}, which is not in error-catalog.js`));
});

// 5. No secret or service-role key anywhere in files that ship to the browser or are committed.
function walk(dir, found = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (['node_modules', '.git', 'vendor', 'assets'].includes(entry.name)) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found); else if (/\.(js|html|css|json|md|yml|yaml|sql|py|example|env)$/.test(entry.name) || entry.name.startsWith('.env')) found.push(full);
  });
  return found;
}
walk(root).forEach((file) => {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text) && !/^tests\//.test(rel) && !/run_error_tests\.py$/.test(rel)) errors.push(`${rel}: contains what looks like a Supabase secret key`);
  (text.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g) || []).forEach((token) => {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).role === 'service_role') errors.push(`${rel}: contains a service_role JWT`); } catch (e) { /* not a JWT payload */ }
  });
});
const configText = read('config.js');
assert(!/service_role|sb_secret_/.test(configText), 'config.js must only hold the public publishable/anon key');

// 6. Hosting config: every ErrorDocument points at a page that exists; documented, not assumed.
['.htaccess.example'].forEach((file) => {
  if (!exists(file)) return errors.push(`${file}: missing (custom error pages need server configuration)`);
  const docs = [...read(file).matchAll(/^\s*ErrorDocument\s+(\d{3})\s+\S*?\/?([A-Za-z0-9_.-]+\.html)\s*$/gm)];
  ['403', '404', '500', '503'].forEach((code) => assert(docs.some((d) => d[1] === code), `${file}: no ErrorDocument for ${code}`));
  docs.forEach((d) => assert(exists(d[2]), `${file}: ErrorDocument ${d[1]} points at missing ${d[2]}`));
});

// 7. Workflows: every secret a workflow reads is documented by name, and none is echoed.
if (exists('.github/workflows')) {
  const documented = read('README.md') + errorsDoc;
  fs.readdirSync(path.join(root, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f)).forEach((file) => {
    const text = read(`.github/workflows/${file}`);
    [...new Set([...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].forEach((name) => {
      if (name !== 'GITHUB_TOKEN') assert(documented.includes(name), `${file}: secret ${name} is not documented in README.md or ERRORS.md`);
    });
    assert(!/echo[^\n]*\$\{\{\s*secrets\./.test(text) && !/set -x/.test(text), `${file}: must not print secrets (echo of a secret or set -x)`);
  });
}

if (errors.length) {
  console.error('Site validation errors:\n- ' + errors.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Site URL, metadata, sitemap, robots, local references, error pages, script order, palette sync, error catalog, secrets, hosting config and workflows passed.');
}
