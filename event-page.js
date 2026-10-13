(function () {
  'use strict';

  var DATA = window.BLITZ_DATA || { events: [] };
  var events = [];
  function loadEvents() {
    events = Array.isArray(window.BLITZ_DATA && window.BLITZ_DATA.events) ? window.BLITZ_DATA.events : [];
  }
  var grid = document.querySelector('#event-launchpad-grid');
  var detail = document.querySelector('#event-page-detail');

  function escapeHtml(value) {
    return window.BLITZ_EVENT_RENDERER.escapeHtml(value);
  }

  function parseDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return 0;
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])) return 0;
    return date.getTime();
  }
  function sortEventsByDate(items) {
    return (Array.isArray(items) ? items : []).map(function (event, index) {
      var parsedDate = parseDate(event && event.date);
      return { event: event, index: index, date: parsedDate, hasDate: parsedDate !== 0 };
    }).sort(function (a, b) {
      if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
      if (a.date !== b.date) return b.date - a.date;
      return a.index - b.index;
    }).map(function (entry) {
      return entry.event;
    });
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

  function setMetaContent(selector, value) {
    var element = document.querySelector(selector);
    if (element && value) element.setAttribute('content', value);
  }

  function updatePageMetadata(event) {
    var baseTitle = 'Events | BLITZ Computer Science Society';
    var baseDescription = 'Explore BLITZ events, workshops, competitions, speaker sessions, and technical festivals.';
    var title = event && event.title ? event.title + ' | BLITZ Events' : baseTitle;
    var description = event && event.description ? event.description : baseDescription;
    var canonical = document.querySelector('link[rel="canonical"]');
    var baseUrl = canonical ? canonical.href : window.location.href.split('?')[0];
    var selectedUrl = event && event.id ? baseUrl + '?event=' + encodeURIComponent(event.id) : baseUrl;

    document.title = title;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:url"]', selectedUrl);
    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', description);
  }

  function listMarkup(selected) {
    return sortEventsByDate(events).map(function (event) {
      var active = selected && event.id === selected.id;
      return '<a class="event-launchpad-tile' + (active ? ' is-selected' : '') + '" href="event.html?event=' +
        encodeURIComponent(event.id) + '" data-event-id="' + escapeHtml(event.id) + '"' +
        ' aria-label="' + escapeHtml(event.title) + '"' +
        ' title="' + escapeHtml(event.title) + '"' +
        (active ? ' aria-current="true"' : '') + '>' +
        '<span class="event-launchpad-tile-title">' + escapeHtml(event.title) + '</span>' +
        '</a>';
    }).join('');
  }

  function renderDetail(event) {
    if (!event) {
      updatePageMetadata(null);
      detail.innerHTML = '<div class="event-page-empty"><h2>Event not found</h2><p>Select an event from the Launchpad to continue.</p></div>';
      return;
    }
    updatePageMetadata(event);
    detail.innerHTML = window.BLITZ_EVENT_RENDERER.render(event, 'launchpad');
  }

  function render() {
    loadEvents();
    if (events.length === 0) {
      updatePageMetadata(null);
      grid.innerHTML = '<div class="event-page-empty"><h2>No events published</h2><p>Check back soon for the next BLITZ event.</p></div>';
      detail.innerHTML = '';
      return;
    }
    var event = eventById(selectedId());
    grid.innerHTML = listMarkup(event);
    if (!event) {
      updatePageMetadata(null);
      detail.innerHTML = '<div class="event-page-empty"><h2>Event not found</h2><p>The requested event could not be located. Select another event from the Launchpad.</p></div>';
      return;
    }
    renderDetail(event);
    grid.querySelectorAll('[data-event-id]').forEach(function (tile) {
      tile.addEventListener('click', function (clickEvent) {
        clickEvent.preventDefault();
        setRoute(tile.getAttribute('data-event-id'));
        render();
        if (window.matchMedia('(max-width: 899px)').matches) {
          detail.setAttribute('tabindex', '-1');
          detail.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          detail.focus({ preventScroll: true });
        }
      });
    });
  }

  window.addEventListener('popstate', render);
  render();
  if (window.BLITZ_LIVE) window.BLITZ_LIVE.onChange(render);
}());
