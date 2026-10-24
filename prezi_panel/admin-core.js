
(function () {
  'use strict';

  var PP = (window.PP = {});
  var cfg = window.BLITZ_CONFIG || {};
  PP.url = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  PP.key = String(cfg.supabaseKey || '');
  PP.configured = /^(https:\/\/[^\/\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i.test(PP.url) && PP.key.length >= 20;
  (function () {
    var privileged = /^sb_secret_/.test(PP.key);
    try { var parts = PP.key.split('.'); if (parts.length === 3) privileged = privileged || JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch (e) { /* not a JWT */ }
    if (privileged) { PP.configured = false; PP.privilegedKey = true; }   // never talk to Supabase from a browser with a secret key
  }());
  PP.map = window.BLITZ_MAP ? window.BLITZ_MAP.create(PP.url) : null;
  PP.sb = null;
  PP.recoveryInUrl = /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + '&' + window.location.search.replace(/^\?/, ''));

  if (PP.configured && window.supabase) {
    PP.sb = window.supabase.createClient(PP.url, PP.key, {
      auth: {
        storage: window.sessionStorage,
        storageKey: 'blitz-admin-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  PP.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === undefined || value === null || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (key === 'dataset') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
      else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'readOnly') node[key] = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    [].concat(children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    });
    return node;
  };

  PP.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  var uidCounter = 0;
  PP.uid = function (prefix) { uidCounter += 1; return (prefix || 'f') + '-' + uidCounter; };

  PP.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  PP.slugify = function (text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  };

  
  PP.imgSrc = function (path) {
    if (!path) return '';
    if (path.indexOf('storage:') === 0) return PP.map ? PP.map.imageUrl(path) : '';
    if (path.indexOf('assets/') === 0) return '../' + path;
    return '';
  };

  PP.formatDateTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  PP.toast = function (message, kind) {
    var host = document.getElementById('toasts');
    var node = PP.el('div', { class: 'toast' + (kind ? ' toast--' + kind : ''), text: message });
    if (kind === 'error') { node.setAttribute('role', 'alert'); node.title = 'Click to dismiss'; node.addEventListener('click', function () { if (node.parentNode) node.parentNode.removeChild(node); }); }
    host.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, kind === 'error' ? 20000 : 4500);
  };
  PP.dialog = function (build) {
    return new Promise(function (resolve) {
      var dlg = document.getElementById('dialog');
      PP.clear(dlg);
      var returnFocus = document.activeElement;
      var done = false;
      function close(result) {
        if (done) return;
        done = true;
        if (dlg.open) dlg.close();
        PP.clear(dlg);
        if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus();
        resolve(result);
      }
      dlg.onclose = function () { close(null); };
      dlg.oncancel = function () { close(null); };
      build(dlg, close);
      dlg.showModal();
    });
  };

  PP.confirm = function (opts) {
    return PP.dialog(function (dlg, close) {
      var cancel = PP.el('button', { type: 'button', class: 'btn', text: opts.cancelLabel || 'Cancel', onclick: function () { close(false); } });
      var ok = PP.el('button', { type: 'button', class: 'btn ' + (opts.danger ? 'btn--danger' : 'btn--primary'), text: opts.confirmLabel || 'OK', onclick: function () { close(true); } });
      dlg.appendChild(PP.el('h2', { text: opts.title }));
      dlg.appendChild(PP.el('p', { text: opts.message }));
      dlg.appendChild(PP.el('div', { class: 'dialog-actions' }, [cancel, ok]));
      (opts.danger ? cancel : ok).focus();
    }).then(function (r) { return r === true; });
  };
  var ACCEPT = 'image/png,image/jpeg,image/webp';
  var MAX_SOURCE_BYTES = 20 * 1024 * 1024;

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image. Use a PNG, JPEG or WebP file.')); };
      img.src = url; // browsers apply the photo's EXIF rotation when drawing
    });
  }

  function encode(canvas, mime, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, mime, quality); });
  }

  
  /*
   * Choose SEVERAL images at once. Each file goes through the same validation and crop step as a single image,
   * one after another ("Image 2 of 5"). Resolves with the blobs that were accepted, in the order chosen;
   * cancelling a crop skips only that image.
   */
  PP.chooseImages = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var input = PP.el('input', { type: 'file', accept: ACCEPT, multiple: 'multiple', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
      document.body.appendChild(input);
      var settled = false;
      function finish(v) { if (settled) return; settled = true; if (input.parentNode) input.parentNode.removeChild(input); resolve(v); }
      input.addEventListener('cancel', function () { finish([]); });
      input.addEventListener('change', function () {
        var files = [].slice.call(input.files || []);
        if (!files.length) return finish([]);
        var room = typeof opts.limit === 'number' ? Math.max(0, opts.limit) : files.length;
        if (files.length > room) { PP.toast('Only ' + room + ' more image' + (room === 1 ? '' : 's') + ' can be added (the limit is ' + (opts.max || room) + '). The first ' + room + ' were kept.', 'error'); files = files.slice(0, room); }
        var accepted = [];
        files.reduce(function (chain, file, i) {
          return chain.then(function () {
            if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { PP.toast(file.name + ': please choose a PNG, JPEG or WebP image.', 'error'); return; }
            if (file.size > MAX_SOURCE_BYTES) { PP.toast(file.name + ' is larger than 20 MB, so it was skipped.', 'error'); return; }
            return loadImage(file).then(function (loaded) {
              var one = Object.assign({}, opts, { title: (opts.title || 'Position the image') + (files.length > 1 ? ' (' + (i + 1) + ' of ' + files.length + ')' : '') });
              return openCropper(loaded, one).then(function (blob) { URL.revokeObjectURL(loaded.url); if (blob) accepted.push(blob); });
            }).catch(function (err) { PP.toast((file.name || 'That image') + ': ' + (err.message || 'could not be opened.'), 'error'); });
          });
        }, Promise.resolve()).then(function () { finish(accepted); });
      });
      input.click();
    });
  };

  PP.chooseImage = function (opts) {
    return new Promise(function (resolve) {
      var input = PP.el('input', { type: 'file', accept: ACCEPT, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
      document.body.appendChild(input);
      var settled = false;
      function finish(v) { if (settled) return; settled = true; if (input.parentNode) input.parentNode.removeChild(input); resolve(v); }
      input.addEventListener('cancel', function () { finish(null); });
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return finish(null);
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { PP.toast('Please choose a PNG, JPEG or WebP image.', 'error'); return finish(null); }
        if (file.size > MAX_SOURCE_BYTES) { PP.toast('That image is larger than 20 MB. Please choose a smaller one.', 'error'); return finish(null); }
        loadImage(file).then(function (loaded) {
          return openCropper(loaded, opts).then(function (blob) { URL.revokeObjectURL(loaded.url); finish(blob); });
        }).catch(function (err) { PP.toast(err.message || 'Could not open that image.', 'error'); finish(null); });
      });
      input.click();
    });
  };

  function openCropper(loaded, opts) {
    var img = loaded.img;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih || iw > 16000 || ih > 16000) return Promise.reject(new Error('That image has unsupported dimensions.'));
    var cw = Math.min(360, Math.round(window.innerWidth - 80));
    cw = Math.max(cw, 200);
    var ch = Math.round(cw * opts.outH / opts.outW);
    var cover = opts.mode !== 'contain';
    var sMin = cover ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
    var sMax = sMin * 5;
    var s = sMin, ox = (cw - iw * s) / 2, oy = (ch - ih * s) / 2;

    return PP.dialog(function (dlg, close) {
      var canvas = PP.el('canvas', { class: 'crop-canvas', width: cw, height: ch, tabindex: '0', role: 'img', 'aria-label': 'Crop area. Drag to move, use the zoom slider or plus and minus keys to zoom, arrow keys to nudge.' });
      var ctx = canvas.getContext('2d');
      var zoom = PP.el('input', { type: 'range', min: '0', max: '100', value: '0', 'aria-label': 'Zoom' });

      function clamp() {
        var w = iw * s, h = ih * s;
        if (cover) { ox = Math.min(0, Math.max(cw - w, ox)); oy = Math.min(0, Math.max(ch - h, oy)); }
        else {
          ox = w >= cw ? Math.min(0, Math.max(cw - w, ox)) : Math.min(cw - w, Math.max(0, ox));
          oy = h >= ch ? Math.min(0, Math.max(ch - h, oy)) : Math.min(ch - h, Math.max(0, oy));
        }
      }
      function draw() { ctx.clearRect(0, 0, cw, ch); ctx.drawImage(img, ox, oy, iw * s, ih * s); }
      function setScale(next) {
        next = Math.min(sMax, Math.max(sMin, next));
        var cx = (cw / 2 - ox) / s, cy = (ch / 2 - oy) / s; // keep the centre point fixed
        s = next; ox = cw / 2 - cx * s; oy = ch / 2 - cy * s;
        clamp(); draw();
        zoom.value = String(Math.round((s - sMin) / (sMax - sMin) * 100));
      }
      clamp(); draw();

      var drag = null;
      canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var k = cw / canvas.getBoundingClientRect().width;
        ox += (e.clientX - drag.x) * k; oy += (e.clientY - drag.y) * k;
        drag = { x: e.clientX, y: e.clientY }; clamp(); draw();
      });
      ['pointerup', 'pointercancel'].forEach(function (t) { canvas.addEventListener(t, function () { drag = null; }); });
      canvas.addEventListener('wheel', function (e) { e.preventDefault(); setScale(s * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
      canvas.addEventListener('keydown', function (e) {
        var step = 10, handled = true;
        if (e.key === 'ArrowLeft') ox += step; else if (e.key === 'ArrowRight') ox -= step;
        else if (e.key === 'ArrowUp') oy += step; else if (e.key === 'ArrowDown') oy -= step;
        else if (e.key === '+' || e.key === '=') { setScale(s * 1.1); return e.preventDefault(); }
        else if (e.key === '-') { setScale(s / 1.1); return e.preventDefault(); }
        else handled = false;
        if (handled) { e.preventDefault(); clamp(); draw(); }
      });
      zoom.addEventListener('input', function () { setScale(sMin + (sMax - sMin) * (Number(zoom.value) / 100)); });

      var save = PP.el('button', { type: 'button', class: 'btn btn--primary', text: 'Use this crop' });
      var cancel = PP.el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { close(null); } });
      save.addEventListener('click', function () {
        save.disabled = true; save.textContent = 'Processing…';
        var out = document.createElement('canvas');
        out.width = opts.outW; out.height = opts.outH;
        var octx = out.getContext('2d');
        octx.imageSmoothingQuality = 'high';
        var k = opts.outW / cw;
        octx.drawImage(img, ox * k, oy * k, iw * s * k, ih * s * k);
        var maxBytes = opts.maxBytes || 150 * 1024;
        var q = 0.88;
        (function attempt() {
          encode(out, 'image/webp', q).then(function (blob) {
            if (blob && blob.type !== 'image/webp') { // this browser cannot write WebP: fall back
              return encode(out, cover ? 'image/jpeg' : 'image/png', 0.85).then(function (b) { return b; });
            }
            if (blob && blob.size > maxBytes && q > 0.5) { q -= 0.08; return attempt(); }
            return blob;
          }).then(function (blob) {
            if (!blob) { PP.toast('Could not process the image.', 'error'); save.disabled = false; save.textContent = 'Use this crop'; return; }
            if (blob.size > 2 * 1024 * 1024) { PP.toast('The processed image is still over 2 MB. Try a smaller picture.', 'error'); save.disabled = false; save.textContent = 'Use this crop'; return; }
            close(blob);
          });
        }());
      });

      dlg.appendChild(PP.el('h2', { text: opts.title || 'Crop image' }));
      if (opts.hint) dlg.appendChild(PP.el('p', { class: 'hint', text: opts.hint }));
      dlg.appendChild(PP.el('div', { class: 'crop-wrap' }, [canvas, PP.el('label', { class: 'field' }, [PP.el('span', { class: 'sr-only', text: 'Zoom' }), zoom])]));
      dlg.appendChild(PP.el('div', { class: 'dialog-actions' }, [cancel, save]));
      canvas.focus();
    });
  }

  
  PP.uploadImage = function (folder, blob) {
    var ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
    var path = folder + '/' + PP.uuid() + '.' + ext;
    return window.BLITZ_ERRORS.withTimeout(PP.sb.storage.from('media').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false }), 60000, 'Image upload')
      .then(function (res) {
        if (res.error) throw window.BLITZ_ERRORS.normalize(res.error, { operation: 'upload-image', service: 'supabase' });
        return 'storage:' + path;
      });
  };
  PP.explain = function (error) {
    return window.BLITZ_ERRORS.explain(error, { audience: 'admin', showCorrelation: false });
  };

  /*
   * Session expired while working: ask for the password in a dialog on top of the page, so nothing typed is lost.
   * Resolves true when signed in again, null when the person chooses "Not now".
   */
  var reauthOpen = false;
  PP.reauth = function (email) {
    if (reauthOpen || !PP.sb) return Promise.resolve(null);
    reauthOpen = true;
    return PP.dialog(function (dlg, close) {
      var pw = PP.el('input', { type: 'password', name: 'reauth-password', autocomplete: 'current-password', 'aria-label': 'Password' });
      var msg = PP.el('div', { class: 'err', role: 'alert', hidden: true });
      var go = PP.el('button', { type: 'button', class: 'btn btn--primary', text: 'Sign in again' });
      var later = PP.el('button', { type: 'button', class: 'btn', text: 'Not now', onclick: function () { close(null); } });
      function submit() {
        if (!pw.value) { msg.textContent = 'Enter your password.'; msg.hidden = false; return; }
        go.disabled = true; go.textContent = 'Signing in…'; msg.hidden = true;
        PP.sb.auth.signInWithPassword({ email: email, password: pw.value }).then(function (res) {
          if (res.error) throw res.error;
          close(true);
        }).catch(function (err) {
          go.disabled = false; go.textContent = 'Sign in again';
          msg.textContent = window.BLITZ_ERRORS.explain(err, { audience: 'admin', area: 'auth', showCorrelation: false }); msg.hidden = false; pw.value = ''; pw.focus();
        });
      }
      go.addEventListener('click', submit);
      pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      dlg.appendChild(PP.el('h2', { text: 'Your session expired' }));
      dlg.appendChild(PP.el('p', { text: 'Sign in again to keep working. Everything you typed is still on this page and nothing has been lost.' }));
      dlg.appendChild(PP.el('p', { class: 'hint', text: email }));
      dlg.appendChild(PP.el('div', { class: 'field' }, [PP.el('label', { text: 'Password' }), pw]));
      dlg.appendChild(msg);
      dlg.appendChild(PP.el('div', { class: 'dialog-actions' }, [later, go]));
      pw.focus();
    }).then(function (r) {
      reauthOpen = false;
      if (r) PP.toast('Signed in again. You can continue.', 'ok');
      return r;
    });
  };
}());
