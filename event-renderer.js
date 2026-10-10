/**
 * Shared event-detail markup for the homepage preview and Events Launchpad.
 * Loaded before either page-specific script; it has no dependencies.
 */
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

  function mediaMarkup(event) {
    var image = String(event.image || event.imageUrl || '').trim();
    var imageUrl = image && !/^[a-z][a-z0-9+.-]*:/i.test(image) && image.indexOf('//') !== 0
      ? escapeHtml(image) : '';
    var imageMarkup = imageUrl
      ? '<figure class="event-detail-media"><img src="' + imageUrl + '" alt="' +
        escapeHtml(event.imageAlt || event.title || 'Event image') + '" loading="lazy"></figure>' : '';
    var links = Array.isArray(event.links) ? event.links.map(function (link) {
      var href = safeUrl(link && (link.url || link.href));
      var label = link && (link.label || link.title);
      return href && label ? '<li><a href="' + href + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(label) + '</a></li>' : '';
    }).filter(Boolean).join('') : '';
    var linksMarkup = links ? '<div class="event-detail-links"><h4>Links</h4><ul>' + links + '</ul></div>' : '';
    return imageMarkup + linksMarkup;
  }

  function listItems(items, renderItem) {
    if (!Array.isArray(items) || items.length === 0) return '';
    var content = items.map(renderItem).filter(Boolean).join('');
    return content ? '<ul>' + content + '</ul>' : '';
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
      event.additionalInfo ? block('Notes', '<p>' + escapeHtml(event.additionalInfo) + '</p>', options) : ''
    ].join('');
    var media = mediaMarkup(event);
    var descriptionMarkup = event.description
      ? '<p class="' + (mode === 'homepage' ? 'event-detail-summary' : 'event-page-summary') + '">' +
        escapeHtml(event.description) + '</p>'
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
          media + descriptionMarkup +
          '<dl class="event-detail-meta">' + meta + '</dl>' + detailBlocks +
        '</div></article>';
    }

    return '<article class="event-page-detail-card event-page-detail-card--' + escapeHtml(layout) + '">' +
      '<div class="event-page-detail-kicker"><span>' + escapeHtml(layout) + '</span>' + kicker + '</div>' +
      '<h2>' + escapeHtml(event.title) + '</h2>' +
      media + descriptionMarkup +
      '<dl class="event-page-meta">' + meta + '</dl>' + detailBlocks +
      '</article>';
  }

  window.BLITZ_EVENT_RENDERER = {
    render: renderEvent,
    escapeHtml: escapeHtml,
    formatDate: formatDate
  };
}(window));
