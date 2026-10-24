# BLITZ — Department of Computer Science
### Keshav Mahavidyalaya, University of Delhi

Official website for **BLITZ**, the Computer Science departmental society of Keshav Mahavidyalaya, University of Delhi.

This project is **zero-build and static**: plain HTML/CSS/JS files that any web server can host. The public site has no dependencies; the admin panel ships one vendored, version-pinned library (`prezi_panel/vendor/supabase.js`). The `tools/` and `supabase/` folders hold maintainer scripts and database files; the site itself never needs them to run.

## 0. How content works (read this first)

```
 https://keshav.du.ac.in/blitz/                    https://keshav.du.ac.in/blitz/prezi_panel/
   public site (read only)                           admin panel (login required)
          │  one public call: site_content()                │  sign in, create / edit / delete / reorder
          └──────────────►  Supabase (free)  ◄──────────────┘
                            database + login + image storage
```

- **Announcements, events, team, gallery and collaborations** live in the database and are edited in the admin panel. A save appears on the website immediately (visitors with the page already open see it within about two minutes or on their next visit); nobody has to redeploy anything.
- **`data.js`** now holds (a) the **contact details** and (b) a **fallback snapshot** of the content, shown only if the database cannot be reached and used for the no-JavaScript text. The site is never blank.
- **Setup, accounts, password reset, deployment and troubleshooting:** see **[SETUP-ADMIN.md](SETUP-ADMIN.md)**.
- Until `config.js` is filled in, the site simply shows the content in `data.js`, exactly as before.

---

## 1. Project Structure

```text
BLITZ/
├── index.html            # Markup, head/SEO/JSON-LD, <noscript> fallbacks, dialog
├── event.html            # Launchpad-style event browser and selected-event view
├── styles.css            # Design system, responsive rules (section 17 = mobile)
├── data.js               # ALL content (announcements, events, team, contact, ...)
├── BLITZ_EVENT_TEMPLATE.json # Canonical event import template downloaded by admins
├── BLITZ_EVENT_TEMPLATE_GUIDE.md # Template preparation and import guide
├── script.js             # Vanilla JS: ticker, modal, nav sheet, rails, hero logo
├── event-renderer.js      # Shared, escaped event-detail markup for both pages
├── event-page.js          # Data-driven event selector and route-aware page shell
├── .env.example          # Local Supabase configuration template
├── config.js             # PUBLIC runtime config generated from .env
├── content-map.js        # database rows -> site objects (shared by site and admin)
├── content-loader.js     # loads live content (cached), falls back to data.js, says which one is on screen
├── error-catalog.js  error-handler.js  error.css  error-page.js   # ONE error system (see ERRORS.md)
├── 404.html  403.html  500.html  503.html  offline.html          # static error pages (need server config)
├── .htaccess.example     # Apache config that makes the server use those pages (nginx notes inside)
├── ERRORS.md             # error codes, diagnostics, recovery steps, hosting, known limitations
├── tests/unit/           # node:test unit tests (error handler, catalog, event validator)
├── prezi_panel/          # THE ADMIN PANEL (own folder, own strict CSP, noindex)
│   ├── index.html  admin.css  admin-core.js  admin-forms.js  admin-app.js
│   ├── event-validator.js  database-diagnostics.js  operation-status.js   # validation, system check, safe writes
│   ├── preview.html  preview.js   # live event preview (sandboxed frame)
│   ├── .htaccess.example          # recommended security headers (give to the server admin)
│   └── vendor/supabase.js         # pinned supabase-js 2.117.2 (MIT)
├── supabase/
│   ├── schema.sql  seed.sql  user.sql  admins.sql   # run in the Supabase SQL editor (see SETUP-ADMIN.md)
│   └── tests/                             # schema/RLS tests + end-to-end tests (see Testing below)
├── .github/workflows/ci.yml               # syntax, validators, unit, schema and browser tests
├── .github/workflows/keepalive.yml        # daily read so the free database is less likely to be paused
├── SETUP-ADMIN.md
├── favicon.ico           # 16/32/48 (generated)
├── favicon-16.png  favicon-32.png  apple-touch-icon.png  icon-192.png  icon-512.png
├── site.webmanifest      # PWA/theme colours + icons
├── robots.txt  sitemap.xml
├── assets/
│   ├── og.png            # 1200x630 social preview (generated)
│   ├── logo/
│   │   ├── blitz-logo.png         # 512px, white on transparent (site + JSON-LD)
│   │   ├── blitz-logo-1024.png    # retina hero (srcset)
│   │   ├── blitz-logo-dark.png    # ink-coloured variant for LIGHT backgrounds
│   │   └── blitz-logo-source.webp # untouched master, input for the build script
│   └── images/
│       ├── gallery/      # Event photos
│       ├── team/         # 400x400 WebP portraits + avatar-placeholder.svg
│       └── collaborations/
├── tools/
│   ├── build-brand-assets.py    # logo -> favicons, icons, og.png
│   ├── optimize-team-images.py  # photos -> 400x400 WebP
│   ├── set-site-url.py          # change the production URL everywhere
│   ├── validate-site.js         # metadata, URL, sitemap, robots, asset checks
│   ├── generate-seed.js         # data.js -> supabase/seed.sql (one-time import)
│   └── sync-noscript.js         # regenerate <noscript> blocks from data.js
└── README.md
```

