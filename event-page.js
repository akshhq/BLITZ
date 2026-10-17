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

  function formatMonthYear(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return '';
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1) return '';
    return date.toLocaleString('en', { month: 'short' }) + ' ' + match[1];
  }

  var windowState = { minimized: false, maximized: false };

  function selectedId() {
    return new URLSearchParams(window.location.search).get('event');
  }

  function eventById(id) {
    return events.find(function (event) { return event.id === id; });
  }

  function setRoute(id) {
    var url = new URL(window.location.href);
    if (id) url.searchParams.set('event', id);
    else url.searchParams.delete('event');
    window.history.pushState({ eventId: id }, '', url);
  }

  function isMobile() {
    return window.matchMedia('(max-width: 899px)').matches;
  }

  function closeWindow(updateRoute) {
    windowState.minimized = false;
    windowState.maximized = false;
    detail.hidden = true;
    detail.classList.remove('is-minimized', 'is-maximized');
    document.documentElement.classList.remove('modal-open');
    if (updateRoute) setRoute('');
    var dock = document.querySelector('#event-window-dock');
    if (dock) dock.hidden = true;
  }

  function updateWindowState() {
    detail.classList.toggle('is-minimized', windowState.minimized);
    detail.classList.toggle('is-maximized', windowState.maximized);
    var minimize = detail.querySelector('[data-window-action="minimize"]');
    var maximize = detail.querySelector('[data-window-action="maximize"]');
    if (minimize) minimize.setAttribute('aria-label', windowState.minimized ? 'Restore event window' : 'Minimize event window');
    if (maximize) maximize.setAttribute('aria-label', windowState.maximized ? 'Restore event window size' : 'Maximize event window');
    var dock = document.querySelector('#event-window-dock');
    if (dock) {
      dock.hidden = !windowState.minimized;
      dock.innerHTML = windowState.minimized
        ? '<button type="button" class="event-window-dock-item" data-window-action="restore">' +
          '<span class="event-window-dock-dot" aria-hidden="true"></span><span>' +
          escapeHtml((eventById(selectedId()) || {}).title || 'Event') + '</span></button>'
        : '';
    }
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
    return sortEventsByDate(events).map(function (event, index) {
      var active = selected && event.id === selected.id;
      var layout = ['workshop', 'competition', 'festival', 'speaker'].indexOf(event.layout) >= 0
        ? event.layout : 'event';
      return '<a class="event-launchpad-tile' + (active ? ' is-selected' : '') + '" href="event.html?event=' +
        encodeURIComponent(event.id) + '" data-event-id="' + escapeHtml(event.id) + '"' +
        ' aria-label="' + escapeHtml(event.title) + '"' +
        ' title="' + escapeHtml(event.title) + '"' +
        (active ? ' aria-current="true"' : '') + '>' +
        '<span class="event-launchpad-icon event-launchpad-icon--' + layout + '" aria-hidden="true">' +
        '<svg viewBox="0 0 48 48" focusable="false"><rect x="8" y="9" width="32" height="31" rx="6"></rect><path d="M14 6v8M34 6v8M8 18h32M15 25h6M27 25h6M15 32h6M27 32h6"></path></svg>' +
        '</span>' +
        '<span class="event-launchpad-tile-title">' + escapeHtml(event.title) + '</span>' +
        (event.date ? '<span class="event-launchpad-tile-date">' + escapeHtml(formatMonthYear(event.date)) + '</span>' : '') +
        '</a>';
    }).join('');
  }

  function renderDetail(event) {
    if (!event) {
      updatePageMetadata(null);
      closeWindow(false);
      return;
    }
    updatePageMetadata(event);
    detail.innerHTML = '<div class="event-desktop-window" role="dialog" aria-modal="true" aria-labelledby="event-window-title">' +
      '<header class="event-window-header">' +
      '<div class="event-window-controls" aria-label="Window controls">' +
      '<button type="button" class="event-window-control event-window-control--close" data-window-action="close" aria-label="Close event window" title="Close"></button>' +
      '<button type="button" class="event-window-control event-window-control--minimize" data-window-action="minimize" aria-label="Minimize event window" title="Minimize"></button>' +
      '<button type="button" class="event-window-control event-window-control--maximize" data-window-action="maximize" aria-label="Maximize event window" title="Maximize"></button>' +
      '</div><h2 id="event-window-title">' + escapeHtml(event.title) + '</h2><span class="event-window-status">BLITZ EVENT DESK</span></header>' +
      '<div class="event-window-body">' + window.BLITZ_EVENT_RENDERER.render(event, 'launchpad') + '</div></div>';
    detail.hidden = false;
    document.documentElement.classList.add('modal-open');
    windowState.minimized = false;
    windowState.maximized = false;
    updateWindowState();
    detail.querySelectorAll('[data-window-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        var action = button.getAttribute('data-window-action');
        if (action === 'close') closeWindow(true);
        if (action === 'minimize') { windowState.minimized = true; updateWindowState(); }
        if (action === 'maximize') { windowState.maximized = !windowState.maximized; updateWindowState(); }
      });
    });
    var dock = document.querySelector('#event-window-dock');
    if (dock) dock.onclick = function () { windowState.minimized = false; updateWindowState(); };
    detail.onclick = function (clickEvent) {
      if (clickEvent.target === detail && isMobile()) closeWindow(true);
    };
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
      closeWindow(false);
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
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !detail.hidden) closeWindow(true);
  });
  window.addEventListener('resize', function () {
    if (isMobile() && !detail.hidden) windowState.maximized = false;
    updateWindowState();
  });
  render();
  if (window.BLITZ_LIVE) window.BLITZ_LIVE.onChange(render);
}());
