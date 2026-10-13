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

- [ ] Test keyboard-only navigation, visible focus, Escape handling, mobile
  menu focus trapping, announcement-dialog focus return, and event selection
  on the deployed pages.
- [ ] Test with JavaScript disabled and confirm the generated no-JavaScript
  event, team, announcement, and contact fallbacks remain accurate and
  readable.
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
- [ ] Submit `sitemap.xml` to Search Console for the final host.
- [ ] Confirm whether the host serves `robots.txt` at the domain root. A
  subdirectory `robots.txt` is not automatically discovered as the domain's
  root robots file, so register the sitemap directly if required.
- [ ] Re-run `node tools/validate-site.js` and the live metadata checks after
  every production-domain or hosting change.

## 5. Optional improvements

- [ ] Add a privacy-preserving content workflow or CMS only if the society
  needs non-technical editors; the current static architecture does not
  require a framework.
- [ ] Add CI automation for JavaScript syntax, data validation, no-JavaScript
  fallback synchronization, link/asset checks, and accessibility smoke tests.
- [ ] Add a production social-preview regression check for event query URLs if
  the society regularly publishes event-specific links.

## Team UI refinement — visual QA still required
- [ ] Preview the redesigned Teams section in a real browser at desktop, tablet, and mobile widths.
- [ ] Confirm the Teams section displays 20 people split into 4 faculty, 3 core team members, 6 senior executives, 2 junior executives, and 5 volunteers.
- [ ] Review contrast on the maroon faculty/core cards and cream cards, including hover and reduced-motion states.
- [ ] Replace neutral teacher/member avatars with approved portraits only when supplied and optimized.
