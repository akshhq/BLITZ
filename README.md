# BLITZ — Department of Computer Science
### Keshav Mahavidyalaya, University of Delhi

Official website for **BLITZ**, the Computer Science departmental society of Keshav Mahavidyalaya, University of Delhi.

This project is **dependency-free, zero-build and static**. It runs by opening `index.html` directly (`file://`) or from any static host. The `tools/` folder holds optional one-off maintainer scripts (Python/Node); the site itself never needs them.

---

## 1. Project Structure

```text
BLITZ/
├── index.html            # Markup, head/SEO/JSON-LD, <noscript> fallbacks, dialog
├── styles.css            # Design system, responsive rules (section 17 = mobile)
├── data.js               # ALL content (announcements, events, team, contact, ...)
├── script.js             # Vanilla JS: ticker, modal, nav sheet, rails, hero logo
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
│   └── sync-noscript.js         # regenerate <noscript> blocks from data.js
└── README.md
```

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
| 7 | **Achievements** | `<section>` | `#achievements` | Yes | Real accolades with expandable cards |
| 8 | **Collaborations**| `<section>` | `#collaborations` | Yes | Partner society and sponsor logos |
| 9 | **Contact** | `<footer>` | `#contact` | Yes | Links, social handles, and dynamic copyright |

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
- **Achievements**: `.surface--achievements`
- **Collaborations**: `.surface--ink`
- **Contact Footer**: `.surface--ink`

---

## 4. How to Update Content (`data.js`)

All dynamic content lives in `window.BLITZ_DATA` in `data.js`. Every placeholder is marked with a `// TODO:` comment (events, announcements, achievements, collaborations, gallery are still placeholders; contact and team are real).

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
  additionalInfo: 'Flagship Hackathon' } // shown once, as "Format"
```

### C. Team member
Tiers: `'core'` (Leadership), `'senior'` (Senior Executives), `'junior'` (Junior Executives), `'volunteer'` (Volunteers). Cards show photo, name and position only.
```javascript
{ name: 'First Last', position: 'Volunteer', tier: 'volunteer',
  photo: 'assets/images/team/first-last.webp' } // omit photo => decorative avatar placeholder
```
`photo` may only be a relative path or an http(s) URL; anything else is ignored.

### D. Contact
Edit the `contact` object (`mail`, `instagram`, `instagramHandle`, `linkedin`, `location`). The Maps link is built from `location` automatically. The address is displayed verbatim.

### E. Gallery, Achievements, Collaborations
Same pattern as before: add an object to the matching array (gallery images 4:3 in `assets/images/gallery/`, partner logos as SVG/PNG in `assets/images/collaborations/`).

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

### Production URL
The default is `https://aksh.is-a.dev/BLITZ/` (canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD, sitemap, robots). Social scrapers and crawlers need absolute URLs, so it is written out in those files. If the society gets its own domain:
```bash
python tools/set-site-url.py https://your-domain.tld/
```
Note: crawlers only read `robots.txt` at a domain root. While the site lives under `/BLITZ/` on a shared domain, submit `sitemap.xml` in Search Console instead; the file is correct as soon as the site is served from a root.

---

## 7. Accessibility, Performance and Progressive Enhancement

What is actually implemented (and checked with Lighthouse mobile, headless Chromium and Playwright):

- **Without JavaScript** the static content stays visible, the nav is a plain link row, and `<noscript>` blocks list the latest announcement, events, team and contact details. Image galleries, achievements and collaborations are JS-rendered and therefore absent without JS.
- **Touch targets:** on phones/tablets (and coarse pointers) every button and link row is at least 44px tall; nav rows are 48px. On desktop with a mouse a few secondary controls are slightly smaller (e.g. 36px ticker buttons).
- **Contrast:** secondary/faint text measures 4.97:1 or higher against its section background (automated Lighthouse accessibility score 100; this is not a substitute for a manual WCAG audit).
- **Announcements:** the auto-rotating ticker is not a live region; screen readers are only told about an item when the user changes it manually. Rotation can be paused, and stops while the bar is off-screen, hovered, focused, the tab is hidden or the dialog is open.
- **Dialog:** page scroll is locked while open, ESC / close button / backdrop tap close it, focus returns to the trigger; a bottom sheet on phones.
- **Mobile menu:** body scroll lock, focus trap, ESC and outside-tap close, `aria-expanded` kept in sync.
- **Motion:** `prefers-reduced-motion` disables the logo float, marquee and reveals; animations pause when the hero is off-screen.
- **Touch rails:** gallery and achievements snap to cards and can be swiped; on touch-only devices achievement details are always visible.

