(function () {
  'use strict';

  var R = window.BLITZ_EVENT_RENDERER;
  var events = [];
  var pagesEl = document.querySelector('#event-launchpad-pages');
  var dotsEl = document.querySelector('#lp-dots');
  var searchEl = document.querySelector('#lp-search');
  var clearEl = document.querySelector('#lp-search-clear');
  var winsEl = document.querySelector('#event-windows');
  var dockEl = document.querySelector('#lp-dock');
  var dockWinsEl = document.querySelector('#lp-dock-windows');
  var trashEl = document.querySelector('#lp-dock-trash');
  if (!R || !pagesEl || !winsEl) return;

  var wins = {};      // event id -> { id, el, minimized, maximized, title, layout }
  var order = [];     // stacking order, last = front
  var seq = 0;
  var query = '';

  var GLYPHS = {
    event: 'M8 11h32v28H8zM8 19h32M16 7v8M32 7v8M15 26h6M27 26h6M15 33h6M27 33h6',
    workshop: 'M18 17l-9 7 9 7M30 17l9 7-9 7M26 12l-4 24',
    competition: 'M16 9h16v11a8 8 0 01-16 0zM16 13H9v3a7 7 0 007 7M32 13h7v3a7 7 0 01-7 7M24 28v7M17 39h14',
    festival: 'M24 8l4.8 10.6L40 20l-8.4 7.8L34 39l-10-5.8L14 39l2.4-11.2L8 20l11.2-1.4z',
    speaker: 'M24 8a6 6 0 00-6 6v10a6 6 0 0012 0V14a6 6 0 00-6-6zM14 24a10 10 0 0020 0M24 34v6M18 40h12'
  };

  function esc(v) { return R.escapeHtml(v); }
  function loadEvents() {
    events = Array.isArray(window.BLITZ_DATA && window.BLITZ_DATA.events) ? window.BLITZ_DATA.events : [];
  }
  function isMobile() { return window.matchMedia('(max-width: 899px)').matches; }

  function parseDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return 0;
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return 0;
    return date.getTime();
  }
  function sortEventsByDate(items) {
    return (Array.isArray(items) ? items : []).map(function (event, index) {
      var d = parseDate(event && event.date);
      return { event: event, index: index, date: d, hasDate: d !== 0 };
    }).sort(function (a, b) {
      if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
      if (a.date !== b.date) return b.date - a.date;
      return a.index - b.index;
    }).map(function (entry) { return entry.event; });
  }
  function eventById(id) {
    for (var i = 0; i < events.length; i++) if (events[i].id === id) return events[i];
    return null;
  }
  function layoutOf(event) {
    return ['workshop', 'competition', 'festival', 'speaker'].indexOf(event.layout) >= 0 ? event.layout : 'event';
  }
  function iconHtml(event) {
    var layout = layoutOf(event);
    return '<span class="lp-icon lp-icon--' + layout + '" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><path d="' + GLYPHS[layout] + '"></path></svg></span>';
  }

  /* ---------- page metadata + route (reflect the front window) ---------- */
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
  function setRoute(id) {
    try {
      var url = new URL(window.location.href);
      if (id) url.searchParams.set('event', id); else url.searchParams.delete('event');
      window.history.replaceState(null, '', url);
    } catch (e) { /* ignore */ }
  }

  /* ---------- launchpad grid ---------- */
  function cols() {
    var w = window.innerWidth;
    return w >= 1100 ? 8 : w >= 860 ? 6 : w >= 560 ? 4 : 3;
  }
  function perPage() { return cols() * (window.innerWidth < 560 ? 4 : 3); }
  function visibleEvents() {
    var q = query.trim().toLowerCase();
    var list = sortEventsByDate(events);
    if (!q) return list;
    return list.filter(function (e) {
      return [e.title, e.category, e.location, e.format, e.date, e.description].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function tileHtml(event) {
    return '<a class="lp-tile' + (wins[event.id] ? ' is-open' : '') + '" role="listitem" href="event.html?event=' +
      encodeURIComponent(event.id) + '" data-event-id="' + esc(event.id) + '" aria-label="' + esc(event.title) + '" title="' + esc(event.title) + '">' +
      iconHtml(event) + '<span class="lp-tile-label">' + esc(event.title) + '</span></a>';
  }
  function renderGrid() {
    var list = visibleEvents();
    var per = perPage();
    var pages = [];
    for (var i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
    pagesEl.style.setProperty('--cols', cols());
    pagesEl.innerHTML = pages.map(function (page) {
      return '<div class="lp-page" role="list">' + page.map(tileHtml).join('') + '</div>';
    }).join('');
    dotsEl.hidden = pages.length < 2;
    dotsEl.innerHTML = pages.length < 2 ? '' : pages.map(function (_, n) {
      return '<button type="button" class="lp-dot" data-page="' + n + '" aria-label="Page ' + (n + 1) + '" aria-current="' + (n === 0) + '"></button>';
    }).join('');
  }
  function markTiles() {
    [].forEach.call(pagesEl.querySelectorAll('.lp-tile'), function (tile) {
      tile.classList.toggle('is-open', !!wins[tile.getAttribute('data-event-id')]);
    });
  }
  function syncDots() {
    var idx = Math.round(pagesEl.scrollLeft / Math.max(1, pagesEl.clientWidth));
    [].forEach.call(dotsEl.querySelectorAll('.lp-dot'), function (dot, n) {
      dot.setAttribute('aria-current', String(n === idx));
    });
  }

  /* ---------- windows ---------- */
  function topFront() {
    for (var i = order.length - 1; i >= 0; i--) if (!wins[order[i]].minimized) return order[i];
    return null;
  }
  function renderDock() {
    var ids = Object.keys(wins);
    dockEl.classList.toggle('has-windows', ids.length > 0);
    trashEl.disabled = ids.length === 0;
    var front = topFront();
    dockWinsEl.innerHTML = ids.map(function (id) {
      var w = wins[id];
      return '<button type="button" class="lp-dock-item' + (w.minimized ? ' is-minimized' : '') + (id === front ? ' is-front' : ' is-open') +
        '" data-dock-id="' + esc(id) + '" aria-label="' + esc(w.title) + '" title="' + esc(w.title) + '">' + w.icon + '</button>';
    }).join('');
  }
  function raise(id, focus) {
    var w = wins[id];
    if (!w) return;
    order = order.filter(function (k) { return k !== id; });
    order.push(id);
    order.forEach(function (k, i) {
      wins[k].el.style.zIndex = String(10 + i);
      wins[k].el.classList.toggle('is-front', k === id);
    });
    if (focus) w.el.focus({ preventScroll: true });
    setRoute(id);
    updatePageMetadata(eventById(id));
    renderDock();
  }
  function afterChange(refocusTile) {
    var front = topFront();
    if (front) raise(front, true);
    else {
      setRoute('');
      updatePageMetadata(null);
      renderDock();
      var tile = refocusTile && pagesEl.querySelector('[data-event-id="' + refocusTile + '"]');
      if (tile) tile.focus(); else searchEl.focus({ preventScroll: true });
    }
    markTiles();
  }
  function minimize(id) {
    var w = wins[id];
    if (!w || w.minimized) return;
    w.minimized = true;
    w.el.classList.add('is-minimized');
    w.el.inert = true;
    w.el.setAttribute('aria-hidden', 'true');
    afterChange(id);
  }
  function restore(id) {
    var w = wins[id];
    if (!w) return;
    w.minimized = false;
    w.el.classList.remove('is-minimized');
    w.el.inert = false;
    w.el.removeAttribute('aria-hidden');
    raise(id, true);
    markTiles();
  }
  function closeWin(id) {
    var w = wins[id];
    if (!w) return;
    w.el.remove();
    delete wins[id];
    order = order.filter(function (k) { return k !== id; });
    afterChange(id);
  }
  function closeAll() {
    Object.keys(wins).forEach(function (id) { wins[id].el.remove(); });
    wins = {};
    order = [];
    afterChange(null);
  }
  function windowInner(event, titleId) {
    return '<header class="lp-window-header"><div class="lp-window-controls" aria-label="Window controls">' +
      '<button type="button" class="lp-window-control lp-window-control--close" data-act="close" aria-label="Close event window" title="Close"></button>' +
      '<button type="button" class="lp-window-control lp-window-control--minimize" data-act="minimize" aria-label="Minimize event window" title="Minimize"></button>' +
      '<button type="button" class="lp-window-control lp-window-control--maximize" data-act="maximize" aria-label="Maximize event window" title="Maximize"></button>' +
      '</div><h2 id="' + titleId + '">' + esc(event.title) + '</h2></header>' +
      '<div class="lp-window-body">' + R.render(event, 'launchpad') + '</div>';
  }
  function makeDraggable(w) {
    var header = w.el.querySelector('.lp-window-header');
    header.addEventListener('pointerdown', function (e) {
      if (isMobile() || w.maximized || e.button > 0 || e.target.closest('button')) return;
      var sx = e.clientX, sy = e.clientY, ox = w.el.offsetLeft, oy = w.el.offsetTop;
      header.setPointerCapture(e.pointerId);
      header.classList.add('is-dragging');
      function move(ev) {
        var x = Math.min(Math.max(ox + ev.clientX - sx, 80 - w.el.offsetWidth), winsEl.clientWidth - 80);
        var y = Math.min(Math.max(oy + ev.clientY - sy, 0), winsEl.clientHeight - 48);
        w.el.style.left = x + 'px';
        w.el.style.top = y + 'px';
      }
      function up() {
        header.classList.remove('is-dragging');
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', up);
        header.removeEventListener('pointercancel', up);
      }
      header.addEventListener('pointermove', move);
      header.addEventListener('pointerup', up);
      header.addEventListener('pointercancel', up);
    });
  }
  function openEvent(id, focus) {
    var event = eventById(id);
    if (!event) return;
    var existing = wins[id];
    if (existing) { if (existing.minimized) restore(id); else raise(id, focus !== false); return; }
    var titleId = 'lp-window-title-' + (++seq);
    var el = document.createElement('section');
    el.className = 'lp-window';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', titleId);
    el.tabIndex = -1;
    el.innerHTML = windowInner(event, titleId);
    var visible = Object.keys(wins).filter(function (k) { return !wins[k].minimized; }).length;
    var cw = winsEl.clientWidth;
    var width = Math.min(840, cw - 32);
    el.style.width = width + 'px';
    el.style.left = Math.max(16, (cw - width) / 2 + ((visible % 6) - 2) * 30) + 'px';
    el.style.top = (16 + (visible % 6) * 30) + 'px';
    winsEl.appendChild(el);
    var w = wins[id] = { id: id, el: el, minimized: false, maximized: false, title: event.title, icon: iconHtml(event) };
    el.addEventListener('pointerdown', function () { if (order[order.length - 1] !== id) raise(id, false); });
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'close') closeWin(id);
      if (act === 'minimize') minimize(id);
      if (act === 'maximize') { w.maximized = !w.maximized; el.classList.toggle('is-maximized', w.maximized); }
    });
    makeDraggable(w);
    raise(id, focus !== false);
    markTiles();
  }

  /* ---------- events ---------- */
  pagesEl.addEventListener('click', function (e) {
    var tile = e.target.closest('.lp-tile');
    if (!tile || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    openEvent(tile.getAttribute('data-event-id'), true);
  });
  pagesEl.addEventListener('scroll', function () { window.requestAnimationFrame(syncDots); }, { passive: true });
  dotsEl.addEventListener('click', function (e) {
    var dot = e.target.closest('.lp-dot');
    if (dot) pagesEl.scrollTo({ left: Number(dot.getAttribute('data-page')) * pagesEl.clientWidth, behavior: 'smooth' });
  });
  dockWinsEl.addEventListener('click', function (e) {
    var item = e.target.closest('[data-dock-id]');
    if (!item) return;
    var id = item.getAttribute('data-dock-id');
    if (wins[id] && wins[id].minimized) restore(id); else raise(id, true);
  });
  trashEl.addEventListener('click', closeAll);
  searchEl.addEventListener('input', function () {
    query = searchEl.value;
    clearEl.hidden = !query;
    renderGrid();
  });
  clearEl.addEventListener('click', function () {
    searchEl.value = '';
    query = '';
    clearEl.hidden = true;
    renderGrid();
    searchEl.focus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.activeElement === searchEl && query) { clearEl.click(); return; }
    var front = topFront();
    if (front) closeWin(front);
  });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      renderGrid();
      if (isMobile()) Object.keys(wins).forEach(function (id) { wins[id].maximized = false; wins[id].el.classList.remove('is-maximized'); });
    }, 120);
  });

  function refresh() {
    loadEvents();
    Object.keys(wins).forEach(function (id) {
      var event = eventById(id);
      if (!event) { closeWin(id); return; }
      var w = wins[id];
      w.title = event.title;
      w.icon = iconHtml(event);
      w.el.querySelector('h2').textContent = event.title;
      w.el.querySelector('.lp-window-body').innerHTML = R.render(event, 'launchpad');
    });
    renderGrid();
    renderDock();
  }

  loadEvents();
  renderGrid();
  renderDock();
  var initial = new URLSearchParams(window.location.search).get('event');
  if (initial) openEvent(initial, true);
  if (window.BLITZ_LIVE) window.BLITZ_LIVE.onChange(refresh);
}());
