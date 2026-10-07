# BLITZ — Department of Computer Science
### Keshav Mahavidyalaya, University of Delhi

Official website for **BLITZ**, the Computer Science departmental society of Keshav Mahavidyalaya, University of Delhi.

This project is built to be **entirely dependency-free, zero-build, and static**. It runs immediately by opening `index.html` directly in any web browser (`file:///` protocol) or deployed on any static web host.

---

## 1. Project Structure

```text
BLITZ/
├── index.html          # Semantic HTML5 markup, landmarks, header, footer, modal
├── styles.css          # Unified CSS design system, color tokens, responsive rules
├── data.js             # Centralized societal content store (all TODOs marked here)
├── script.js           # Vanilla JS interactive engine (tickers, rails, observers)
├── assets/
│   ├── favicon.svg     # SVG vector favicon (brand bolt & shield)
│   ├── apple-touch-icon.png # iOS touch icon
│   ├── og.png          # Open Graph social preview banner (1200x630)
│   └── images/
│       ├── gallery/    # Event photos (SVGs/JPGs/PNGs)
│       ├── team/       # Avatars & member portraits
│       └── collaborations/ # Partner & affiliate logos
└── README.md           # Documentation, guidelines, and deployment instructions
```

---

## 2. Section Order & Anchor IDs

The website follows this exact sequential structure with assigned anchor IDs for fixed-navigation scrolling:

| # | Section | Element / Tag | Anchor ID | In Navbar? | Notes |
|---|---|---|---|---|---|
| 1 | **Home** | `<section>` | `#home` | Yes | Hero section with 3D logo & marquee |
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

Defined in [styles.css](file:///d:/Clg/BLITZ/styles.css):

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

  /* Navigation Heights */
  --nav-height: 74px;
  --nav-height-mobile: 64px;
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

All dynamic content lives in `window.BLITZ_DATA` in [data.js](file:///d:/Clg/BLITZ/data.js). Every placeholder is marked with a clear `// TODO:` comment.

### A. Adding an Announcement
```javascript
{
  id: 'announcement-04',
  title: 'Workshop Registration Closed',
  date: '2026-10-20', // ISO YYYY-MM-DD
  summary: 'Seats for the cloud laboratory session are now filled.',
  body: 'Thank you for the enthusiastic response. Registered participants will receive login credentials via email.',
  link: 'https://example.com' // Optional external URL or empty string
}
```

### B. Adding an Event
Dates are stored in ISO format (`YYYY-MM-DD`). The website automatically calculates and tags **UPCOMING** vs **PAST** status relative to today's date and sorts newest first:
```javascript
{
  id: 'annual-hackathon-2027',
  title: 'CodeVerse 2027',
  date: '2027-02-14',
  location: 'Auditorium & Lab 1',
  description: 'National 48-hour prototype sprint across algorithms and systems.',
  additionalInfo: 'Flagship Hackathon'
}
```

### C. Adding a Team Member
Tiers supported: `'core'` (Leadership), `'senior'` (Senior Executives), `'junior'` (Junior Members), `'volunteer'` (Volunteers).
```javascript
{
  name: 'Aarav Sharma',
  position: 'President',
  tier: 'core',
  photo: 'assets/images/team/aarav.jpg', // Or omit for default SVG avatar
  bio: 'Specializing in distributed computing and systems engineering.',
  links: {
    linkedin: 'https://linkedin.com/in/aarav',
    github: 'https://github.com/aarav'
  }
}
```

### D. Adding Gallery Photos
1. Drop the image file into `assets/images/gallery/` (recommended aspect ratio 4:3).
2. Add the record in `data.js`:
```javascript
{
  id: 'gallery-06',
  image: 'assets/images/gallery/symposium-2026.jpg',
  title: 'Symposium Keynote Address',
  alt: 'Audience listening to keynote speaker in the auditorium',
  date: 'Mar 2026',
  location: 'Auditorium'
}
```

### E. Adding Achievements
```javascript
{
  id: 'achievement-06',
  title: 'ACM ICPC Regional Qualifiers',
  year: '2026',
  category: 'Competitive Programming',
  description: 'Student trio ranked in the top 15 regionally at the Amritapuri site.',
  metrics: 'Top 15 Regional Rank'
}
```

### F. Adding Collaborations
```javascript
{
  name: 'ACM Student Chapter',
  logo: 'assets/images/collaborations/acm.svg',
  url: 'https://acm.org',
  type: 'Academic Affiliate',
  since: '2024'
}
```

---

## 5. Adding Real Photos & Logos

1. **Member Avatars**: Place portrait photos (square 1:1 ratio recommended, ~300x300px) in `assets/images/team/`. If a member does not have a photo yet, the site automatically renders the lightweight SVG placeholder `assets/images/team/avatar-placeholder.svg`.
2. **Gallery Photos**: Place horizontal 4:3 photos into `assets/images/gallery/`. The gallery automatically uses `loading="lazy"` and `decoding="async"`.
3. **Partner Logos**: Place vector SVGs or clean PNGs into `assets/images/collaborations/`. Logos render uniformly with automated grayscale-to-color transition on hover.
4. **Social Banner (`og.png`)**: Replace `assets/og.png` with an official 1200x630 banner for social media link previews (Twitter/LinkedIn/WhatsApp).

---

## 6. How to Deploy

Because this repository contains zero build steps and no package managers, deployment takes seconds:

### GitHub Pages
1. Push the repository to GitHub.
2. Go to **Settings** > **Pages**.
3. Under **Build and deployment**, choose **Source: Deploy from a branch**.
4. Select `main` (or `master`) branch, folder: `/ (root)`, and click **Save**.

### Netlify
1. Connect your repository on Netlify.
2. Leave **Build command** blank.
3. Set **Publish directory** to `.`.
4. Click **Deploy**.

---

## 7. Accessibility & Performance Features

- **Progressive Enhancement**: Initial reveals are scoped to `html.js`; all content remains visible if JavaScript fails.
- **Accessible Modal**: Focus trapped within announcements dialog, backdrop clicks close, ESC closes, and focus returns to trigger element.
- **Wheel & Touch Trap Fix**: Horizontal rails only intercept wheel events when scrolling within active bounds; vertical swipes pass cleanly to the page on touch screens.
- **Prefers-Reduced-Motion**: Automatically disables logo rotation, marquee loops, and ticker transitions for users with motion sensitivity.
- **WCAG AA Compliance**: High contrast ratios across maroon, ink, and cream surfaces. All interactive targets meet minimum 44px tap sizes.
