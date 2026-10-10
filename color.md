# BLITZ Color System

This document is the color reference for the BLITZ Computer Science Society website.
The implementation source of truth is [`styles.css`](./styles.css), especially the
`:root` design tokens and the shared surface system.

## 1. Brand direction

BLITZ uses a dark editorial/terminal palette:

- **Warm ink** provides the primary background and high-contrast navigation canvas.
- **Maroon** identifies BLITZ surfaces and event-led content.
- **Warm cream** carries readable body copy and the light team section.
- **Terminal amber** is the primary interactive and informational accent.
- **Alert red** is reserved for urgent or exceptional states.

The palette should feel technical, warm, deliberate, and slightly archival rather
than neon or generic black-and-white.

## 2. Core design tokens

These variables are defined in `:root` in [`styles.css`](./styles.css).

| Token | Value | Role |
|---|---|---|
| `--ink` | `#0b0506` | Primary dark background, dark text on the cream surface |
| `--ink-surface` | `#140709` | Elevated dark surface, cards, and dark gradients |
| `--ink-elevated` | `#1e0b0e` | Higher dark elevation for panels and layered UI |
| `--maroon` | `#4c0000` | Primary BLITZ maroon surface |
| `--maroon-deep` | `#260000` | Deep maroon gradient stop and footer/event depth |
| `--maroon-bright` | `#7a1010` | Brighter maroon gradient stop |
| `--cream` | `#f4f1e8` | Primary light text and cream-section background |
| `--cream-dim` | `rgba(244, 241, 232, 0.78)` | Secondary light text and descriptions |
| `--cream-faint` | `rgba(244, 241, 232, 0.58)` | Low-emphasis light text |
| `--cream-subtle` | `rgba(244, 241, 232, 0.16)` | Subtle separators and borders |
| `--accent` | `#ffb000` | Terminal amber: labels, focus rings, badges, active states |
| `--accent-hover` | `#ffc233` | Hover/focus variation for amber controls |
| `--accent-dim` | `rgba(255, 176, 0, 0.18)` | Soft amber fills and backgrounds |
| `--accent-hot` | `#ff3d2e` | Alert/upcoming emphasis; use sparingly |
| `--focus-ring-dark` | `var(--accent)` | Focus ring on dark and maroon surfaces |
| `--focus-ring-light` | `var(--maroon-bright)` | Focus ring on the cream Team surface |
| `--state-hover-dark` | `rgba(255, 176, 0, 0.2)` | Dark-surface hover/keyboard state fill |
| `--state-selected-dark` | `rgba(255, 176, 0, 0.12)` | Selected event and winner emphasis fill |
| `--state-disabled-border` | `rgba(244, 241, 232, 0.24)` | Disabled-control boundary |

## 3. Base colors

Global page defaults are defined on `html` and `body`:

```css
background-color: var(--ink);
color: var(--cream);
```

This means the default page is warm cream text on warm ink, not pure white on
pure black. Links inherit the surrounding text color unless a component assigns
an accent color.

## 4. Surface system

All major sections use the `.surface` texture system. The base surface adds:

- a repeating scanline overlay using `--surface-scanline`
- a repeating radial grain overlay using `--surface-grain`
- `mix-blend-mode: screen` on scanlines
- a low-opacity grain layer to avoid overpowering content

### `.surface--maroon`

Used by the hero and events area.

```css
background-color: var(--maroon);
background-image: linear-gradient(
  180deg,
  var(--maroon-bright) 0%,
  var(--maroon) 54%,
  var(--maroon-deep) 100%
);
color: var(--cream);
```

Texture values:

- Scanline: `rgba(255, 235, 235, 0.05)`
- Grain: `rgba(255, 255, 255, 0.04)`
- Hero grain: `rgba(255, 255, 255, 0.052)`

### `.surface--ink`

Used by the About, Gallery, Network, Contact, and event detail areas.

```css
background-color: var(--ink);
background-image: linear-gradient(
  180deg,
  var(--ink-surface) 0%,
  var(--ink) 60%,
  #050203 100%
);
color: var(--cream);
```

Texture values:

- Scanline: `rgba(255, 176, 0, 0.035)`
- Grain: `rgba(244, 241, 232, 0.03)`

### `.surface--cream`

Used by the Team section for a high-contrast visual break.

```css
background-color: var(--cream);
background-image: linear-gradient(
  180deg,
  #fcfaf4 0%,
  var(--cream) 50%,
  #ebe6d8 100%
);
color: var(--ink);
```

Texture values:

- Scanline: `rgba(76, 0, 0, 0.04)`
- Grain: `rgba(11, 5, 6, 0.035)`

### Retired achievement surface

`.surface--achievements` remains in the stylesheet as legacy styling, but the
Honors & Milestones section has been removed from the site. Do not use this class
for new sections. Its historical gradient was:

