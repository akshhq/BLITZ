
(function () {
  'use strict';
  var out = document.getElementById('out');
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return; // only the admin page that embeds this preview
    var msg = e.data;
    if (!msg || msg.type !== 'render' || !msg.event || !window.BLITZ_EVENT_RENDERER) return;
    out.innerHTML = window.BLITZ_EVENT_RENDERER.render(msg.event, 'launchpad'); // renderer escapes every value
    if (msg.imageSrc && /^(blob:|https:\/\/|\.\.\/assets\/)/.test(msg.imageSrc)) {
      var img = out.querySelector('.event-detail-media img, .event-page-media img, figure img');
      if (img) img.src = msg.imageSrc;
    }
    if (window.parent) window.parent.postMessage({ type: 'preview-height', height: document.documentElement.scrollHeight }, '*');
  });
  if (window.parent) window.parent.postMessage({ type: 'preview-ready' }, '*');
}());
