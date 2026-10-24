
(function (window) {
  'use strict';

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>'"]/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char];
      });
  }

  function parseDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return '';
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])) return '';
    return date;
  }

  function formatDate(value) {
    var date = parseDate(value);
    return date ? date.getDate() + ' ' + date.toLocaleString('en', { month: 'short' }) + ' ' + date.getFullYear() : '';
  }

  function speakersFor(event) {
    return Array.isArray(event.speakers) ? event.speakers :
      (event.speaker ? [event.speaker] : []);
  }

  function safeUrl(value) {
    var url = String(value || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(url) ? escapeHtml(url) : '';
  }

  function safeDocumentUrl(value) {
    var url = String(value || '').trim();
    if (/^https?:\/\//i.test(url)) return escapeHtml(url);
    if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.indexOf('//') === 0 ||
      url.indexOf('..') >= 0 || /[\s"'<>]/.test(url)) return '';
    return escapeHtml(url);
  }

  function brochureMarkup(event, mode) {
    var brochure = event && event.brochure;
    var url = safeDocumentUrl(brochure);
    if (!url) return '';
    var label = 'View brochure';
    var title = 'Event brochure';
    var prefix = mode === 'homepage' ? 'event-detail' : 'event-page';
    return '<section class="' + prefix + '-brochure" data-brochure>' +
      '<div class="' + prefix + '-brochure-heading"><h4>' + escapeHtml(title) + '</h4>' +
      '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a></div>' +
      '<a class="' + prefix + '-brochure-preview" href="' + url + '" target="_blank" rel="noopener noreferrer">' +
      '<object data="' + url + '" type="application/pdf" aria-label="' + escapeHtml(title) + '" onerror="this.closest(\'[data-brochure]\').remove()">' +
      '<span>Open the brochure to view it.</span></object></a>' +
      '<p class="' + prefix + '-brochure-actions"><a href="' + url + '" target="_blank" rel="noopener noreferrer">Open or download original</a></p>' +
      '</section>';
  }

  function mediaMarkup(event) {
    // An event can have several images. One image renders exactly as before; two or more become a carousel
    // inside the same image area. Each carousel only ever contains this event's own images.
    var rawImages = Array.isArray(event.images) && event.images.length
      ? event.images
      : [{ src: event.image || event.imageUrl || '', alt: event.imageAlt }];
    var safeImages = rawImages.map(function (item) {
      var image = String(item && (item.src || item.image) || '').trim();
      var ok = image && (/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)[^\s"'<>]+$/i.test(image) ||
        (!/^[a-z][a-z0-9+.-]*:/i.test(image) && image.indexOf('//') !== 0));
      return ok ? { src: escapeHtml(image), alt: escapeHtml((item && item.alt) || event.imageAlt || event.title || 'Event image') } : null;
    }).filter(Boolean);
    var imageMarkup = '';
    if (safeImages.length === 1) {
      imageMarkup = '<figure class="event-detail-media"><img src="' + safeImages[0].src + '" alt="' + safeImages[0].alt + '" loading="lazy"></figure>';
    } else if (safeImages.length > 1) {
      var total = safeImages.length;
      imageMarkup = '<figure class="event-detail-media event-carousel" data-carousel data-index="0" data-count="' + total + '"' +
        ' role="group" aria-roledescription="carousel" aria-label="' + escapeHtml('Images from ' + (event.title || 'this event')) + '">' +
        '<div class="ec-track" tabindex="0" aria-live="polite">' +
        safeImages.map(function (img, i) {
          return '<div class="ec-slide" role="group" aria-roledescription="slide" aria-label="Image ' + (i + 1) + ' of ' + total + '">' +
            '<img src="' + img.src + '" alt="' + img.alt + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" decoding="async" draggable="false"></div>';
        }).join('') +
        '</div>' +
        '<button type="button" class="ec-arrow ec-prev" aria-label="Previous image"><span aria-hidden="true"></span></button>' +
        '<button type="button" class="ec-arrow ec-next" aria-label="Next image"><span aria-hidden="true"></span></button>' +
        '<div class="ec-dots" aria-hidden="true">' + safeImages.map(function (img, i) { return '<i' + (i === 0 ? ' class="is-active"' : '') + '></i>'; }).join('') + '</div>' +
        '</figure>';
    }
    var links = Array.isArray(event.links) ? event.links.map(function (link) {
      var href = safeUrl(link && (link.url || link.href));
      var label = link && (link.label || link.title);
      return href && label ? '<li><a href="' + href + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(label) + '</a></li>' : '';
    }).filter(Boolean).join('') : '';
    var linksMarkup = links ? '<div class="event-detail-links"><h4>Links</h4><ul>' + links + '</ul></div>' : '';
    return imageMarkup + linksMarkup;
  }

  function logoMarkup(event, mode) {
    var logo = String(event && event.logo || '').trim();
    if (!logo) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(logo) && !/^(https?:\/\/|blob:)/i.test(logo)) return '';
    var url = escapeHtml(logo);
    var prefix = mode === 'homepage' ? 'event-detail' : 'event-page';
    return '<figure class="' + prefix + '-logo"><img src="' + url + '" alt="' +
      escapeHtml((event.title || 'Event') + ' logo') + '" loading="lazy"></figure>';
  }

  function listItems(items, renderItem) {
    if (!Array.isArray(items) || items.length === 0) return '';
    var content = items.map(renderItem).filter(Boolean).join('');
    return content ? '<ul>' + content + '</ul>' : '';
  }

  function detailItem(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    return item.title || item.name || item.label || item.position || item.summary || '';
  }

  function renderTemplateDetails(event, options) {
    var details = event && event.event_details;
    if (!details || typeof details !== 'object') return '';
    var labels = {
      objectives: 'Objectives',
      highlights: 'Highlights',
      activities: 'Activities',
      organizers: 'Organizers',
      faculty: 'Faculty',
      guests: 'Guests',
      judges: 'Judges',
      agenda: 'Agenda',
      teams: 'Teams',
      results: 'Results'
    };
    return Object.keys(labels).map(function (key) {
      var values = Array.isArray(details[key]) ? details[key].map(detailItem).filter(Boolean) : [];
      return values.length ? block(labels[key], listItems(values, function (value) {
        return '<li>' + escapeHtml(value) + '</li>';
      }), options) : '';
    }).join('');
  }

  function block(title, content, options) {
    if (!content) return '';
    var prefix = options.prefix;
    var heading = options.heading || 'h3';
    return '<section class="' + prefix + '-block' + (options.modifier ? ' ' + prefix + '-block--' + options.modifier : '') + '">' +
      '<' + heading + '>' + escapeHtml(title) + '</' + heading + '>' + content + '</section>';
  }

  function renderSessions(event, options) {
    if (!Array.isArray(event.sessions) || event.sessions.length === 0) return '';
    var prefix = options.prefix;
    var content = event.sessions.map(function (session) {
      if (!session || !session.title) return '';
      var sessionSpeakers = Array.isArray(session.speakers) ? session.speakers.filter(Boolean).join(', ') : '';
      var speakerMarkup = sessionSpeakers ? '<small>' + escapeHtml(sessionSpeakers) + '</small>' : '';
      var summaryMarkup = session.summary ? '<p>' + escapeHtml(session.summary) + '</p>' : '';
      return '<article class="' + prefix + '-session"><' + (options.heading === 'h4' ? 'h5' : 'h4') + '>' +
        escapeHtml(session.title) + '</' + (options.heading === 'h4' ? 'h5' : 'h4') + '>' +
        summaryMarkup + speakerMarkup + '</article>';
    }).filter(Boolean).join('');
    if (!content) return '';
    var listClass = prefix === 'event-page' ? 'event-page-session-grid' : 'event-detail-session-list';
    return block('Sessions', '<div class="' + listClass + '">' + content + '</div>', options);
  }

  function renderEvent(event, mode) {
    var options = mode === 'homepage'
      ? { prefix: 'event-detail', heading: 'h4' }
      : { prefix: 'event-page', heading: 'h3' };
    var prefix = options.prefix;
    var layout = ['workshop', 'competition', 'festival', 'speaker'].indexOf(event.layout) >= 0
      ? event.layout : 'event';
    var speakers = speakersFor(event).filter(Boolean);
    var date = formatDate(event.date);
    var meta = [
      date ? '<div><dt>Date</dt><dd>' + escapeHtml(date) + '</dd></div>' : '',
      event.location ? '<div><dt>Location</dt><dd>' + escapeHtml(event.location) + '</dd></div>' : '',
      (event.format || event.category) ? '<div><dt>Format</dt><dd>' + escapeHtml(event.format || event.category) + '</dd></div>' : '',
      event.time ? '<div><dt>Time</dt><dd>' + escapeHtml(event.time) + '</dd></div>' : '',
      speakers.length ? '<div><dt>Speaker(s)</dt><dd>' + escapeHtml(speakers.join(', ')) + '</dd></div>' : ''
    ].filter(Boolean).join('');
    var keyPoints = listItems(event.keyPoints, function (point) {
      return point ? '<li>' + escapeHtml(point) + '</li>' : '';
    });
    var winners = listItems(event.winners, function (winner) {
      if (!winner || (!winner.position && !winner.title && !Array.isArray(winner.names))) return '';
      var names = Array.isArray(winner.names) && winner.names.length ? ' — ' + escapeHtml(winner.names.join(', ')) : '';
      return '<li><strong>' + escapeHtml(winner.position || winner.title || 'Result') + '</strong>' + names + '</li>';
    });
    var competitions = listItems(event.competitionSections, function (section) {
      if (!section || !section.title) return '';
      return '<li><strong>' + escapeHtml(section.title) + '</strong>' +
        (section.type ? ' — ' + escapeHtml(section.type) : '') + '</li>';
    });
    var layoutTitle = {
      workshop: 'Workshop highlights',
      competition: 'Competition outcomes',
      festival: 'Festival overview',
      speaker: 'Speaker session',
      event: 'Event details'
    }[layout];
    var detailBlocks = [
      block(layoutTitle, keyPoints, options),
      layout === 'competition' ? block('Winners', winners, { prefix: prefix, heading: options.heading, modifier: 'winners' }) : '',
      layout === 'festival' ? renderSessions(event, options) : '',
      layout === 'festival' || layout === 'competition' ? block('Competition highlights', competitions, options) : '',
      layout !== 'festival' ? renderSessions(event, options) : '',
      renderTemplateDetails(event, options),
      event.additionalInfo ? block('Notes', '<p>' + escapeHtml(event.additionalInfo) + '</p>', options) : ''
    ].join('');
    var media = mediaMarkup(event);
    var descriptionMarkup = event.description
      ? '<p class="' + (mode === 'homepage' ? 'event-detail-summary' : 'event-page-summary') + '">' +
        escapeHtml(event.description) + '</p>'
      : '';
    var placeholderMarkup = event.placeholder
      ? '<div class="' + (mode === 'homepage' ? 'event-detail-placeholder' : 'event-page-placeholder') + '" role="note">' +
        '<span>Event details reserved</span><p>Description, date and media will be added here.</p></div>'
      : '';
    var kicker = date ? '<span>' + escapeHtml(date) + '</span>' : '';
    var locationTag = event.location ? '<span class="' + prefix + '-tag">' + escapeHtml(event.location) + '</span>' : '';

    if (mode === 'homepage') {
      return '<article class="event-detail-card">' +
        '<div class="event-detail-header">' +
          '<p class="section-badge section-badge--dark">BLITZ / ' + escapeHtml((event.category || 'EVENT').toUpperCase()) + '</p>' +
          '<button type="button" class="event-detail-close" aria-label="Close event details">Close</button>' +
        '</div><div class="event-detail-body">' +
          '<div class="event-detail-topline">' + (kicker ? '<span class="event-detail-tag">' + kicker + '</span>' : '') + locationTag + '</div>' +
          '<h3>' + escapeHtml(event.title) + '</h3>' +
          logoMarkup(event, mode) + media + descriptionMarkup + placeholderMarkup + brochureMarkup(event, mode) +
          '<dl class="event-detail-meta">' + meta + '</dl>' + detailBlocks +
        '</div></article>';
    }

    return '<article class="event-page-detail-card event-page-detail-card--' + escapeHtml(layout) + '">' +
      '<div class="event-page-detail-kicker"><span>' + escapeHtml(layout) + '</span>' + kicker + '</div>' +
      '<h2>' + escapeHtml(event.title) + '</h2>' +
      logoMarkup(event, mode) + media + descriptionMarkup + placeholderMarkup + brochureMarkup(event, mode) +
      '<dl class="event-page-meta">' + meta + '</dl>' + detailBlocks +
      '</article>';
  }

  /* ---- carousel behaviour: one set of listeners; each carousel is scoped to its own element ---- */
  function carouselIndex(track) {
    return track.clientWidth ? Math.max(0, Math.min(Math.round(track.scrollLeft / track.clientWidth), track.children.length - 1)) : 0;
  }
  function syncCarousel(carousel) {
    var track = carousel.querySelector('.ec-track');
    if (!track) return;
    var index = carouselIndex(track);
    var last = track.children.length - 1;
    carousel.setAttribute('data-index', String(index));
    if (index >= last) carousel.setAttribute('data-at-end', ''); else carousel.removeAttribute('data-at-end');
    [].forEach.call(carousel.querySelectorAll('.ec-dots i'), function (dot, i) { dot.classList.toggle('is-active', i === index); });
  }
  function goCarousel(carousel, delta) {
    var track = carousel.querySelector('.ec-track');
    if (!track) return;
    var target = Math.max(0, Math.min(carouselIndex(track) + delta, track.children.length - 1));
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left: target * track.clientWidth, behavior: calm ? 'auto' : 'smooth' });
    if (calm) syncCarousel(carousel);
  }
  if (typeof document !== 'undefined' && !window.__blitzCarouselReady) {
    window.__blitzCarouselReady = true;
    document.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('.ec-arrow');
      var carousel = button && button.closest('.event-carousel');
      if (!carousel) return;
      event.preventDefault();
      event.stopPropagation();                                           // never opens or closes the card
      goCarousel(carousel, button.classList.contains('ec-next') ? 1 : -1);
    });
    document.addEventListener('keydown', function (event) {
      var track = event.target.closest && event.target.closest('.ec-track');
      if (!track || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      goCarousel(track.closest('.event-carousel'), event.key === 'ArrowRight' ? 1 : -1);
    });
    var pending = null;
    document.addEventListener('scroll', function (event) {            // scroll does not bubble, so listen in the capture phase
      var track = event.target;
      if (!track || !track.classList || !track.classList.contains('ec-track')) return;
      var carousel = track.closest('.event-carousel');
      if (pending) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(function () { pending = null; syncCarousel(carousel); });
    }, true);
    window.addEventListener('resize', function () { [].forEach.call(document.querySelectorAll('.event-carousel'), syncCarousel); });
  }

  window.BLITZ_EVENT_RENDERER = {
    render: renderEvent,
    goCarousel: goCarousel,
    escapeHtml: escapeHtml,
    formatDate: formatDate
  };
}(window));
