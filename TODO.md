# BLITZ Website TODO

This checklist contains work that still needs verified information, permissions,
a deployed environment, or physical-device testing.

## 1. Manual content verification

- [ ] Verify the official dates and times for all events using authoritative
  society sources. Resolve any conflicts before publishing them.
- [ ] Confirm that the published event titles, descriptions, speakers,
  locations, schedules, session summaries, competition names, and Code Verse
  winners are approved for public release. This prevents the site from
  presenting unverified editorial content as official information.
- [ ] Supply approved event photographs, source descriptions, attribution, and
  publication permissions for the five gallery records. Current SVG assets are
  explicitly labeled illustrations and must not be presented as photographs.
- [ ] Supply verified collaboration names, relationship types, logos,
  destination URLs, and approval to publish them. Neutral non-clickable
  placeholders must remain until these facts are confirmed.

## 2. Access and permissions

- [ ] Verify that the published SIH result PDF remains accessible to intended
  readers without requesting private Google Drive access. This confirms that
  the supplied sharing setting works for the public announcement.
- [ ] Verify the Instagram, LinkedIn, email, and Google Maps contact details
  against the society's current official accounts.
- [ ] Supply approved faculty portraits or confirm that neutral avatar placeholders are preferred; confirm permission and attribution for every team photograph and gallery asset before production publication.
- [ ] Confirm the canonical host, Open Graph image URL, JSON-LD URLs, sitemap
  URL, and parent-college URL with the hosting owner.

## 3. Manual QA

- [x] Test keyboard-only navigation, visible focus, Escape handling, mobile
  menu focus trapping, announcement-dialog focus return, and event selection
  (verified locally in headless Chrome; re-verify on the deployed pages).
- [x] Test with JavaScript disabled and confirm the generated no-JavaScript
  event, team, announcement, and contact fallbacks remain accurate and
  readable (including the `<noscript>` fallback added to `event.html`).
- [ ] Test mobile, tablet, and desktop layouts on physical devices, including
  gallery scrolling, sticky event panels, Launchpad detail spacing, safe-area
  insets, and dynamic text scaling.
- [ ] Test `prefers-reduced-motion` on physical iOS, Android, and desktop
  browsers, confirming that content remains usable without scroll-driven
  animation.
- [ ] Run Lighthouse or an equivalent accessibility audit against the deployed
  URL and manually inspect contrast over gradient and translucent surfaces.
- [ ] Test external links, email links, map navigation, social previews, and
  direct `event.html?event=EVENT_ID` URLs from the production host rather than
  only from local `file://` pages.

## 4. Deployment tasks

- [ ] Confirm the production host publishes the repository root as a
  dependency-free static site with no build command.
- [ ] Verify that `/blitz/`, `/blitz/event.html`, all relative assets, and
  query-string event URLs work over HTTPS on the chosen host.
- [ ] Enable and verify the production TLS certificate before sharing the URL.
- [ ] Deploy root [`.htaccess`](.htaccess) and [`prezi_panel/.htaccess`](prezi_panel/.htaccess.example) (or equivalent nginx config) with `mod_headers` and `mod_rewrite` enabled, then verify:
  - Custom `403.html`, `404.html`, `500.html`, `503.html` pages return real HTTP status codes.
  - Sensitive files and folders (`.env`, `.git`, `tools/`, `supabase/`, `tests/`, `*.sql`, `*.py`, `README.md`) return `403 Forbidden`.
  - `TRACE`/`TRACK` HTTP methods return `403 Forbidden`.
  - Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and `Strict-Transport-Security` once HTTPS-only) are present on live responses.
- [ ] Run [`supabase/schema.sql`](supabase/schema.sql) (or [`supabase/migration_add_brochure_and_logo.sql`](supabase/migration_add_brochure_and_logo.sql) on an existing project) in the Supabase SQL Editor to apply RLS policies, `valid_image`, `valid_brochure`, and `events_public` privilege restrictions.
- [ ] Confirm [`config.js`](config.js) uses only the public `sb_publishable_` / anon key (never `service_role` or `sb_secret_`), and verify admin accounts/roles in `public.admins` via [`supabase/admins.sql`](supabase/admins.sql) (updating any temporary passwords from [`supabase/user.sql`](supabase/user.sql)).
- [ ] Submit `sitemap.xml` to Search Console for the final host.
- [ ] Confirm whether the host serves `robots.txt` at the domain root. A
  subdirectory `robots.txt` is not automatically discovered as the domain's
  root robots file, so register the sitemap directly if required.
- [ ] Re-run `node tools/validate-site.js` and the live metadata checks after
  every production-domain or hosting change.

## 5. Completed & optional improvements

- [x] Add a privacy-preserving admin workflow (`prezi_panel/` + Supabase RLS + `supabase/schema.sql`; see `SETUP-ADMIN.md`).
- [x] Add CI automation for JavaScript syntax, unit tests, data validation, site/security validation, seed synchronization, PostgreSQL RLS/schema contract tests, and Playwright Chromium E2E tests (`.github/workflows/ci.yml`).
- [ ] Add a production social-preview regression check for event query URLs if
  the society regularly publishes event-specific links.

## 6. Security, database & error handling (implemented — production check remaining)

- [x] Database RLS & privilege isolation: `anon` revoked on base tables, `public.site_content()` and `public.events_public` restricted to published content, `touch_row()` server-side `auth.uid()` enforcement, and SQL path-traversal (`..`, `//`) + scheme checks on images, links, and brochures.
- [x] Strict Content Security Policy (`<meta http-equiv="Content-Security-Policy">`) and `Referrer-Policy` across `index.html`, `event.html`, `prezi_panel/index.html`, `prezi_panel/preview.html`, and all 5 static error pages (`403.html`, `404.html`, `500.html`, `503.html`, `offline.html`).
- [x] Zero inline event handlers (`onerror=`) or inline `style=` attributes on error pages and event renderers; delegated capture listeners used instead.
- [x] Input/URL/JSON hardening: protocol-relative `//` and `..` traversal blocked across `script.js`, `content-map.js`, `event-renderer.js`, `event-page.js`, and `prezi_panel/preview.js`; prototype-pollution key stripping (`__proto__`, `constructor`, `prototype`) in `prezi_panel/event-template.js`; safe hash decoding and single-bind idle timeout in `prezi_panel/admin-app.js`.
- [x] Central error handler (`error-handler.js`, `error-catalog.js`) and static error pages (`error.css`, `error-page.js`): token/credential/cookie/path redaction, `crypto.getRandomValues` correlation IDs, silent `securitypolicyviolation` reporting, safe same-origin `returnTarget()` and `Go back` checks, and `BLITZ-HTTP-*` / `BLITZ-NET-001` diagnostics.
- [ ] Run `python supabase/tests/run_rls_tests.py` against a scratch PostgreSQL instance (or verify the `database` job in GitHub Actions CI passes) after any SQL change.

## Team UI refinement — visual QA still required
- [x] Preview the redesigned Teams section in a real browser at desktop (`1440×900`), tablet (`768×1024`), and mobile (`375×812`) widths (zero horizontal overflow).
- [x] Confirm the Teams section displays the society roster across tiers (6 faculty including 2 required faculty entries, 3 core team members, 8 executives [6 senior + 2 junior], and 5 volunteers — 22 cards total).
- [ ] Review contrast on the maroon faculty/core cards and cream cards, including hover and reduced-motion states.
- [ ] Replace neutral teacher/member avatars with approved portraits only when supplied and optimized.