### Local configuration

This is a zero-build static site, so browsers cannot read `.env` directly. To configure
the public site and admin panel:

1. Copy `.env.example` to `.env`.
2. Fill in `SUPABASE_URL` and the public `SUPABASE_ANON_KEY`.
3. Run `node tools/configure-env.js`.
4. Deploy the generated `config.js` with the rest of the site.

`.env` is ignored by Git. Only the public anon/publishable key belongs in this
configuration; never use a Supabase `service_role` or secret key. The site and the
panel refuse to run if `config.js` contains one, and `node tools/validate-site.js`
fails if one is found anywhere in the repository.

If `config.js` is left blank, the site simply shows the content bundled in `data.js`
and never contacts Supabase (no warning is shown, because that is intended).

**GitHub secrets** used by `keepalive.yml` (names only, set under *Settings > Secrets
and variables > Actions*): `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the same
public key as in `config.js`). `.env` calls that key `SUPABASE_ANON_KEY`; that name
exists only in the local file. `ci.yml` needs no secrets.

Download the official administrator template here:
[BLITZ_EVENT_TEMPLATE.json](BLITZ_EVENT_TEMPLATE.json). See the
[template usage guide](BLITZ_EVENT_TEMPLATE_GUIDE.md) for supported fields,
validation, AI completion, media upload, preview, draft, and publication steps.

### Creating events in the Prezi Panel

Open **Events → New Event** and choose either:

- **Manual entry**: complete the existing collapsible sections, upload images
  through the panel, preview the event, then save it as a draft or explicitly
  confirm publication.
- **Import template**: use **Download Event Template**, fill the JSON file
  manually or with an AI assistant without changing `template` or `version`,
  and upload it in the drop area. The panel validates the structure and shows
  warnings before **Import into form** populates the same editor. Existing
  events offer an explicit merge/replace choice. Importing never saves,
  publishes, changes permissions, or uploads media.

Media names in `BLITZ_EVENT_TEMPLATE.json` are descriptive references only. Upload
the corresponding poster, cover, gallery images, brochure, or documents using
the panel's media controls after import. Review the preview, save as a draft,
and use the publish confirmation only when the event is ready.

---

## 2. Section Order & Anchor IDs

The website follows this exact sequential structure with assigned anchor IDs for fixed-navigation scrolling:

| # | Section | Element / Tag | Anchor ID | In Navbar? | Notes |
|---|---|---|---|---|---|
| 1 | **Home** | `<section>` | `#home` | Yes | Hero section with the logo image & marquee |
| 2 | **About** | `<section>` | `#about` | Yes | "Silicon Minds, Circuited Hearts" & "What We Do" |
| 3 | **Announcements** | `<section>` | `#announcements` | No (Strip) | Slim news-headline ticker with dialog modal |
| 4 | **Events** | `<section>` | `#events` | Yes | Sticky stacking panels, sorted newest-first |
| 5 | **Team** | `<section>` | `#team` | Yes | High-contrast cream break with member tiers |
| 6 | **Gallery** | `<section>` | `#gallery` | Yes | Event imagery on smooth horizontal rail |
| 7 | **Network** | `<section>` | `#collaborations` | Yes | Partner society and community placeholders |
| 8 | **Contact** | `<footer>` | `#contact` | Yes | Links, social handles, and dynamic copyright |

