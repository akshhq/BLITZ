
(function () {
  'use strict';
  var out = document.getElementById('out');
  function safePreviewSrc(value) {
    var u = String(value || '').trim();
    if (!u || u.indexOf('..') === 0 || /\/\.\.\//.test(u.replace(/^\.\.\//, '')) || /[\x00-\x1f\s"'<>]/.test(u) || u.indexOf('//') === 0) return '';
    return /^(blob:|https:\/\/|\.\.\/assets\/)/.test(u) && u.indexOf('..', 3) < 0 ? u : '';
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return; // only the admin page that embeds this preview
    var msg = e.data;
    if (!msg || typeof msg !== 'object' || msg.type !== 'render' || !msg.event || typeof msg.event !== 'object' || !window.BLITZ_EVENT_RENDERER) return;
    out.innerHTML = window.BLITZ_EVENT_RENDERER.render(msg.event, 'launchpad'); // renderer escapes every value
    var imgSrc = safePreviewSrc(msg.imageSrc);
    if (imgSrc) {
      var img = out.querySelector('.event-detail-media img, .event-page-media img');
      if (img) img.src = imgSrc;
    }
    if (Array.isArray(msg.imageSrcs) && msg.imageSrcs.length > 1) {
      [].forEach.call(out.querySelectorAll('.event-detail-media img, .event-page-media img'), function (img, i) {
        var u = safePreviewSrc(msg.imageSrcs[i]);
        if (u) img.src = u;
      });
    }
    var logoSrc = safePreviewSrc(msg.logoSrc);
    if (logoSrc) {
      var logoImg = out.querySelector('.event-page-logo img, .event-detail-logo img');
      if (logoImg) logoImg.src = logoSrc;
    }
    if (window.parent) window.parent.postMessage({ type: 'preview-height', height: document.documentElement.scrollHeight }, '*');
  });
  if (window.parent) window.parent.postMessage({ type: 'preview-ready' }, '*');
}());