- `var(--maroon-bright)` → `var(--maroon)` → `var(--maroon-deep)`
- Scanline: `rgba(255, 235, 235, 0.055)`
- Grain: `rgba(255, 255, 255, 0.045)`

## 5. Component color usage

### Navigation

- Header background: `var(--ink)` with dark translucent/solid responsive menu treatment
- Navigation text: `var(--cream-dim)`
- Navigation hover and active text: `var(--accent)`
- Active indicator: `var(--accent)`
- Navigation links use the shared 44px minimum target height.
- Mobile menu dividers: `rgba(255, 255, 255, 0.08)`

### Typography and labels

- Main headings: `var(--cream)` on dark surfaces
- Body copy: `var(--cream-dim)`
- Low-priority metadata: `var(--cream-faint)`
- Section labels and technical metadata: `var(--accent)`
- Labels on the Team cream surface: `var(--maroon)`
- Dark-surface labels used in light contexts: `var(--maroon)`

### Focus and accessibility

All keyboard focusable controls use:

```css
outline: 2px solid var(--focus-ring-dark);
outline-offset: 4px;
```

Controls on `.surface--cream` use `var(--focus-ring-light)` because amber
does not provide sufficient contrast against the light Team background. Disabled
controls use a muted cream token and border, never reduced element opacity that
could unintentionally reduce the contrast of nested labels.

The skip link uses:

- Background: `var(--accent)`
- Text: `var(--ink)`

Do not replace the amber focus ring with a low-contrast border or a color-only
state.

### Events

- Event panel text: `var(--cream)`
- Event descriptions: `var(--cream-dim)`
- Event metadata labels: `var(--accent)`
- Upcoming badge: `var(--accent)` background with `var(--ink)` text
- Past badge: translucent cream background with `var(--cream-dim)` text
- Detail buttons: translucent light background, amber border, cream text
- Detail button hover/focus: amber background with ink text
- Selected Launchpad tiles use an amber border and a lift/shadow change in
  addition to the selected state; the state is not communicated by color alone.
- Winner blocks use a labelled section, accent heading, and left rule for
  hierarchy. No medal-specific palette is introduced.

### Announcements

- Announcement strip uses the dark ink family
- Announcement labels, dates, and controls use amber
- Announcement modal backdrop: `rgba(11, 5, 6, 0.9)`
- Modal surface: `var(--ink-surface)`
- Modal border: `var(--accent)`
- Modal body copy: `var(--cream-dim)`

### Team

- Section background: cream gradient
- Main Team heading: `var(--ink)`
- Team body copy: `rgba(11, 5, 6, 0.76)`
- Team card background: `rgba(255, 255, 255, 0.7)`
- Team card border: `rgba(76, 0, 0, 0.12)`
- Team card role text: `var(--maroon)`
- Team card hover border: `var(--maroon)`

### Gallery

- Gallery surface: `.surface--ink`
- Card background: `var(--ink-surface)`
- Card border: `rgba(255, 176, 0, 0.25)`
- Image fallback/background: `#140507`
- Number and technical index: `var(--accent)`
- Title: `var(--cream)`
- Description: `var(--cream-dim)`
- Image hover effect: visual scale only; no color change is applied

### Network placeholders

The Network section uses `.surface--ink`.

- Placeholder card background: `rgba(255, 255, 255, 0.025)`
- Placeholder card border: dashed `rgba(255, 176, 0, 0.2)`
- Placeholder tile fill: `rgba(255, 176, 0, 0.04)`
- Placeholder index: `var(--accent)`
- Placeholder copy: `var(--cream-dim)`
- Confirmed future partners should reuse the existing amber border and ink-surface
  card treatment.

### Footer and contact

- Footer background: `.surface--ink`
- Contact heading: `var(--cream)`
- Contact label/icons: `var(--accent)`
- Contact secondary text: `var(--cream-dim)`
- Contact separators: low-opacity cream borders

## 6. Literal colors used outside tokens

These literals are intentionally used for gradient stops, image backdrops, or
texture layers:

| Color | Usage |
|---|---|
| `#050203` | Deepest dark stop in the ink gradient |
| `#140507` | Gallery image shell background |
| `#17090b` | Local dark component background |
| `#fcfaf4` | Lightest cream-surface gradient stop |
| `#ebe6d8` | Darker cream-surface gradient stop |
| `rgba(0, 0, 0, 0.04)`–`rgba(0, 0, 0, 0.8)` | Shadows and depth overlays |
| `rgba(255, 255, 255, 0.02)`–`rgba(255, 255, 255, 0.92)` | Light borders, fills, and muted overlays |
| `rgba(244, 241, 232, 0.08)`–`rgba(244, 241, 232, 0.2)` | Cream separators and translucent controls |
| `rgba(255, 176, 0, 0.035)`–`rgba(255, 176, 0, 0.55)` | Amber textures, borders, glows, and soft fills |
| `rgba(11, 5, 6, 0.035)`–`rgba(11, 5, 6, 0.97)` | Ink overlays and light-surface text |
| `rgba(76, 0, 0, 0.04)`–`rgba(76, 0, 0, 0.12)` | Maroon texture and Team card borders |