---

## 3. Color Tokens (`:root`)

Defined in `styles.css`:

```css
:root {
  /* Warm Ink (Dark Backdrops) */
  --ink: #0b0506;
  --ink-surface: #140709;
  --ink-elevated: #1e0b0e;

  /* Brand Maroon */
  --maroon: #4c0000;
  --maroon-deep: #260000;
  --maroon-bright: #7a1010;

  /* Warm Cream (Contrast Surface & Text) */
  --cream: #f4f1e8;
  --cream-dim: rgba(244, 241, 232, 0.78);
  --cream-faint: rgba(244, 241, 232, 0.58);

  /* Terminal Amber & Accents */
  --accent: #ffb000;
  --accent-hover: #ffc233;
  --accent-hot: #ff3d2e;

  /* Navigation height: 74px on desktop, 64px below 900px (set in styles.css section 17) */
  --nav-height: 74px;
  --header-h: calc(var(--nav-height) + env(safe-area-inset-top, 0px));
}
```

### Surface Rhythm
- **Home**: `.surface--maroon`
- **About**: `.surface--ink`
- **Announcements**: Dark amber terminal strip
- **Events**: `.surface--maroon`
- **Team**: `.surface--cream` (High-contrast light surface with dark text)
- **Gallery**: `.surface--ink`
- **Network**: `.surface--ink`
- **Contact Footer**: `.surface--ink`

---

## 4. The shape of the content (`data.js` snapshot, contact)

