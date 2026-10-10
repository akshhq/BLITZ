/**
 * BLITZ Website Interactive Engine
 * =============================================================================
 * Dependency-free, vanilla JavaScript for the BLITZ website.
 * Works seamlessly via file:// and any static hosting provider.
 *
 * Sections
 *   01 Utilities & data validation      09 Contact footer
 *   02 Marquee                          10 Navigation sheet & active link
 *   03 Announcements ticker & modal     11 Hero logo (scroll-driven dock)
 *   04 Events                           12 Horizontal rails
 *   05 Team                             13 Achievement cards
 *   06 Gallery                          14 Reveals
 *   07 Achievements                     15 Init
 *   08 Collaborations
 * =============================================================================
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 01. UTILITIES & DATA VALIDATION
  // ---------------------------------------------------------------------------
  const DATA = window.BLITZ_DATA || {
    announcements: [],
    events: [],
    team: [],
    gallery: [],
    achievements: [],
    collaborations: [],
    contact: {}
  };

  const root = document.documentElement;
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isReducedMotion = reducedMotionQuery.matches;

  /** Escape HTML entities to prevent injection. */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>'"]/g, function (char) {
      switch (char) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case "'": return '&#39;';
        case '"': return '&quot;';
        default: return char;
      }
    });
  }

  /** Link URLs: only http(s) and mailto are allowed. Returns an HTML-escaped value. */
  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
      return escapeHtml(trimmed);
    }
    return '#';
  }

  /**
   * Asset URLs (images): only relative paths or http(s) are allowed.
   * Rejects javascript:, data:, protocol-relative (//host) and any other scheme.
   * Returns an HTML-escaped value, or '' when unusable.
   */
  function safeAssetUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return escapeHtml(trimmed);
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.indexOf('//') === 0) return '';
    return escapeHtml(trimmed);
  }

  function padZero(num, length) {
    return String(num).padStart(length, '0');
  }

  /**
   * Parse "YYYY-MM-DD" as a LOCAL calendar date (new Date('2026-10-08') would be
   * UTC midnight and shift by a day in some timezones). Returns null if invalid.
   */
  function parseLocalDate(iso) {
    if (typeof iso !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function dateValue(iso) {
    const d = parseLocalDate(iso);
    return d ? d.getTime() : 0;
  }

  /** "2026-11-20" -> "20 Nov 2026" */
  function formatDate(isoString) {
    if (!isoString) return '';
    const d = parseLocalDate(isoString);
    if (!d) return String(isoString);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  }

  /** Nav height from the --nav-height CSS variable (+ any safe-area padding on the header). */
  function readNavHeight() {
    const header = document.querySelector('.site-header');
    let height = parseFloat(getComputedStyle(root).getPropertyValue('--nav-height'));
    if (!isFinite(height)) height = header ? header.offsetHeight : 64;
    const safeTop = header ? parseFloat(getComputedStyle(header).paddingTop) || 0 : 0;
    return height + safeTop;
  }

  // ---------------------------------------------------------------------------
  // 02. MARQUEE
  // ---------------------------------------------------------------------------
  function setUpMarquee() {
    document.querySelectorAll('.marquee-group').forEach(function (group) {
      group.innerHTML = Array.from({ length: 4 }, function () {
        return '<span class="marquee-text">DEPARTMENT OF COMPUTER SCIENCE</span>';
      }).join('');
    });
  }

  // ---------------------------------------------------------------------------
  // 03. ANNOUNCEMENTS TICKER & ACCESSIBLE MODAL
  // ---------------------------------------------------------------------------
  function renderAnnouncements() {
    const section = document.querySelector('#announcements');
    const track = document.querySelector('#announcements-ticker-track');
    const viewport = document.querySelector('#announcements-ticker-viewport');
    const status = document.querySelector('#announcements-status');
    const prevBtn = document.querySelector('#announcements-prev');
    const nextBtn = document.querySelector('#announcements-next');
    const toggleBtn = document.querySelector('#announcements-toggle-play');
    const playIcon = document.querySelector('#announcements-play-icon');
    const modal = document.querySelector('#announcement-modal');
    const modalClose = document.querySelector('#modal-close-btn');

    if (!track) return;

    const items = [...(DATA.announcements || [])].sort(function (a, b) {
      return dateValue(b.date) - dateValue(a.date);
    });

    if (items.length === 0) {
      track.innerHTML = '<span class="announcement-item-btn">No announcements right now. Check back soon.</span>';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      if (toggleBtn) toggleBtn.disabled = true;
      return;
    }

    let index = 0;
    let timer = null;
    const state = { paused: false, hovered: false, focused: false, onScreen: true, modalOpen: false };
    let lastFocusedElement = null;

    /** Render the current item. `announce` is only true for manual changes. */
    function updateTicker(announce) {
      const current = items[index];
      track.innerHTML = `
        <button
          type="button"
          class="announcement-item-btn"
          data-id="${escapeHtml(current.id)}"
        >
          <span class="announcement-item-date">${escapeHtml(formatDate(current.date))}</span>
          <span class="announcement-item-title">${escapeHtml(current.title)}</span>
          <span class="sr-only">(opens full details)</span>
          <span class="announcement-item-arrow" aria-hidden="true">&#8599;</span>
        </button>
      `;

      track.querySelector('.announcement-item-btn').addEventListener('click', function () {
        openModal(current);
      });

      // The auto-rotating track is NOT a live region (it would be read out every 5s).
      // Screen-reader feedback is given only when the user changes item themselves.
      if (announce && status) {
        status.textContent = `Announcement ${index + 1} of ${items.length}: ${current.title}, ${formatDate(current.date)}`;
      }
    }

    function step(delta, manual) {
      index = (index + delta + items.length) % items.length;
      updateTicker(manual);
    }

    function shouldRun() {
      return !state.paused && !state.hovered && !state.focused && state.onScreen &&
        !state.modalOpen && !document.hidden && !reducedMotionQuery.matches && items.length > 1;
    }

    function syncTicker() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (shouldRun()) {
        timer = setInterval(function () { step(1, false); }, 5000);
      }
    }

    function setPaused(paused) {
      state.paused = paused;
      if (playIcon) playIcon.textContent = paused ? '▶' : '⏸';
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-label', paused ? 'Resume announcements ticker' : 'Pause announcements ticker');
        toggleBtn.title = paused ? 'Resume ticker' : 'Pause ticker';
      }
      syncTicker();
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () { setPaused(!state.paused); });
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', function () { step(-1, true); setPaused(true); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { step(1, true); setPaused(true); });
    }

    if (viewport) {
      viewport.addEventListener('mouseenter', function () { state.hovered = true; syncTicker(); });
      viewport.addEventListener('mouseleave', function () { state.hovered = false; syncTicker(); });
      viewport.addEventListener('focusin', function () { state.focused = true; syncTicker(); });
      viewport.addEventListener('focusout', function () { state.focused = false; syncTicker(); });

      // Swipe left/right on the headline to change item (vertical scrolling stays native).
      let startX = 0;
      let startY = 0;
      viewport.addEventListener('touchstart', function (event) {
        const t = event.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
      }, { passive: true });
      viewport.addEventListener('touchend', function (event) {
        const t = event.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          step(dx < 0 ? 1 : -1, true);
          setPaused(true);
        }
      }, { passive: true });
    }

    // Do not tick while the bar is off-screen or the tab is hidden.
    if (section && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.onScreen = entries[0].isIntersecting;
        syncTicker();
      }).observe(section);
    }
    document.addEventListener('visibilitychange', syncTicker);

    // ---- Modal ------------------------------------------------------------
    function openModal(item) {
      if (!modal) return;
      lastFocusedElement = document.activeElement;

      const titleEl = document.querySelector('#modal-announcement-title');
      const dateEl = document.querySelector('#modal-announcement-date');
      const summaryEl = document.querySelector('#modal-announcement-summary');
      const textEl = document.querySelector('#modal-announcement-text');
      const linkWrap = document.querySelector('#modal-announcement-link-wrap');
      const linkEl = document.querySelector('#modal-announcement-link');

      if (titleEl) titleEl.textContent = item.title;
      if (dateEl) {
        dateEl.textContent = formatDate(item.date);
        dateEl.setAttribute('datetime', item.date || '');
      }
      if (summaryEl) summaryEl.textContent = item.summary || '';
      if (textEl) textEl.textContent = item.body || '';

      if (linkWrap && linkEl) {
        if (item.link && item.link.trim()) {
          linkEl.href = safeUrl(item.link);
          linkWrap.style.display = 'block';
        } else {
          linkWrap.style.display = 'none';
        }
      }

      const body = modal.querySelector('.announcement-modal-body');
      if (body) body.scrollTop = 0;

      state.modalOpen = true;
      syncTicker();
      root.classList.add('modal-open'); // lock page scroll behind the dialog

      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }
      if (modalClose) modalClose.focus();
    }

    /** Runs however the dialog was closed (button, ESC, backdrop tap). */
    function afterClose() {
      state.modalOpen = false;
      root.classList.remove('modal-open');
      syncTicker();
      const target = lastFocusedElement && document.contains(lastFocusedElement)
        ? lastFocusedElement
        : track.querySelector('.announcement-item-btn');
      if (target && typeof target.focus === 'function') target.focus();
      lastFocusedElement = null;
    }

    function closeModal() {
      if (!modal) return;
      if (typeof modal.close === 'function' && modal.open) {
        modal.close(); // triggers the 'close' event -> afterClose()
      } else {
        modal.removeAttribute('open');
        afterClose();
      }
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);

    if (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeModal(); // tap on the backdrop
      });
      modal.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeModal();
      });
      modal.addEventListener('close', function () {
        if (state.modalOpen) afterClose();
      });
    }

    updateTicker(false);
    syncTicker();
  }

  // ---------------------------------------------------------------------------
  // 04. EVENTS RENDERING (Newest to Oldest with Dynamic Badge)
  // ---------------------------------------------------------------------------
  function renderEvents() {
    const container = document.querySelector('#events-stack');
    if (!container) return;

    const eventsList = [...(DATA.events || [])].sort(function (a, b) {
      return dateValue(b.date) - dateValue(a.date);
    });

    if (eventsList.length === 0) {
      container.innerHTML = '<p class="events-empty">No events scheduled at this time.</p>';
      return;
    }

    // Local midnight "today": an event dated today is still UPCOMING in every timezone.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    container.innerHTML = eventsList.map(function (event, index) {
      const eventDate = parseLocalDate(event.date);
      const isUpcoming = !!eventDate && eventDate.getTime() >= today.getTime();
      const badgeText = isUpcoming ? 'UPCOMING' : 'PAST';
      const badgeClass = isUpcoming ? 'event-badge--upcoming' : 'event-badge--past';
      const titleId = `event-title-${escapeHtml(event.id || index)}`;

      return `
        <article
          class="events-panel surface surface--maroon"
          style="--event-index:${index}"
          aria-labelledby="${titleId}"
        >
          <div class="events-panel-inner">
            <div class="events-panel-top">
              <span class="events-panel-number">N°${padZero(index + 1, 3)}</span>
              <span class="event-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="events-panel-content">
              <h3 id="${titleId}">${escapeHtml(event.title)}</h3>
              <p class="events-panel-description">${escapeHtml(event.description)}</p>
              <dl class="events-panel-details">
                <div>
                  <dt>Date</dt>
                  <dd>${escapeHtml(formatDate(event.date))}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>${escapeHtml(event.location)}</dd>
                </div>
                <div>
                  <dt>Format</dt>
                  <dd>${escapeHtml(event.additionalInfo || 'Departmental Initiative')}</dd>
                </div>
              </dl>
            </div>
          </div>
        </article>
      `;
    }).join('');

    setUpStickyGuard();
  }

  /**
   * Sticky stacking only works when a panel fits inside the visible area below its
   * stuck position; otherwise its lower part could never be scrolled into view.
   * Panels that are too tall (long copy on small screens) fall back to normal flow.
   */
  function setUpStickyGuard() {
    const panels = [...document.querySelectorAll('.events-panel')];
    if (panels.length === 0) return;

    let lastWidth = -1;
    let frame = null;

    function evaluate() {
      frame = null;
      const viewportHeight = window.innerHeight;
      panels.forEach(function (panel) {
        panel.classList.remove('is-tall');
      });
      panels.forEach(function (panel) {
        const stuckTop = parseFloat(getComputedStyle(panel).top) || 0;
        // +2: a panel sized exactly to the visible area (its min-height) is not 'too tall'
        const tooTall = panel.offsetHeight > viewportHeight - stuckTop + 2;
        panel.classList.toggle('is-tall', tooTall);
      });
    }

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(evaluate);
    }

    window.addEventListener('resize', function () {
      // Ignore height-only changes (mobile toolbars showing/hiding).
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        schedule();
      }
    });
    lastWidth = window.innerWidth;
    evaluate();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    window.addEventListener('load', schedule);
  }

  // ---------------------------------------------------------------------------
  // 05. TEAM RENDERING (Contrast Break: Light Cream Surface)
  // ---------------------------------------------------------------------------
  function renderTeam() {
    const container = document.querySelector('#team-content');
    if (!container) return;

    const tiers = [
      { key: 'core', label: 'Leadership', gridClass: 'team-grid--core' },
      { key: 'senior', label: 'Senior Executives', gridClass: 'team-grid--senior' },
      { key: 'junior', label: 'Junior Executives', gridClass: 'team-grid--junior' },
      { key: 'volunteer', label: 'Volunteers', gridClass: 'team-grid--volunteer' }
    ];

    const defaultAvatar = 'assets/images/team/avatar-placeholder.svg';

    // Normalise once; a record without a name is skipped instead of throwing.
    const teamList = (DATA.team || []).map(function (member) {
      return {
        name: String((member && member.name) || '').trim(),
        position: String((member && member.position) || '').trim(),
        tier: member && member.tier,
        photo: member && member.photo
      };
    }).filter(function (member) {
      return member.name;
    });

    container.innerHTML = tiers.map(function (tier) {
      const members = teamList.filter(function (m) {
        return m.tier === tier.key;
      });
      if (members.length === 0) return '';

      const cardsHtml = members.map(function (member) {
        const photo = safeAssetUrl(member.photo);
        const hasPhoto = !!photo;
        // Real photos get a descriptive alt; the placeholder avatar is decorative.
        const altText = hasPhoto
          ? escapeHtml(member.position ? `${member.name}, ${member.position}` : member.name)
          : '';

        return `
          <div class="team-card">
            <div class="team-card-image">
              <img
                src="${hasPhoto ? photo : defaultAvatar}"
                alt="${altText}"
                loading="lazy"
                decoding="async"
                width="200"
                height="200"
              />
            </div>
            <div class="team-card-text">
              <h4 class="team-card-name">${escapeHtml(member.name)}</h4>
              ${member.position ? `<p class="team-card-position">${escapeHtml(member.position)}</p>` : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <section class="team-tier reveal-tier" aria-labelledby="team-tier-${tier.key}">
          <div class="team-tier-heading">
            <h3 id="team-tier-${tier.key}">${escapeHtml(tier.label)}</h3>
          </div>
          <div class="team-grid ${tier.gridClass}">
            ${cardsHtml}
          </div>
        </section>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // 06. GALLERY RENDERING (Real Images, Lazy Loading)
  // ---------------------------------------------------------------------------
  function renderGallery() {
    const track = document.querySelector('#gallery-track');
    if (!track) return;

    const galleryList = DATA.gallery || [];
    if (galleryList.length === 0) {
      track.innerHTML = '<p class="events-empty">Photographs will appear here following upcoming events.</p>';
      return;
    }

    track.innerHTML = galleryList.map(function (item, index) {
      return `
        <figure class="gallery-item">
          <div class="gallery-img-shell">
            <img
              src="${safeAssetUrl(item.image)}"
              alt="${escapeHtml(item.alt || item.title)}"
              loading="lazy"
              decoding="async"
              width="800"
              height="600"
            />
          </div>
          <figcaption>
            <span>${padZero(index + 1, 2)}</span>
            <span>${escapeHtml(item.title)}</span>
          </figcaption>
        </figure>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // 07. ACHIEVEMENTS RENDERING (Honors, Placements, Milestones)
  // ---------------------------------------------------------------------------
  function renderAchievements() {
    const track = document.querySelector('#highlights-track');
    if (!track) return;

    const list = DATA.achievements || [];
    if (list.length === 0) {
      track.innerHTML = '<p class="events-empty">Milestones and accolades will be published shortly.</p>';
      return;
    }

    // Everything inside a <button> must be phrasing content, hence <span> (not <div>/<h3>/<p>).
    // The button's accessible name is its text content, so the details are always readable by AT.
    track.innerHTML = list.map(function (item, index) {
      return `
        <button class="highlights-card" type="button" aria-expanded="false">
          <span class="highlights-card-surface">
            <span class="highlights-card-header">
              <span class="highlights-card-number">${padZero(index + 1, 2)}</span>
              <span class="highlights-card-year">${escapeHtml(item.year)}</span>
            </span>
            <span class="highlights-card-category">${escapeHtml(item.category || 'Honors')}</span>
            <span class="highlights-card-title">${escapeHtml(item.title)}</span>
            <span class="highlights-card-details">
              <span class="highlights-card-details-inner">
                <span class="highlights-card-description">${escapeHtml(item.description)}</span>
                ${item.metrics ? `<span class="highlights-card-metric">${escapeHtml(item.metrics)}</span>` : ''}
              </span>
            </span>
          </span>
        </button>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // 08. COLLABORATIONS RENDERING (Partners, Societies, Sponsors)
  // ---------------------------------------------------------------------------
  function renderCollaborations() {
    const grid = document.querySelector('#collaborations-grid');
    if (!grid) return;

    const list = DATA.collaborations || [];
    if (list.length === 0) {
      grid.innerHTML = '<p class="events-empty">Collaborative initiatives are currently in progress.</p>';
      return;
    }

    grid.innerHTML = list.map(function (partner) {
      return `
        <a
          href="${safeUrl(partner.url)}"
          class="collab-card"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div class="collab-logo-box">
            <img
              src="${safeAssetUrl(partner.logo)}"
              alt="${escapeHtml(partner.name)} logo"
              loading="lazy"
              decoding="async"
              width="240"
              height="100"
            />
          </div>
          <h3 class="collab-name">${escapeHtml(partner.name)}</h3>
          <span class="collab-type">${escapeHtml(partner.type)}</span>
        </a>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // 09. CONTACT FOOTER RENDERING & DYNAMIC COPYRIGHT
  // ---------------------------------------------------------------------------
  const ICONS = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6.5L21 7"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="0.6" fill="currentColor"/>',
    linkedin: '<path d="M6 9.5V19M6 5.6v.01M10.5 19V9.5m0 4c0-2.2 1.6-4 4-4s3.5 1.6 3.5 4V19"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.4"/>'
  };

  function contactItem(icon, label, value, href, external) {
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `
      <a class="blitz-contact-item" href="${href}"${attrs}>
        <span class="blitz-contact-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONS[icon]}</svg>
        </span>
        <span class="blitz-contact-text">
          <span class="blitz-contact-heading">${escapeHtml(label)}</span>
          <span class="blitz-contact-value">${escapeHtml(value)}</span>
        </span>
      </a>
    `;
  }

  function renderContact() {
    const grid = document.querySelector('#contact-info-grid');
    const yearEl = document.querySelector('#current-year');
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
    if (!grid) return;

    const contact = DATA.contact || {};
    const items = [];

    if (contact.mail) {
      items.push(contactItem('mail', 'Mail', contact.mail, safeUrl('mailto:' + contact.mail), false));
    }
    if (contact.instagram) {
      items.push(contactItem('instagram', 'Instagram', contact.instagramHandle || contact.instagram, safeUrl(contact.instagram), true));
    }
    if (contact.linkedin) {
      const display = String(contact.linkedin).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      items.push(contactItem('linkedin', 'LinkedIn', display, safeUrl(contact.linkedin), true));
    }
    if (contact.location) {
      const maps = contact.mapsUrl ||
        'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(contact.location);
      items.push(contactItem('pin', 'Location', contact.location, safeUrl(maps), true));
    }

    grid.innerHTML = items.join('');
  }

  // ---------------------------------------------------------------------------
  // 10. NAVIGATION SHEET & ACTIVE LINK OBSERVER
  // ---------------------------------------------------------------------------
  function setUpMenu() {
    const toggle = document.querySelector('#menu-toggle');
    const links = document.querySelector('#primary-navigation-links');
    const header = document.querySelector('.site-header');
    const brand = document.querySelector('#nav-brand');
    if (!toggle || !links) return;

    const desktopQuery = window.matchMedia('(min-width: 900px)');

    function isOpen() {
      return toggle.classList.contains('is-open');
    }

    function setOpen(open) {
      toggle.classList.toggle('is-open', open);
      links.classList.toggle('is-open', open);
      root.classList.toggle('nav-open', open); // body scroll lock
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    }

    toggle.addEventListener('click', function () {
      setOpen(!isOpen());
    });

    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setOpen(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (!isOpen()) return;

      if (event.key === 'Escape') {
        setOpen(false);
        toggle.focus();
        return;
      }

      // Focus trap: Tab cycles through brand, toggle and the sheet's links only.
      if (event.key === 'Tab') {
        const focusables = [brand, toggle].concat([...links.querySelectorAll('a')]).filter(Boolean);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (!header.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    // Outside tap closes
    document.addEventListener('click', function (event) {
      if (isOpen() && !header.contains(event.target)) {
        setOpen(false);
      }
    });

    // Rotating a tablet / resizing to desktop must never leave the page scroll-locked.
    function onBreakpoint() {
      if (desktopQuery.matches && isOpen()) setOpen(false);
    }
    if (desktopQuery.addEventListener) {
      desktopQuery.addEventListener('change', onBreakpoint);
    } else if (desktopQuery.addListener) {
      desktopQuery.addListener(onBreakpoint);
    }
  }

  function setUpActiveNavObserver() {
    const sections = document.querySelectorAll('section[id], footer[id]');
    const navLinks = document.querySelectorAll('.nav-links .nav-link');
    if (sections.length === 0 || navLinks.length === 0) return;

    function activate(id) {
      navLinks.forEach(function (link) {
        const isActive = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', isActive);
        if (isActive) {
          link.setAttribute('aria-current', 'true');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) activate(entry.target.getAttribute('id'));
      });
    }, {
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    });

    sections.forEach(function (sec) {
      observer.observe(sec);
    });

    // The footer is shorter than the viewport band above, so it would never activate on its own.
    let frame = null;
    window.addEventListener('scroll', function () {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        const atBottom = window.innerHeight + window.scrollY >= root.scrollHeight - 4;
        if (atBottom) activate('contact');
      });
    }, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // 11. HERO LOGO (scroll-driven shrink/fade into the nav)
  // ---------------------------------------------------------------------------
  function setUpHeroLogo() {
    const logo = document.querySelector('#transition-logo');
    const hero = document.querySelector('#home');
    const shell = document.querySelector('.hero-heading-shell');
    if (!logo || !hero) return;

    // Cached geometry: the scroll handler only reads window.scrollY and writes styles.
    let navHeight = 64;
    let heroHeight = 1;
    let startCenterY = 0;
    let endScale = 0.3;
    let lastWidth = -1;
    let frame = null;
    let isHeroVisible = true;

    function measure() {
      navHeight = readNavHeight();
      heroHeight = hero.offsetHeight;
      // `top` of the fixed logo resolves to px (its centre line, see translate(-50%,-50%)).
      startCenterY = parseFloat(getComputedStyle(logo).top) || window.innerHeight * 0.414;
      const logoHeight = logo.offsetHeight || 1;
      endScale = Math.max(0.14, Math.min(0.6, (navHeight * 0.5) / logoHeight));
      lastWidth = window.innerWidth;
    }

    function update() {
      frame = null;
      if (!isHeroVisible) {
        logo.style.opacity = '0';
        return;
      }

      const range = Math.max(1, heroHeight - navHeight);
      const progress = Math.max(0, Math.min(1, window.scrollY / range));
      // the subtitle pill fades out early so the travelling logo never visibly crosses it
      if (shell) shell.style.opacity = String(Math.max(0, 1 - progress * 4));

      if (progress >= 1) {
        // Docked: hide so it doesn't duplicate the nav brand
        logo.style.opacity = '0';
      } else {
        logo.style.opacity = String(1 - Math.pow(progress, 2.5));
        const y = -(startCenterY - navHeight / 2) * progress;
        const scale = 1 - (1 - endScale) * progress;
        logo.style.transform = `translate(-50%, calc(-50% + ${y.toFixed(1)}px)) scale(${scale.toFixed(4)})`;
      }
    }

    function requestUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', function () {
      // Height-only resizes (mobile toolbars) don't change any of the cached values.
      if (window.innerWidth !== lastWidth) {
        measure();
        requestUpdate();
      }
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { measure(); requestUpdate(); }, 250);
    });
    window.addEventListener('load', function () { measure(); requestUpdate(); });

    // Pause logo float + marquee (pure CSS, driven by this class) when the hero is off-screen.
    const heroObserver = new IntersectionObserver(function (entries) {
      isHeroVisible = entries[0].isIntersecting;
      hero.classList.toggle('is-offscreen', !isHeroVisible);
      requestUpdate();
    }, { threshold: 0 });

    heroObserver.observe(hero);
    measure();
    update();
  }

  // ---------------------------------------------------------------------------
  // 12. HORIZONTAL RAIL LOGIC (wheel assist, arrow keys, prev/next by card)
  // ---------------------------------------------------------------------------
  function setUpHorizontalRail(scrollerSelector, prevBtnSelector, nextBtnSelector) {
    const scroller = document.querySelector(scrollerSelector);
    if (!scroller) return;

    const prevBtn = prevBtnSelector ? document.querySelector(prevBtnSelector) : null;
    const nextBtn = nextBtnSelector ? document.querySelector(nextBtnSelector) : null;

    let target = scroller.scrollLeft;
    let frame = null;

    function clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }

    /** Distance of one card (+ gap), so buttons/keys always land on the next card. */
    function cardStep() {
      const track = scroller.firstElementChild;
      const card = track && track.firstElementChild;
      if (!card) return scroller.clientWidth * 0.75;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    }

    function scrollByCards(direction) {
      scroller.scrollBy({ left: direction * cardStep(), behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
    }

    function animate() {
      const distance = target - scroller.scrollLeft;
      if (Math.abs(distance) < 0.5) {
        scroller.scrollLeft = target;
        frame = null;
        return;
      }
      scroller.scrollLeft += distance * 0.16;
      frame = requestAnimationFrame(animate);
    }

    // Wheel assist for mice: converts vertical wheel to horizontal ONLY while the rail can still
    // move that way; at either edge (or for horizontal / modified wheel) the page scrolls normally.
    scroller.addEventListener('wheel', function (event) {
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      if (maxScroll <= 0 || !event.deltaY) return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const isScrollingDown = event.deltaY > 0;
      const isScrollingUp = event.deltaY < 0;
      const atStart = scroller.scrollLeft <= 2;
      const atEnd = scroller.scrollLeft >= maxScroll - 2;
      if ((isScrollingDown && atEnd) || (isScrollingUp && atStart)) return;

      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      target = clamp(target + event.deltaY * multiplier, 0, maxScroll);
      if (!frame) frame = requestAnimationFrame(animate);
    }, { passive: false });

    scroller.addEventListener('scroll', function () {
      if (!frame) target = scroller.scrollLeft;
    }, { passive: true });

    scroller.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollByCards(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollByCards(-1);
      }
    });

    if (prevBtn) prevBtn.addEventListener('click', function () { scrollByCards(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { scrollByCards(1); });
  }

  // ---------------------------------------------------------------------------
  // 13. ACHIEVEMENT CARDS (hover / keyboard on pointer devices, always open on touch)
  // ---------------------------------------------------------------------------
  function setUpHighlightCards() {
    const cards = [...document.querySelectorAll('.highlights-card')];
    if (cards.length === 0) return;

    const touchOnly = window.matchMedia('(hover: none)');

    /**
     * A card is open when it is hovered, keyboard-focused or pinned (Enter / Space).
     * On touch-only devices every card is always open (CSS shows the details), so no tap is
     * needed and the old "focus opens, click closes" race cannot occur.
     */
    function refresh(card) {
      const open = touchOnly.matches ||
        card.classList.contains('is-pinned') ||
        card._hovered === true ||
        card.matches(':focus-visible');
      card.classList.toggle('is-open', open);
      card.setAttribute('aria-expanded', String(open));
    }

    function refreshAll() {
      cards.forEach(refresh);
    }

    cards.forEach(function (card) {
      card.addEventListener('mouseenter', function () { card._hovered = true; refresh(card); });
      card.addEventListener('mouseleave', function () { card._hovered = false; refresh(card); });
      card.addEventListener('focus', function () { refresh(card); });
      card.addEventListener('blur', function () { refresh(card); });

      // click fires for Enter, Space AND pointer taps. Only toggle the pin for keyboard / AT
      // activation (detail === 0); a mouse click on a hovered card must not collapse it.
      card.addEventListener('click', function (event) {
        if (touchOnly.matches) return;
        if (event.detail !== 0) return;
        card.classList.toggle('is-pinned');
        refresh(card);
      });
    });

    // Pinned cards close when focus or a pointer goes elsewhere.
    document.addEventListener('pointerdown', function (event) {
      if (event.target.closest && event.target.closest('.highlights-card')) return;
      cards.forEach(function (c) {
        c.classList.remove('is-pinned');
      });
      refreshAll();
    });
    cards.forEach(function (card) {
      card.addEventListener('blur', function () {
        card.classList.remove('is-pinned');
        refresh(card);
      });
    });

    if (touchOnly.addEventListener) {
      touchOnly.addEventListener('change', refreshAll);
    }
    refreshAll();
  }

  // ---------------------------------------------------------------------------
  // 14. PROGRESSIVE REVEALS (Fallback Scoped to html.js)
  // ---------------------------------------------------------------------------
  function setUpReveals() {
    const revealItems = [...document.querySelectorAll('[data-reveal], .reveal-tier')];
    if (revealItems.length === 0) return;

    if (isReducedMotion || !('IntersectionObserver' in window)) {
      revealItems.forEach(function (item) {
        item.classList.add('is-revealed');
      });
      return;
    }

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  }

  // ---------------------------------------------------------------------------
  // 15. INITIALIZATION
  // ---------------------------------------------------------------------------
  function init() {
    setUpMarquee();
    renderAnnouncements();
    renderEvents();
    renderTeam();
    renderGallery();
    renderAchievements();
    renderCollaborations();
    renderContact();

    setUpMenu();
    setUpActiveNavObserver();
    setUpHeroLogo();

    setUpHorizontalRail('#gallery-scroller', '#gallery-rail-prev', '#gallery-rail-next');
    setUpHorizontalRail('#highlights-scroller', '#achievements-rail-prev', '#achievements-rail-next');

    setUpHighlightCards();
    setUpReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
