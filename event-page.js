(function () {
  'use strict';

  var DATA = window.BLITZ_DATA || { events: [] };
  var events = Array.isArray(DATA.events) ? DATA.events : [];
  var grid = document.querySelector('#event-launchpad-grid');
  var detail = document.querySelector('#event-page-detail');

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>'"]/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char];
      });
  }

  function parseDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return 0;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  }

  function formatDate(value) {
    var date = new Date(parseDate(value));
    if (!parseDate(value)) return String(value || 'Date to be announced');
    return date.getDate() + ' ' + date.toLocaleString('en', { month: 'short' }) + ' ' + date.getFullYear();
  }

  function selectedId() {
    var id = new URLSearchParams(window.location.search).get('event');
    return id || (events[0] && events[0].id);
  }

  function eventById(id) {
    return events.find(function (event) { return event.id === id; });
  }

  function setRoute(id) {
    var url = new URL(window.location.href);
    url.searchParams.set('event', id);
    window.history.pushState({ eventId: id }, '', url);
  }

  function listMarkup(selected) {
    return events.slice().sort(function (a, b) { return parseDate(b.date) - parseDate(a.date); }).map(function (event, index) {
      var active = selected && event.id === selected.id;
      return '<a class="event-launchpad-tile' + (active ? ' is-selected' : '') + '" href="event.html?event=' +
        encodeURIComponent(event.id) + '" data-event-id="' + escapeHtml(event.id) + '"' +
        (active ? ' aria-current="page"' : '') + '>' +
        '<span class="event-launchpad-icon" aria-hidden="true">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<span class="event-launchpad-tile-title">' + escapeHtml(event.title) + '</span>' +
        '<span class="event-launchpad-tile-meta">' + escapeHtml(event.category || 'Event') + '</span>' +
        '</a>';
    }).join('');
  }

  function blockList(title, items, modifier) {
    if (!Array.isArray(items) || items.length === 0) return '';
    var className = 'event-page-block' + (modifier ? ' event-page-block--' + modifier : '');
    return '<section class="' + className + '"><h3>' + escapeHtml(title) + '</h3><ul>' +
      items.map(function (item) {
        if (typeof item === 'string') return '<li>' + escapeHtml(item) + '</li>';
        return '<li><strong>' + escapeHtml(item.position || item.title || 'Result') + '</strong>' +
          (item.names ? ' — ' + escapeHtml(item.names.join(', ')) : '') + '</li>';
      }).join('') + '</ul></section>';
  }

  function renderDetail(event) {
    if (!event) {
      detail.innerHTML = '<div class="event-page-empty"><h2>Event not found</h2><p>Select an event from the Launchpad to continue.</p></div>';
      return;
    }

    var speakers = Array.isArray(event.speakers) ? event.speakers : (event.speaker ? [event.speaker] : []);
    var sessions = Array.isArray(event.sessions) ? event.sessions : [];
    var sessionMarkup = sessions.length
      ? '<section class="event-page-block"><h3>Sessions</h3><div class="event-page-session-grid">' +
        sessions.map(function (session) {
          return '<article><h4>' + escapeHtml(session.title) + '</h4><p>' +
            escapeHtml(session.summary || '') + '</p>' +
            (session.speakers ? '<small>' + escapeHtml(session.speakers.join(', ')) + '</small>' : '') +
            '</article>';
        }).join('') + '</div></section>'
      : '';

    detail.innerHTML =
      '<article class="event-page-detail-card">' +
        '<div class="event-page-detail-kicker"><span>' + escapeHtml(event.layout || 'event') + '</span><span>' +
          escapeHtml(formatDate(event.date)) + '</span></div>' +
        '<h2>' + escapeHtml(event.title) + '</h2>' +
        '<p class="event-page-summary">' + escapeHtml(event.description || '') + '</p>' +
        '<dl class="event-page-meta">' +
          '<div><dt>Location</dt><dd>' + escapeHtml(event.location || 'To be announced') + '</dd></div>' +
          '<div><dt>Format</dt><dd>' + escapeHtml(event.format || event.category || 'Event') + '</dd></div>' +
          '<div><dt>Time</dt><dd>' + escapeHtml(event.time || 'To be announced') + '</dd></div>' +
          '<div><dt>Speaker(s)</dt><dd>' + escapeHtml(speakers.join(', ') || 'To be announced') + '</dd></div>' +
        '</dl>' +
        blockList('Key points', event.keyPoints) +
        blockList('Winners', event.winners, 'winners') +
        blockList('Competition highlights', event.competitionSections) +
        sessionMarkup +
        (event.additionalInfo ? '<section class="event-page-block"><h3>Notes</h3><p>' + escapeHtml(event.additionalInfo) + '</p></section>' : '') +
      '</article>';
  }

  function render() {
    var event = eventById(selectedId());
    grid.innerHTML = listMarkup(event);
    if (!event) {
      detail.innerHTML = '<div class="event-page-empty"><h2>Event not found</h2><p>The requested event could not be located. Select another event from the Launchpad.</p></div>';
      return;
    }
    renderDetail(event);
    grid.querySelectorAll('[data-event-id]').forEach(function (tile) {
      tile.addEventListener('click', function (clickEvent) {
        clickEvent.preventDefault();
        setRoute(tile.getAttribute('data-event-id'));
        render();
      });
    });
  }

  window.addEventListener('popstate', render);
  render();
}());