> Day-to-day edits are made in the **admin panel**, not here. Edit `data.js` only for the **contact details**, or to refresh the fallback snapshot (the admin's **Backup / export** page writes a ready-made `data.js` for you). The field shapes below are still the shapes used everywhere.

All dynamic content lives in `window.BLITZ_DATA` in `data.js`, and it is intentionally kept separate from rendering logic for easy future replacement or admin integration.

### A. Announcement
```javascript
{
  id: 'announcement-04',
  title: 'Workshop Registration Closed',
  date: '2026-10-20', // ISO YYYY-MM-DD, treated as a LOCAL calendar date
  summary: 'Seats for the cloud laboratory session are now filled.',
  body: 'Thank you for the enthusiastic response.',
  link: ''            // optional http(s) URL
}
```

### B. Event
`UPCOMING`/`PAST` is computed from the visitor's local date (an event dated today is still upcoming).
```javascript
{ id: 'annual-hackathon-2027', title: 'CodeVerse 2027', date: '2027-02-14',
  location: 'Auditorium & Lab 1', description: 'National 48-hour prototype sprint.',
  layout: 'competition', format: 'Hackathon',
  additionalInfo: 'Flagship Hackathon' } // shown in the event detail view
```
Events may also include `brochure: 'https://…'`. When present, the shared event
renderer shows an embedded brochure preview with an open/download link on both
the homepage detail view and `event.html`; empty, unsafe, or missing brochure
paths are omitted. Placeholder events set `placeholder: true` and leave their
date, description, image, and other editorial fields empty until details are
confirmed.
Event cards link to `event.html?event=<id>`. Both the homepage detail view and the Launchpad
load `event-renderer.js` before their page-specific scripts, so common metadata and
layout-specific sections are rendered from one escaped implementation. The selected event
also updates the document title, description, and social title/description at runtime.
The event page keeps `event.html` as its canonical URL while its `og:url` reflects the
selected query URL; the homepage keeps the homepage canonical URL. Unknown IDs show an
explicit empty state and restore generic page metadata. The Launchpad page reads the
selected event from `data.js`, so adding an event to the shared data source automatically
adds its selector tile and detail view without creating another HTML file.

### C. Team member
Tiers: `'faculty'` (Faculty & Convenor), `'core'` (Core Team), `'senior'` (Senior Executives), `'junior'` (Junior Executives), `'volunteer'` (Volunteers). Cards show photo, name and position only.
```javascript
{ name: 'First Last', position: 'Volunteer', tier: 'volunteer',
  photo: 'assets/images/team/first-last.webp' } // omit photo => decorative avatar placeholder
```
`photo` may only be a relative path or an http(s) URL; anything else is ignored.

### D. Contact
Edit the `contact` object (`mail`, `instagram`, `instagramHandle`, `linkedin`, `location`). The Maps link is built from `location` automatically. The address is displayed verbatim.

### E. Gallery and Network
Add gallery objects to `gallery` (images are 4:3 in `assets/images/gallery/`). Network cards
remain placeholders until partner information is confirmed; then add verified records to
`collaborations` with partner logos as SVG/PNG in `assets/images/collaborations/`.

### After editing events, team, announcements or contact
The `<noscript>` fallbacks in `index.html` (what visitors without JavaScript and simple crawlers see) are generated from `data.js`:
```bash
node tools/sync-noscript.js
```

---

## 5. Logo, Icons and Photos

### Logo files
`assets/logo/blitz-logo.png` is **white on transparent**, so it works on the maroon/ink surfaces used throughout the site but is invisible on cream; use `blitz-logo-dark.png` there. To regenerate every derived asset (logo sizes, `favicon.ico`, PNG icons, apple-touch icon, `assets/og.png`) after replacing `assets/logo/blitz-logo-source.webp`:
```bash
pip install pillow
python tools/build-brand-assets.py
```

### Adding or replacing team photos
1. Put the original photo(s) (HEIC, PNG, JPEG or WebP, any size) in a temporary `assets/team_images/` folder.
2. If the person is new, add `"filestem": "first-last"` to `PHOTOS` in `tools/optimize-team-images.py`. If a face is cropped badly, add an entry to `CROP_CENTER` (centre x, centre y, zoom).
3. Run:
```bash
pip install pillow pillow-heif
python tools/optimize-team-images.py            # or: --src <folder> --out assets/images/team
```
The script applies EXIF orientation, strips metadata, crops a square biased toward the top, resizes to 400x400 and writes `assets/images/team/first-last.webp` (<= 50 KB). It also writes `_contact-sheet.png` for a quick visual review; delete it, and the temporary source folder, before committing.
4. Set `photo: 'assets/images/team/first-last.webp'` in `data.js`.

> The original multi-megabyte photos remain in git history. If repository size matters, purge them with `git filter-repo` (not done automatically).

---

## 6. Deploy

### GitHub Pages
1. Push to GitHub.
2. **Settings > Pages > Build and deployment**: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. **Enable "Enforce HTTPS"** on the same page (tick it once the certificate is issued). Do this before sharing the link.

### Netlify / any static host
No build command; publish directory `.`.

### Custom error pages (404, 403, 500, 503)
The pages exist in the repository, but **a web server only uses them if it is told to**.
For the Apache server this site is documented to run on, rename `.htaccess.example` to
`.htaccess` in the site folder (nginx lines and a maintenance-mode switch are inside the
file). Then check the real status codes:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://keshav.du.ac.in/blitz/no-such-page   # must print 404
```
GitHub Pages and Netlify serve `404.html` by themselves but do not support custom 403,
500 or 503 pages. Event links such as `event.html?event=unknown` cannot return a real 404
on a static site; they show an in-page "Event not found" state instead. Full details,
including `offline.html` and what is not verified, are in [ERRORS.md](ERRORS.md#8-hosting-and-custom-error-pages).

### Production URL
The default is `https://keshav.du.ac.in/blitz/` (canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD, sitemap, robots). Social scrapers and crawlers need absolute URLs, so it is written out in those files. If the society gets its own domain:
```bash
python tools/set-site-url.py https://your-domain.tld/
```
Note: crawlers only read `robots.txt` at a domain root. While the site lives under `/blitz/` on a shared domain, submit `sitemap.xml` in Search Console instead; the file is correct as soon as the site is served from a root.

Run the local deployment/metadata check before publishing:
```bash
node tools/validate-site.js
```
It checks the two public HTML entry points, their local references, the intended
canonical URLs, and the sitemap/robots pairing. It also checks the error pages, script
load order, that the error stylesheet's colours still match `styles.css`, that every
error code in `error-catalog.js` is documented in `ERRORS.md`, that no secret key is
committed, that `.htaccess.example` points at pages that exist, and that every
workflow secret is documented. It does not verify the live host.

### Testing
```bash
node --test "tests/unit/*.test.js"      # error handler, catalog, event validator
node tools/validate-data.js             # content, templates, JSON syntax, event rules
node tools/validate-site.js
# need PostgreSQL (and PostgREST + Playwright for the browser tests); see ERRORS.md section 9:
python supabase/tests/run_rls_tests.py <scratch-db>
python supabase/tests/run_schema_contract_tests.py <scratch-db>
python supabase/tests/e2e/run_e2e.py <path-to-postgrest>
python supabase/tests/e2e/run_error_tests.py <path-to-postgrest>
```
These use a scratch PostgreSQL, never a hosted Supabase project; Supabase Auth/Storage are
a local stand-in, and ERRORS.md explains which failures are real and which are simulated.

---

## 7. Accessibility, Performance and Progressive Enhancement

What is actually implemented (and checked with Lighthouse mobile, headless Chromium and Playwright):

- **Without JavaScript** the static content stays visible, the nav is a plain link row, and `<noscript>` blocks list the latest announcement, events, team and contact details. Image galleries and network cards are JS-rendered and therefore absent without JS.
- **Touch targets:** on phones/tablets (and coarse pointers) every button and link row is at least 44px tall; nav rows are 48px. On desktop with a mouse a few secondary controls are slightly smaller (e.g. 36px ticker buttons).
- **Contrast:** secondary/faint text measures 4.97:1 or higher against its section background (automated Lighthouse accessibility score 100; this is not a substitute for a manual WCAG audit).
- **Announcements:** the auto-rotating ticker is not a live region; screen readers are only told about an item when the user changes it manually. Rotation can be paused, and stops while the bar is off-screen, hovered, focused, the tab is hidden or the dialog is open.
- **Dialog:** page scroll is locked while open, ESC / close button / backdrop tap close it, focus returns to the trigger; a bottom sheet on phones.
- **Mobile menu:** body scroll lock, focus trap, ESC and outside-tap close, `aria-expanded` kept in sync.
- **Motion:** `prefers-reduced-motion` disables the logo float, marquee and reveals; animations pause when the hero is off-screen.
- **Touch rails:** the gallery snaps to cards and can be swiped.

## Event Launchpad (event.html)

- Layout and behaviour live in `event-launchpad.css` and `event-page.js`; the wine palette comes from `styles.css`.
- Windows are non-modal (no backdrop or blur), so several events can be open at once. Minimized windows sit in the dock; the trash icon closes them all. `?event=<id>` opens that event on load.
- The admin preview (`prezi_panel/preview.html`) also loads `event-launchpad.css`.
