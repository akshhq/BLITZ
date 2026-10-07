/**
 * BLITZ Website Interactive Engine
 * =============================================================================
 * Dependency-free, vanilla JavaScript for the BLITZ website.
 * Works seamlessly via file:// and any static hosting provider.
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

  /**
   * Escape HTML entities to prevent injection
   */
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

  /**
   * Validate and sanitize URLs (only allow safe protocols)
   */
  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
      return escapeHtml(trimmed);
    }
    return '#';
  }

  /**
   * Pad numbers with leading zeroes
   */
  function padZero(num, length) {
    return String(num).padStart(length, '0');
  }

  /**
   * Format ISO date string (YYYY-MM-DD) into readable display (e.g. "15 Nov 2026")
   */
  function formatDate(isoString) {
    if (!isoString) return '';
    const parts = isoString.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (monthIndex >= 0 && monthIndex < 12 && !isNaN(day)) {
        return `${day} ${monthNames[monthIndex]} ${year}`;
      }
    }
    return isoString;
  }

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // 02. MARQUEE & 3D LOGO SETUP
  // ---------------------------------------------------------------------------
  function makeLogo() {
    const extrusion = document.querySelector('.blitz-logo-extrusion');
    if (!extrusion) return;

    // Reduce extruded layers on mobile or reduced motion for optimal rendering performance
    let layerCount = 12;
    let stepSize = 2;
    if (isReducedMotion) {
      layerCount = 1;
      stepSize = 1;
    } else if (window.innerWidth < 768) {
      layerCount = 6;
      stepSize = 3;
    }

    extrusion.innerHTML = Array.from({ length: layerCount }, function (_, index) {
      const step = (index + 1) * stepSize;
      return `<span class="blitz-logo-depth" style="--depth-step:${step}px">BLITZ</span>`;
    }).join('');

    const marqueeGroups = document.querySelectorAll('.marquee-group');
    marqueeGroups.forEach(function (group) {
      group.innerHTML = Array.from({ length: 4 }, function () {
        return '<span class="marquee-text">DEPARTMENT OF COMPUTER SCIENCE</span>';
      }).join('');
    });
  }

  // ---------------------------------------------------------------------------
  // 03. ANNOUNCEMENTS TICKER & ACCESSIBLE MODAL
  // ---------------------------------------------------------------------------
  let announcementIndex = 0;
  let tickerTimer = null;
  let isTickerPaused = false;
  let lastFocusedElement = null;

  function renderAnnouncements() {
    const track = document.querySelector('#announcements-ticker-track');
    const prevBtn = document.querySelector('#announcements-prev');
    const nextBtn = document.querySelector('#announcements-next');
    const toggleBtn = document.querySelector('#announcements-toggle-play');
    const playIcon = document.querySelector('#announcements-play-icon');
    const modal = document.querySelector('#announcement-modal');
    const modalClose = document.querySelector('#modal-close-btn');

    if (!track) return;

    const items = [...(DATA.announcements || [])].sort(function (a, b) {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    if (items.length === 0) {
      track.innerHTML = '<span class="announcement-item-btn">No announcements right now. Check back soon.</span>';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      if (toggleBtn) toggleBtn.disabled = true;
      return;
    }

    function updateTicker() {
      const current = items[announcementIndex];
      track.innerHTML = `
        <button
          type="button"
          class="announcement-item-btn"
          data-id="${escapeHtml(current.id)}"
          aria-label="Announcement: ${escapeHtml(current.title)}. Click for full details."
        >
          <span class="announcement-item-date">${escapeHtml(formatDate(current.date))}</span>
          <span class="announcement-item-title">${escapeHtml(current.title)}</span>
          <span aria-hidden="true">&#8599;</span>
        </button>
      `;

      const btn = track.querySelector('.announcement-item-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          openAnnouncementModal(current);
        });
      }
    }

    function nextAnnouncement() {
      announcementIndex = (announcementIndex + 1) % items.length;
      updateTicker();
    }

    function prevAnnouncement() {
      announcementIndex = (announcementIndex - 1 + items.length) % items.length;
      updateTicker();
    }

    function startTicker() {
      if (isReducedMotion || items.length <= 1) return;
      stopTicker();
      tickerTimer = setInterval(nextAnnouncement, 5000);
    }

    function stopTicker() {
      if (tickerTimer) {
        clearInterval(tickerTimer);
        tickerTimer = null;
      }
    }

    function setPaused(paused) {
      isTickerPaused = paused;
      if (paused) {
        stopTicker();
        if (playIcon) playIcon.textContent = '▶';
        if (toggleBtn) {
          toggleBtn.setAttribute('aria-label', 'Resume announcements ticker');
          toggleBtn.title = 'Resume ticker';
        }
      } else {
        startTicker();
        if (playIcon) playIcon.textContent = '⏸';
        if (toggleBtn) {
          toggleBtn.setAttribute('aria-label', 'Pause announcements ticker');
          toggleBtn.title = 'Pause ticker';
        }
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        setPaused(!isTickerPaused);
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        prevAnnouncement();
        setPaused(true);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        nextAnnouncement();
        setPaused(true);
      });
    }

    const viewport = document.querySelector('#announcements-ticker-viewport');
    if (viewport) {
      viewport.addEventListener('mouseenter', function () {
        if (!isTickerPaused) stopTicker();
      });
      viewport.addEventListener('mouseleave', function () {
        if (!isTickerPaused) startTicker();
      });
      viewport.addEventListener('focusin', function () {
        if (!isTickerPaused) stopTicker();
      });
      viewport.addEventListener('focusout', function () {
        if (!isTickerPaused) startTicker();
      });
    }

    // Modal Handling
    function openAnnouncementModal(item) {
      if (!modal) return;
      lastFocusedElement = document.activeElement;

      const titleEl = document.querySelector('#modal-announcement-title');
      const dateEl = document.querySelector('#modal-announcement-date');
      const summaryEl = document.querySelector('#modal-announcement-summary');
      const textEl = document.querySelector('#modal-announcement-text');
      const linkWrap = document.querySelector('#modal-announcement-link-wrap');
      const linkEl = document.querySelector('#modal-announcement-link');

      if (titleEl) titleEl.textContent = item.title;
      if (dateEl) dateEl.textContent = formatDate(item.date);
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

      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.setAttribute('open', 'true');
      }

      if (modalClose) modalClose.focus();
    }

    function closeAnnouncementModal() {
      if (!modal) return;
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.removeAttribute('open');
      }
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    if (modalClose) {
      modalClose.addEventListener('click', closeAnnouncementModal);
    }

    if (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) {
          closeAnnouncementModal();
        }
      });
      modal.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeAnnouncementModal();
      });
    }

    updateTicker();
    if (!isReducedMotion) {
      startTicker();
    }
  }

  // ---------------------------------------------------------------------------
  // 04. EVENTS RENDERING (Newest to Oldest with Dynamic Badge)
  // ---------------------------------------------------------------------------
  function renderEvents() {
    const container = document.querySelector('#events-stack');
    if (!container) return;

    const eventsList = [...(DATA.events || [])].sort(function (a, b) {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    if (eventsList.length === 0) {
      container.innerHTML = '<p class="events-empty">No events scheduled at this time.</p>';
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    container.innerHTML = eventsList.map(function (event, index) {
      const eventDate = new Date(event.date);
      const isUpcoming = eventDate.getTime() >= today.getTime();
      const badgeText = isUpcoming ? 'UPCOMING' : 'PAST';
      const badgeClass = isUpcoming ? 'event-badge--upcoming' : 'event-badge--past';

      return `
        <article
          class="events-panel surface surface--maroon"
          style="--event-index:${index};--event-stack-offset:${index * 48}px"
          aria-labelledby="event-title-${escapeHtml(event.id || index)}"
        >
          <div class="events-panel-inner">
            <div class="events-panel-top">
              <span class="events-panel-number">N°${padZero(index + 1, 3)}</span>
              <span class="event-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="events-panel-content">
              <h3 id="event-title-${escapeHtml(event.id || index)}">${escapeHtml(event.title)}</h3>
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
              <p class="events-panel-info">${escapeHtml(event.additionalInfo || 'BLITZ Initiative')}</p>
            </div>
          </div>
        </article>
      `;
    }).join('');
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
      { key: 'junior', label: 'Junior Members', gridClass: 'team-grid--junior' },
      { key: 'volunteer', label: 'Volunteers', gridClass: 'team-grid--volunteer' }
    ];

    const teamList = DATA.team || [];
    const defaultAvatar = 'assets/images/team/avatar-placeholder.svg';

    container.innerHTML = tiers.map(function (tier) {
      const members = teamList.filter(function (m) {
        return m.tier === tier.key;
      });
      if (members.length === 0) return '';

      const cardsHtml = members.map(function (member) {
        const isTBD = member.name.startsWith('TBD');
        const altText = isTBD ? '' : `${escapeHtml(member.name)}, ${escapeHtml(member.position)}`;
        const photoSrc = member.photo && member.photo.trim() ? member.photo : defaultAvatar;

        let linksHtml = '';
        if (member.links) {
          const links = [];
          if (member.links.linkedin) {
            links.push(`
              <a
                href="${safeUrl(member.links.linkedin)}"
                target="_blank"
                rel="noopener noreferrer"
                class="team-card-link"
                aria-label="${escapeHtml(member.name)} on LinkedIn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
              </a>
            `);
          }
          if (member.links.github) {
            links.push(`
              <a
                href="${safeUrl(member.links.github)}"
                target="_blank"
                rel="noopener noreferrer"
                class="team-card-link"
                aria-label="${escapeHtml(member.name)} on GitHub"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>
              </a>
            `);
          }
          if (member.links.instagram) {
            links.push(`
              <a
                href="${safeUrl(member.links.instagram)}"
                target="_blank"
                rel="noopener noreferrer"
                class="team-card-link"
                aria-label="${escapeHtml(member.name)} on Instagram"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              </a>
            `);
          }
          if (links.length > 0) {
            linksHtml = `<div class="team-card-links">${links.join('')}</div>`;
          }
        }

        const bioHtml = member.bio ? `<p class="team-card-bio">${escapeHtml(member.bio)}</p>` : '';

        return `
          <div class="team-card">
            <div class="team-card-image">
              <img
                src="${photoSrc}"
                alt="${altText}"
                loading="lazy"
                decoding="async"
                width="96"
                height="96"
              />
            </div>
            <h4 class="team-card-name">${escapeHtml(member.name)}</h4>
            <p class="team-card-position">${escapeHtml(member.position)}</p>
            ${bioHtml}
            ${linksHtml}
          </div>
        `;
      }).join('');

      return `
        <section class="team-tier reveal-tier" aria-label="${escapeHtml(tier.label)}">
          <div class="team-tier-heading">
            <h3>${escapeHtml(tier.label)}</h3>
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
              src="${escapeHtml(item.image)}"
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

    track.innerHTML = list.map(function (item, index) {
      return `
        <button
          class="highlights-card"
          type="button"
          aria-expanded="false"
          aria-label="${escapeHtml(item.title)}: ${escapeHtml(item.metrics || '')}. Click to view details."
        >
          <div class="highlights-card-surface">
            <div class="highlights-card-header">
              <span class="highlights-card-number">${padZero(index + 1, 2)}</span>
              <span class="highlights-card-year">${escapeHtml(item.year)}</span>
            </div>
            <div class="highlights-card-category">${escapeHtml(item.category || 'Honors')}</div>
            <h3 class="highlights-card-title">${escapeHtml(item.title)}</h3>
            <div class="highlights-card-details">
              <div class="highlights-card-details-inner">
                <p class="highlights-card-description">${escapeHtml(item.description)}</p>
                ${item.metrics ? `<span class="highlights-card-metric">${escapeHtml(item.metrics)}</span>` : ''}
              </div>
            </div>
          </div>
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
          aria-label="${escapeHtml(partner.name)} (${escapeHtml(partner.type)})"
        >
          <div class="collab-logo-box">
            <img
              src="${escapeHtml(partner.logo)}"
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
      items.push(`
        <div class="blitz-contact-item">
          <p class="blitz-contact-heading">Mail</p>
          <a href="mailto:${escapeHtml(contact.mail)}">${escapeHtml(contact.mail)}</a>
        </div>
      `);
    }

    if (contact.instagram) {
      items.push(`
        <div class="blitz-contact-item">
          <p class="blitz-contact-heading">Instagram</p>
          <a href="${safeUrl(contact.instagram)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(contact.instagramHandle || '@blitz_kmv')}
          </a>
        </div>
      `);
    }

    if (contact.location) {
      items.push(`
        <div class="blitz-contact-item">
          <p class="blitz-contact-heading">Location</p>
          <a href="${safeUrl(contact.mapsUrl || 'https://maps.google.com/?q=Keshav+Mahavidyalaya')}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(contact.location)}
          </a>
        </div>
      `);
    }

    if (Array.isArray(contact.extraLinks) && contact.extraLinks.length > 0) {
      contact.extraLinks.forEach(function (link) {
        if (link && link.label && link.url) {
          items.push(`
            <div class="blitz-contact-item">
              <p class="blitz-contact-heading">${escapeHtml(link.label)}</p>
              <a href="${safeUrl(link.url)}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(link.label)} Profile &#8599;
              </a>
            </div>
          `);
        }
      });
    }

    grid.innerHTML = items.join('');
  }

  // ---------------------------------------------------------------------------
  // 10. NAVIGATION MENU & ACTIVE LINK OBSERVER
  // ---------------------------------------------------------------------------
  function setUpMenu() {
    const toggle = document.querySelector('#menu-toggle');
    const links = document.querySelector('#primary-navigation-links');
    if (!toggle || !links) return;

    function setOpen(open) {
      toggle.classList.toggle('is-open', open);
      links.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    }

    toggle.addEventListener('click', function () {
      setOpen(!toggle.classList.contains('is-open'));
    });

    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setOpen(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener('click', function (event) {
      if (!toggle.contains(event.target) && !links.contains(event.target) && toggle.classList.contains('is-open')) {
        setOpen(false);
      }
    });
  }

  function setUpActiveNavObserver() {
    const sections = document.querySelectorAll('section[id], footer[id]');
    const navLinks = document.querySelectorAll('.nav-links .nav-link');
    if (sections.length === 0 || navLinks.length === 0) return;

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach(function (link) {
            const href = link.getAttribute('href');
            const isActive = href === `#${id}`;
            link.classList.toggle('is-active', isActive);
            if (isActive) {
              link.setAttribute('aria-current', 'true');
            } else {
              link.removeAttribute('aria-current');
            }
          });
        }
      });
    }, {
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    });

    sections.forEach(function (sec) {
      observer.observe(sec);
    });
  }

  // ---------------------------------------------------------------------------
  // 11. HERO LOGO INTERPOLATION & BATTERY SAVER
  // ---------------------------------------------------------------------------
  function setUpHeroLogo() {
    const logo = document.querySelector('#transition-logo');
    const hero = document.querySelector('#home');
    const blitzLogoText = document.querySelector('.blitz-logo');
    if (!logo || !hero) return;

    let frame = null;
    let isHeroVisible = true;

    function update() {
      frame = null;
      if (!isHeroVisible) {
        logo.style.opacity = '0';
        return;
      }

      const heroRect = hero.getBoundingClientRect();
      const heroHeight = hero.offsetHeight;
      const progress = Math.max(0, Math.min(1, -heroRect.top / (heroHeight - 74)));

      if (progress >= 1) {
        // Docked: hide transition logo to prevent duplicate text with nav brand
        logo.style.opacity = '0';
        logo.style.pointerEvents = 'none';
        if (blitzLogoText) blitzLogoText.style.animationPlayState = 'paused';
      } else {
        logo.style.opacity = String(1 - Math.pow(progress, 2.5));
        const initialTop = window.innerHeight * 0.414;
        const y = -(initialTop - 37) * progress;
        const scale = 1 - 0.76 * progress;
        logo.style.transform = `translate(-50%, calc(-50% + ${y}px)) scale(${scale})`;
        if (blitzLogoText && !isReducedMotion) {
          blitzLogoText.style.animationPlayState = 'running';
        }
      }
    }

    function requestUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    // Pause animation when hero leaves viewport to conserve GPU & battery
    const heroObserver = new IntersectionObserver(function (entries) {
      isHeroVisible = entries[0].isIntersecting;
      requestUpdate();
      const marqueeTrack = document.querySelector('.marquee-track');
      if (marqueeTrack) {
        marqueeTrack.style.animationPlayState = isHeroVisible ? 'running' : 'paused';
      }
    }, { threshold: 0 });

    heroObserver.observe(hero);
    update();
  }

  // ---------------------------------------------------------------------------
  // 12. HORIZONTAL RAIL LOGIC (Scroll Trap Fix + Arrow Keys + Prev/Next)
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

    // Bug 7a Fix: Do NOT trap vertical wheel event at rail edges or when scrolling vertically
    scroller.addEventListener('wheel', function (event) {
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      if (maxScroll <= 0 || !event.deltaY) return;

      // Ignore if user is holding modifier keys (Shift, Ctrl, Alt)
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

      // Ignore if already moving horizontally
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const isScrollingDown = event.deltaY > 0;
      const isScrollingUp = event.deltaY < 0;
      const atStart = scroller.scrollLeft <= 2;
      const atEnd = scroller.scrollLeft >= maxScroll - 2;

      // At edges, pass event through to window scroll!
      if ((isScrollingDown && atEnd) || (isScrollingUp && atStart)) {
        return;
      }

      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      target = clamp(target + event.deltaY * multiplier, 0, maxScroll);
      if (!frame) frame = requestAnimationFrame(animate);
    }, { passive: false });

    scroller.addEventListener('scroll', function () {
      if (!frame) target = scroller.scrollLeft;
    }, { passive: true });

    // Arrow key navigation when scroller or child has focus
    scroller.addEventListener('keydown', function (event) {
      const step = 320;
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        target = clamp(scroller.scrollLeft + step, 0, maxScroll);
        if (!frame) frame = requestAnimationFrame(animate);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        target = clamp(scroller.scrollLeft - step, 0, maxScroll);
        if (!frame) frame = requestAnimationFrame(animate);
      }
    });

    // Arrow Button Controls
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        const step = scroller.clientWidth * 0.75;
        scroller.scrollBy({ left: -step, behavior: isReducedMotion ? 'auto' : 'smooth' });
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        const step = scroller.clientWidth * 0.75;
        scroller.scrollBy({ left: step, behavior: isReducedMotion ? 'auto' : 'smooth' });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 13. ACHIEVEMENTS CARDS INTERACTION (Mouse Hover vs Touch Tap)
  // ---------------------------------------------------------------------------
  function setUpHighlightCards() {
    const cards = [...document.querySelectorAll('.highlights-card')];
    if (cards.length === 0) return;

    const canHover = window.matchMedia('(hover: hover)').matches;

    function setExpanded(card, expanded) {
      card.classList.toggle('is-expanded', expanded);
      card.setAttribute('aria-expanded', String(expanded));
    }

    cards.forEach(function (card) {
      // Hover only for genuine mouse pointers
      if (canHover) {
        card.addEventListener('mouseenter', function () {
          setExpanded(card, true);
        });
        card.addEventListener('mouseleave', function () {
          setExpanded(card, false);
        });
      }

      // Keyboard focus
      card.addEventListener('focus', function () {
        setExpanded(card, true);
      });
      card.addEventListener('blur', function () {
        setExpanded(card, false);
      });

      // Pointer/Click: toggle cleanly without conflict
      card.addEventListener('click', function (event) {
        // Prevent immediate toggle-close on mouse click if hover opened it
        if (event.pointerType === 'mouse' && canHover) {
          return;
        }
        const isCurrentOpen = card.classList.contains('is-expanded');
        cards.forEach(function (c) {
          if (c !== card) setExpanded(c, false);
        });
        setExpanded(card, !isCurrentOpen);
      });
    });

    document.addEventListener('pointerdown', function (event) {
      if (!event.target.closest('.highlights-card')) {
        cards.forEach(function (c) {
          setExpanded(c, false);
        });
      }
    });
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
    makeLogo();
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