When adding a new component, prefer a token or an existing opacity family over
introducing another one-off color.

## 7. Color rules for future changes

1. Use the existing tokens before adding a new color.
2. Keep dark-surface body text at `var(--cream)` or `var(--cream-dim)`.
3. Use `var(--accent)` for both visible emphasis and keyboard focus.
4. Keep amber as an accent, not a large page background.
5. Preserve the cream Team surface as the primary contrast break.
6. Do not use pure `#000000` or pure `#ffffff` for new primary surfaces or text.
7. Do not communicate state through color alone; pair it with text, structure, or
   an accessible label.
8. Check the result in both reduced-motion and responsive layouts after changing
   surface overlays or gradients.

## 8. Source of truth

- Implementation: [`styles.css`](./styles.css)
- Page surfaces: [`index.html`](./index.html)
- Event page surfaces: [`event.html`](./event.html)
- Shared content data: [`data.js`](./data.js)

## 9. Measured contrast audit

Ratios below use the WCAG relative-luminance formula with alpha colors
composited over the named solid background. They are representative checks;
text over a gradient must still be checked at its darkest and lightest points.
The AA targets are **4.5:1 for normal text**, **3:1 for large text**, and
**3:1 for non-text focus indicators**.

| Foreground | Background | Composited foreground | Ratio | AA result |
|---|---|---:|---:|---|
| `--cream` | `--ink` | `#f4f1e8` | 17.90:1 | Pass |
| `--cream-dim` | `--ink` | `#c1bdb6` | 10.81:1 | Pass |
| `--cream-faint` | `--ink` | `#928e89` | 6.21:1 | Pass |
| `--cream` | `--ink-surface` | `#f4f1e8` | 17.47:1 | Pass |
| `--cream-dim` | `--maroon` | `#cfbcb5` | 8.81:1 | Pass |
| `--cream-faint` | `--maroon` | `#ad8c87` | 5.26:1 | Pass |
| `--cream` | `--maroon-bright` | `#f4f1e8` | 9.74:1 | Pass |
| `--accent` | `--ink` | `#ffb000` | 11.04:1 | Pass |
| `--accent` | `--ink-surface` | `#ffb000` | 10.77:1 | Pass |
| `--accent` | `--maroon` | `#ffb000` | 8.77:1 | Pass |
| `--ink` | `--accent` | `#0b0506` | 11.04:1 | Pass |
| `--ink` | `--accent-hover` | `#0b0506` | 12.53:1 | Pass |
| `--maroon` | `--cream` | `#4c0000` | 14.22:1 | Pass |
| `--ink` | `--cream` | `#0b0506` | 17.90:1 | Pass |

The audit found no failing representative body-text or control-label pairing
after the state-token changes. Thin translucent borders and texture overlays
are intentionally not treated as text colors. Amber is not used as body copy
on the cream Team surface; the light-surface focus ring is maroon instead.

## 10. Interactive-state contract

Every interactive component should expose the following states:

| State | Required treatment |
|---|---|
| Default | Stable token-based text, border, and surface |
| Hover | Amber border or fill plus a non-color cue such as lift or underline |
| Focus-visible | 2px contrasting outline with 4px offset |
| Active/pressed | Preserve the selected border/fill while removing lift if appropriate |
| Selected | `aria-current`, `aria-pressed`, or equivalent semantic state plus visual styling |
| Disabled | `:disabled`, `[aria-disabled="true"]`, or `.is-disabled`; muted text/border and no misleading hover |
| Visited | Inherit the component's readable link color; do not introduce an untracked purple |

The current implementation covers navigation, Launchpad tiles, event actions,
announcement controls, gallery rails, Network cards, and footer links. New
interactive components must use the same contract and the 44px touch-target
token where applicable.

## 11. Texture, responsive, and motion checks

- Scanlines and grain remain pointer-free overlays with low opacity. They are
  decorative and must not be placed above text with an opaque blend.
- `mix-blend-mode: screen` is limited to the scanline layer; headings and body
  copy remain on the base surface.
- The responsive breakpoint preserves readable contrast and state hierarchy at
  the mobile navigation, one-column Launchpad, and horizontally scrolling
  Gallery layouts.
- `prefers-reduced-motion: reduce` removes reveal/hover transitions and keeps
  selected, focus, and open states visible through borders, labels, and layout,
  not animation.
