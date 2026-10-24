
(function () {
  'use strict';
  var out = document.getElementById('out');
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return; // only the admin page that embeds this preview
    var msg = e.data;
    if (!msg || msg.type !== 'render' || !msg.event || !window.BLITZ_EVENT_RENDERER) return;
    out.innerHTML = window.BLITZ_EVENT_RENDERER.render(msg.event, 'launchpad'); // renderer escapes every value
    if (msg.imageSrc && /^(blob:|https:\/\/|\.\.\/assets\/)/.test(msg.imageSrc)) {
      var img = out.querySelector('.event-detail-media img, .event-page-media img');
      if (img) img.src = msg.imageSrc;
    }
    if (Array.isArray(msg.imageSrcs) && msg.imageSrcs.length > 1) {
      [].forEach.call(out.querySelectorAll('.event-detail-media img, .event-page-media img'), function (img, i) {
        var u = msg.imageSrcs[i];
        if (u && /^(blob:|https:\/\/|\.\.\/assets\/)/.test(u)) img.src = u;
      });
    }
    if (msg.logoSrc && /^(blob:|https:\/\/|\.\.\/assets\/)/.test(msg.logoSrc)) {
      var logoImg = out.querySelector('.event-page-logo img, .event-detail-logo img');
      if (logoImg) logoImg.src = msg.logoSrc;
    }
    if (window.parent) window.parent.postMessage({ type: 'preview-height', height: document.documentElement.scrollHeight }, '*');
  });
  if (window.parent) window.parent.postMessage({ type: 'preview-ready' }, '*');
}());
