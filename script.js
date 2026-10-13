

(function () {
  'use strict';
  const DATA = window.BLITZ_DATA || {
    announcements: [],
    events: [],
    team: [],
    gallery: [],
    collaborations: [],
    contact: {}
  };

  const root = document.documentElement;
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isReducedMotion = reducedMotionQuery.matches;

  function validateEventData(events) {
    const seen = new Set();
    const issues = [];
    (Array.isArray(events) ? events : []).forEach(function (event, index) {
      if (!event || typeof event !== 'object') {
        issues.push(`events[${index}] is not an object`);
        return;
      }
      if (!event.id || typeof event.id !== 'string') issues.push(`events[${index}] is missing a stable id`);
      if (seen.has(event.id)) issues.push(`duplicate event id: ${event.id}`);
      seen.add(event.id);
      if (!event.title || typeof event.title !== 'string') issues.push(`${event.id || `events[${index}]`} is missing a title`);
      if (event.date && !parseLocalDate(event.date)) issues.push(`${event.id || `events[${index}]`} has an invalid date`);
      if (!event.description || typeof event.description !== 'string') issues.push(`${event.id || `events[${index}]`} is missing a description`);
      if (!event.category || typeof event.category !== 'string') issues.push(`${event.id || `events[${index}]`} is missing a category`);
    });
    if (issues.length && typeof console !== 'undefined' && console.warn) {
      console.warn('[BLITZ] Event data requires verification:', issues);
    }
    return issues;
  }

  
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

  
  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
      return escapeHtml(trimmed);
    }
    return '#';
  }

  
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
  function sortEventsByDate(events) {
    return (Array.isArray(events) ? events : []).map(function (event, index) {
      const parsedDate = parseLocalDate(event && event.date);
      return { event: event, index: index, date: parsedDate ? parsedDate.getTime() : 0, hasDate: !!parsedDate };
    }).sort(function (a, b) {
      if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
      if (a.date !== b.date) return b.date - a.date;
      return a.index - b.index;
    }).map(function (entry) {
      return entry.event;
    });
  }

  
  function formatDate(isoString) {
    if (!isoString) return '';
    const d = parseLocalDate(isoString);
    if (!d) return String(isoString);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  }

  
  function readNavHeight() {
    const header = document.querySelector('.site-header');
    let height = parseFloat(getComputedStyle(root).getPropertyValue('--nav-height'));
    if (!isFinite(height)) height = header ? header.offsetHeight : 64;
    const safeTop = header ? parseFloat(getComputedStyle(header).paddingTop) || 0 : 0;
    return height + safeTop;
  }
  function setUpMarquee() {
    document.querySelectorAll('.marquee-group').forEach(function (group) {
      group.innerHTML = Array.from({ length: 4 }, function () {
        return '<span class="marquee-text">DEPARTMENT OF COMPUTER SCIENCE</span>';
      }).join('');
    });
  }
  let announcementsTeardown = null;

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
    if (announcementsTeardown) {
      announcementsTeardown();
      announcementsTeardown = null;
    }
    if (modal && modal.open) {
      modal.addEventListener('close', function () { renderAnnouncements(); }, { once: true });
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    let observer = null;
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
    if (toggleBtn) toggleBtn.disabled = false;

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

    
    function updateTicker(announce) {
      const current = items[index];
      track.innerHTML = `
        <button
          type="button"
          class="announcement-item-btn"
          data-id="${escapeHtml(current.id)}"
        >
          ${current.date ? `<span class="announcement-item-date">${escapeHtml(formatDate(current.date))}</span>` : ''}
          <span class="announcement-item-title">${escapeHtml(current.title)}</span>
          <span class="sr-only">(opens full details)</span>
          <span class="announcement-item-arrow" aria-hidden="true">&#8599;</span>
        </button>
      `;

      track.querySelector('.announcement-item-btn').addEventListener('click', function () {
        openModal(current);
      });
      if (announce && status) {
        status.textContent = `Announcement ${index + 1} of ${items.length}: ${current.title}${current.date ? ', ' + formatDate(current.date) : ''}`;
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
      toggleBtn.addEventListener('click', function () { setPaused(!state.paused); }, { signal });
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', function () { step(-1, true); setPaused(true); }, { signal });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { step(1, true); setPaused(true); }, { signal });
    }

    if (viewport) {
      viewport.addEventListener('mouseenter', function () { state.hovered = true; syncTicker(); }, { signal });
      viewport.addEventListener('mouseleave', function () { state.hovered = false; syncTicker(); }, { signal });
      viewport.addEventListener('focusin', function () { state.focused = true; syncTicker(); }, { signal });
      viewport.addEventListener('focusout', function () { state.focused = false; syncTicker(); }, { signal });
      let startX = 0;
      let startY = 0;
      viewport.addEventListener('touchstart', function (event) {
        const t = event.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
      }, { passive: true, signal });
      viewport.addEventListener('touchend', function (event) {
        const t = event.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          step(dx < 0 ? 1 : -1, true);
          setPaused(true);
        }
      }, { passive: true, signal });
    }
    if (section && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        state.onScreen = entries[0].isIntersecting;
        syncTicker();
      });
      observer.observe(section);
    }
    document.addEventListener('visibilitychange', syncTicker, { signal });
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
        dateEl.hidden = !item.date; // announcements may have no date
        if (item.date) dateEl.setAttribute('datetime', item.date); else dateEl.removeAttribute('datetime');
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

    if (modalClose) modalClose.addEventListener('click', closeModal, { signal });

    if (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeModal(); // tap on the backdrop
      }, { signal });
      modal.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeModal();
      }, { signal });
      modal.addEventListener('close', function () {
        if (state.modalOpen) afterClose();
      }, { signal });
    }

    announcementsTeardown = function () {
      controller.abort();
      if (timer) clearInterval(timer);
      if (observer) observer.disconnect();
    };

    updateTicker(false);
    syncTicker();
  }
  function renderEvents() {
    const container = document.querySelector('#events-stack');
    if (!container) return;

    const eventsList = sortEventsByDate(DATA.events).slice(0, 5);

    if (eventsList.length === 0) {
      container.innerHTML = '<p class="events-empty">No events scheduled at this time.</p>';
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    container.innerHTML = eventsList.map(function (event, index) {
      const eventDate = parseLocalDate(event.date);
      const isUpcoming = !!eventDate && eventDate.getTime() >= today.getTime();
      const badgeText = !eventDate ? 'DATE TBC' : (isUpcoming ? 'UPCOMING' : 'PAST');
      const badgeClass = !eventDate ? 'event-badge--pending' : (isUpcoming ? 'event-badge--upcoming' : 'event-badge--past');
      const titleId = `event-title-${escapeHtml(event.id || index)}`;
      const dateMarkup = eventDate
        ? `<div><dt>Date</dt><dd>${escapeHtml(formatDate(event.date))}</dd></div>`
        : '';
      const locationMarkup = event.location
        ? `<div><dt>Location</dt><dd>${escapeHtml(event.location)}</dd></div>`
        : '';

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
                ${dateMarkup}
                ${locationMarkup}
                <div>
                  <dt>Format</dt>
                  <dd>${escapeHtml(event.format || event.category)}</dd>
                </div>
              </dl>
              <div class="events-panel-actions">
                <a class="events-detail-btn" href="event.html?event=${encodeURIComponent(event.id || '')}">
                  View details
                </a>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');

    setUpStickyGuard();
  }

  function updateEventDetailRoute(eventId) {
    if (!window.history || !window.history.replaceState) return;
    const url = new URL(window.location.href);
    if (eventId) {
      url.searchParams.set('event', eventId);
      url.hash = '';
    } else {
      url.searchParams.delete('event');
    }
    window.history.replaceState({}, '', url);
  }

  function setMetaContent(selector, value) {
    const element = document.querySelector(selector);
    if (element && value) element.setAttribute('content', value);
  }

  function updateHomepageMetadata(event) {
    const baseTitle = 'BLITZ | Computer Science Society, Keshav Mahavidyalaya, DU';
    const baseDescription = 'BLITZ is the departmental society of Computer Science at Keshav Mahavidyalaya, University of Delhi.';
    const title = event && event.title ? `${event.title} | BLITZ` : baseTitle;
    const description = event && event.description ? event.description : baseDescription;
    const canonical = document.querySelector('link[rel="canonical"]');
    const pageUrl = canonical ? canonical.href : window.location.href.split('?')[0];

    document.title = title;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:url"]', pageUrl);
    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', description);
  }

  function renderEventDetail(eventId) {
    const panel = document.querySelector('#event-detail-content');
    const section = document.querySelector('#event-detail');
    if (!panel || !section) return;

    const event = (DATA.events || []).find(function (item) {
      return (item && item.id) === eventId;
    });

    if (!event) {
      updateHomepageMetadata(null);
      section.classList.add('is-visible');
      panel.innerHTML = `
        <div class="event-detail-card event-detail-card--empty">
          <div class="event-detail-header">
            <p class="section-badge section-badge--dark">BLITZ / EVENT DETAILS</p>
            <button type="button" class="event-detail-close" aria-label="Close event details">Close</button>
          </div>
          <div class="event-detail-body">
            <h3>Event not found</h3>
            <p>The requested event could not be located. Please choose an event from the list below.</p>
          </div>
        </div>
      `;
      panel.querySelector('.event-detail-close').addEventListener('click', function () {
        section.classList.remove('is-visible');
        updateEventDetailRoute('');
      });
      return;
    }

    updateHomepageMetadata(event);
    const sharedDetailMarkup = window.BLITZ_EVENT_RENDERER
      ? window.BLITZ_EVENT_RENDERER.render(event, 'homepage')
      : '';

    panel.innerHTML = sharedDetailMarkup;

    const closeBtn = panel.querySelector('.event-detail-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        section.classList.remove('is-visible');
        updateEventDetailRoute('');
      });
    }

    section.classList.add('is-visible');
  }

  function syncEventDetailFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event');
    if (eventId) {
      renderEventDetail(eventId);
    } else {
      updateHomepageMetadata(null);
      const detailSection = document.querySelector('#event-detail');
      if (detailSection) {
        detailSection.classList.remove('is-visible');
      }
    }
  }

  window.addEventListener('popstate', syncEventDetailFromUrl);

  
  let stickyGuardBound = false;
  let stickyFrame = null;
  let stickyLastWidth = -1;

  function evaluateStickyGuard() {
    stickyFrame = null;
    const panels = [...document.querySelectorAll('.events-panel')];
    const viewportHeight = window.innerHeight;
    panels.forEach(function (panel) {
      panel.classList.remove('is-tall');
    });
    panels.forEach(function (panel) {
      const stuckTop = parseFloat(getComputedStyle(panel).top) || 0;
      const tooTall = panel.offsetHeight > viewportHeight - stuckTop + 2;
      panel.classList.toggle('is-tall', tooTall);
    });
  }

  function scheduleStickyGuard() {
    if (stickyFrame) return;
    stickyFrame = requestAnimationFrame(evaluateStickyGuard);
  }

  function setUpStickyGuard() {
    if (!stickyGuardBound) {
      stickyGuardBound = true;
      window.addEventListener('resize', function () {
        if (window.innerWidth !== stickyLastWidth) {
          stickyLastWidth = window.innerWidth;
          scheduleStickyGuard();
        }
      });
      window.addEventListener('load', scheduleStickyGuard);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleStickyGuard);
    }
    stickyLastWidth = window.innerWidth;
    evaluateStickyGuard();
  }
  function renderTeam() {
    const container = document.querySelector('#team-content');
    if (!container) return;

    const tiers = [
      { key: 'faculty', label: 'Faculty & Convenor', shortLabel: 'FACULTY', gridClass: 'team-grid--faculty' },
      { key: 'core', label: 'Core Team', shortLabel: 'CORE TEAM', gridClass: 'team-grid--core' },
      { key: 'senior', label: 'Senior Executives', shortLabel: 'SENIOR EXECUTIVES', gridClass: 'team-grid--senior' },
      { key: 'junior', label: 'Junior Executives', shortLabel: 'JUNIOR EXECUTIVES', gridClass: 'team-grid--junior' },
      { key: 'volunteer', label: 'Volunteers', shortLabel: 'VOLUNTEERS', gridClass: 'team-grid--volunteer' }
    ];

    const defaultAvatar = 'assets/images/team/avatar-placeholder.svg';
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

      const cardsHtml = members.map(function (member, index) {
        const photo = safeAssetUrl(member.photo);
        const hasPhoto = !!photo;
        const altText = hasPhoto
          ? escapeHtml(member.position ? `${member.name}, ${member.position}` : member.name)
          : '';

        return `
          <article class="team-card team-card--${tier.key}" style="--member-index:${index}">
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
          </article>
        `;
      }).join('');

      return `
        <section class="team-tier team-tier--${tier.key} reveal-tier" aria-labelledby="team-tier-${tier.key}">
          <div class="team-tier-heading">
            <div class="team-tier-title-wrap"><span class="team-tier-kicker">${escapeHtml(tier.shortLabel)}</span><h3 id="team-tier-${tier.key}">${escapeHtml(tier.label)}</h3></div>
            <span class="team-tier-count" aria-label="${members.length} members">${String(members.length).padStart(2, '0')} <span>MEMBERS</span></span>
          </div>
          <div class="team-grid ${tier.gridClass}">
            ${cardsHtml}
          </div>
        </section>
      `;
    }).join('');
  }
  function renderGallery() {
    const track = document.querySelector('#gallery-track');
    if (!track) return;

    const galleryList = DATA.gallery || [];
    if (galleryList.length === 0) {
      track.innerHTML = '<p class="events-empty">Photographs will appear here following upcoming events.</p>';
      return;
    }

    track.innerHTML = galleryList.map(function (item, index) {
      const imageUrl = safeAssetUrl(item.image);
      const isIllustration = item.mediaType === 'illustration' || /\.svg(?:$|[?#])/i.test(String(item.image || ''));
      const imageMarkup = imageUrl
        ? `<img
              src="${imageUrl}"
              alt="${escapeHtml(item.alt || (isIllustration ? `Illustration representing ${item.title}` : item.title || 'Gallery image'))}"
              loading="lazy"
              decoding="async"
              width="800"
              height="600"
            />`
        : '<div class="gallery-image-fallback" role="img" aria-label="Gallery image unavailable">Image unavailable</div>';
      return `
        <figure class="gallery-item">
          <figcaption class="gallery-item-copy">
            <span class="gallery-item-number">${padZero(index + 1, 2)}</span>
            <strong class="gallery-item-title">${escapeHtml(item.title)}</strong>
            ${item.description ? `<small class="gallery-item-description">${escapeHtml(item.description)}</small>` : ''}
            <span class="gallery-item-kind">${isIllustration ? 'Illustration' : 'Event image'}</span>
          </figcaption>
          <div class="gallery-img-shell">
            ${imageMarkup}
          </div>
        </figure>
      `;
    }).join('');
  }
  function renderCollaborations() {
    const grid = document.querySelector('#collaborations-grid');
    if (!grid) return;

    const list = DATA.collaborations || [];
    if (list.length === 0) {
      grid.innerHTML = `
        <div class="collab-card collab-card--placeholder">
          <div class="collab-logo-box collab-logo-box--placeholder" aria-hidden="true"><span>01</span></div>
          <h3 class="collab-name">Campus collaborations</h3>
          <p class="collab-placeholder-copy">A space for confirmed society and department partnerships.</p>
          <span class="collab-type">Placeholder / awaiting confirmation</span>
        </div>
        <div class="collab-card collab-card--placeholder">
          <div class="collab-logo-box collab-logo-box--placeholder" aria-hidden="true"><span>02</span></div>
          <h3 class="collab-name">Developer communities</h3>
          <p class="collab-placeholder-copy">Future community connections will be published here after verification.</p>
          <span class="collab-type">Placeholder / awaiting confirmation</span>
        </div>
        <div class="collab-card collab-card--placeholder">
          <div class="collab-logo-box collab-logo-box--placeholder" aria-hidden="true"><span>03</span></div>
          <h3 class="collab-name">Open opportunities</h3>
          <p class="collab-placeholder-copy">Partner-led workshops, initiatives, and opportunities will appear here.</p>
          <span class="collab-type">Placeholder / awaiting confirmation</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = list.map(function (partner) {
      const destination = typeof partner.url === 'string' && /^https?:\/\//i.test(partner.url.trim())
        ? ` href="${safeUrl(partner.url)}" target="_blank" rel="noopener noreferrer"` : '';
      const tag = destination ? 'a' : 'div';
      return `
        <${tag}${destination} class="collab-card">
          <div class="collab-logo-box">
            ${partner.logo ? `<img src="${safeAssetUrl(partner.logo)}" alt="${escapeHtml(partner.name)} logo" loading="lazy" decoding="async" width="240" height="100" />` : '<span class="collab-logo-missing">Logo pending</span>'}
          </div>
          <h3 class="collab-name">${escapeHtml(partner.name)}</h3>
          <span class="collab-type">${escapeHtml(partner.type)}</span>
        </${tag}>
      `;
    }).join('');
  }
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
    document.addEventListener('click', function (event) {
      if (isOpen() && !header.contains(event.target)) {
        setOpen(false);
      }
    });
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
  function setUpHeroLogo() {
    const logo = document.querySelector('#transition-logo');
    const hero = document.querySelector('#home');
    const shell = document.querySelector('.hero-heading-shell');
    if (!logo || !hero) return;
    if (reducedMotionQuery.matches) {
      if (shell) shell.style.opacity = '1';
      logo.style.opacity = '1';
      logo.style.transform = 'none';
      return;
    }
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
      if (shell) shell.style.opacity = String(Math.max(0, 1 - progress * 4));

      if (progress >= 1) {
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
      if (window.innerWidth !== lastWidth) {
        measure();
        requestUpdate();
      }
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { measure(); requestUpdate(); }, 250);
    });
    window.addEventListener('load', function () { measure(); requestUpdate(); });
    const heroObserver = new IntersectionObserver(function (entries) {
      isHeroVisible = entries[0].isIntersecting;
      hero.classList.toggle('is-offscreen', !isHeroVisible);
      requestUpdate();
    }, { threshold: 0 });

    heroObserver.observe(hero);
    measure();
    update();
  }
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

    
    function cardStep() {
      const track = scroller.firstElementChild;
      const card = track && track.firstElementChild;
      if (!card) return scroller.clientWidth * 0.75;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    }

    function scrollByCards(direction) {
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      target = clamp(scroller.scrollLeft + direction * cardStep(), 0, maxScroll);
      scroller.scrollLeft = target;
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
  
  function refreshContent() {
    renderAnnouncements();
    renderEvents();
    syncEventDetailFromUrl();
    renderTeam();
    renderGallery();
    renderCollaborations();
    setUpReveals();
  }

  function init() {
    setUpMarquee();
    renderAnnouncements();
    renderEvents();
    syncEventDetailFromUrl();
    renderTeam();
    renderGallery();
    renderCollaborations();
    renderContact();

    setUpMenu();
    setUpActiveNavObserver();
    setUpHeroLogo();

    setUpHorizontalRail('#gallery-scroller', '#gallery-rail-prev', '#gallery-rail-next');
    setUpReveals();
    window.BLITZ_APP = { refresh: refreshContent };
    if (window.BLITZ_LIVE) window.BLITZ_LIVE.onChange(refreshContent);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
