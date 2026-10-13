
(function () {
  'use strict';

  var PP = window.PP;
  var el = PP.el;

  var URL_RE = /^https:\/\/[^\s<>"']+$/i;
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{1,78}$/;

  function validDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
  }
  var TIERS = [
    { value: 'faculty', label: 'Faculty & Convenor' },
    { value: 'core', label: 'Core Team' },
    { value: 'senior', label: 'Senior Executives' },
    { value: 'junior', label: 'Junior Executives' },
    { value: 'volunteer', label: 'Volunteers' }
  ];
  PP.TIERS = TIERS;

  var PUBLISHED = { key: 'published', type: 'checkbox', label: 'Show on the website', help: 'Untick to keep it as a draft that visitors cannot see.' };

  PP.COLLECTIONS = {
    announcements: {
      label: 'Announcements', singular: 'announcement', table: 'announcements', pk: 'id', slugFrom: 'title',
      order: { column: 'date', ascending: false },
      item: { title: function (r) { return r.title; }, meta: function (r) { return r.date ? PP.fmtDate(r.date) : 'No date'; } },
      fields: [
        { key: 'id', type: 'slug', label: 'Web address (ID)', help: 'Set once when created; it cannot be changed later.', required: true },
        { key: 'title', label: 'Title', required: true, max: 200 },
        { key: 'date', label: 'Date (optional)', kind: 'date', help: 'Leave empty to show the announcement without a date.' },
        { key: 'summary', label: 'Short summary', type: 'textarea', max: 500, emptyAs: '', help: 'One or two sentences shown in the pop-up.' },
        { key: 'body', label: 'Full text (optional)', type: 'textarea', max: 5000, emptyAs: '' },
        { key: 'link', label: 'Link (optional)', kind: 'url', placeholder: 'https://', help: 'Must start with https://' },
        PUBLISHED
      ]
    },

    events: {
      label: 'Events', singular: 'event', table: 'events', pk: 'id', slugFrom: 'title',
      order: { column: 'date', ascending: false, nullsFirst: true },
      preview: true,
      item: {
        title: function (r) { return r.title; },
        meta: function (r) { return (r.date ? PP.fmtDate(r.date) : 'Date to be confirmed') + ' · ' + (r.layout || 'event'); },
        thumb: 'image'
      },
      fields: [
        { group: 'Basics', open: true, key: 'id', type: 'slug', label: 'Web address (ID)', help: 'Used in the event link (event.html?event=ID). Set once; it cannot be changed later.', required: true },
        { group: 'Basics', key: 'title', label: 'Title', required: true, max: 200 },
        { group: 'Basics', key: 'date', label: 'Date', kind: 'date', help: 'Leave empty if the date is not confirmed yet; the site shows “Date TBC”.' },
        { group: 'Basics', key: 'time', label: 'Time', max: 60, placeholder: 'e.g. 11:00 AM–12:30 PM' },
        { group: 'Basics', key: 'location', label: 'Location', max: 200 },
        { group: 'Basics', key: 'category', label: 'Event type', required: true, max: 80, help: 'Shown as the label, e.g. “Workshop”.' },
        { group: 'Basics', key: 'layout', label: 'Page layout', type: 'select', required: true, help: 'Chooses which detail blocks the event page shows (winners appear for “Competition”; sub-events for “Festival”).',
          options: [['event', 'General event'], ['workshop', 'Workshop'], ['competition', 'Competition'], ['festival', 'Festival / multi-event'], ['speaker', 'Speaker session']] },
        { group: 'Basics', key: 'format', label: 'Format', max: 120 },
        { group: 'Basics', key: 'platform', label: 'Platform (optional)', max: 80 },
        { group: 'Basics', key: 'participants', label: 'Participants (optional)', max: 80, placeholder: 'e.g. Nine teams' },
        { group: 'Basics', key: 'description', label: 'Description', type: 'textarea', required: true, max: 2000 },

        { group: 'Speakers & highlights', key: 'speakers', type: 'stringlist', label: 'Speakers', itemMax: 120, maxItems: 30, help: 'One name per line.' },
        { group: 'Speakers & highlights', key: 'key_points', type: 'stringlist', label: 'Key points', itemMax: 300, maxItems: 30, help: 'One point per line.' },
        { group: 'Speakers & highlights', key: 'additional_info', label: 'Notes (optional)', type: 'textarea', max: 1500 },

        { group: 'Winners (Competition layout)', key: 'winners', type: 'repeater', label: 'Winners', addLabel: 'Add a result', maxItems: 30,
          fields: [
            { key: 'position', label: 'Position', required: true, max: 60, placeholder: 'First' },
            { key: 'names', label: 'Names', type: 'stringlist', itemMax: 120, maxItems: 10, help: 'One name per line.' }
          ] },
        { group: 'Sessions', key: 'sessions', type: 'repeater', label: 'Sessions', addLabel: 'Add a session', maxItems: 30,
          fields: [
            { key: 'title', label: 'Session title', required: true, max: 200 },
            { key: 'date', label: 'Date (optional)', kind: 'date' },
            { key: 'speakers', label: 'Speakers', type: 'stringlist', itemMax: 120, maxItems: 10, help: 'One name per line.' },
            { key: 'summary', label: 'Summary', type: 'textarea', max: 600 }
          ] },
        { group: 'Sub-events (Festival / Competition layouts)', key: 'competition_sections', type: 'repeater', label: 'Sub-events', addLabel: 'Add a sub-event', maxItems: 30,
          fields: [
            { key: 'title', label: 'Name', required: true, max: 120 },
            { key: 'type', label: 'Kind', max: 80, placeholder: 'e.g. Quiz' }
          ] },

        { group: 'Image & links', key: 'image', type: 'image', label: 'Event image (optional)', folder: 'events', outW: 1200, outH: 675, mode: 'cover', shape: 'wide', maxBytes: 220 * 1024 },
        { group: 'Image & links', key: 'image_alt', label: 'Image description', max: 300, help: 'Describe the picture for people using screen readers.' },
        { group: 'Image & links', key: 'links', type: 'repeater', label: 'Links', addLabel: 'Add a link', maxItems: 20,
          fields: [
            { key: 'label', label: 'Label', required: true, max: 100 },
            { key: 'url', label: 'Link', kind: 'url', required: true, placeholder: 'https://' }
          ] },

        Object.assign({ group: 'Publishing', open: true }, PUBLISHED)
      ]
    },

    team: {
      label: 'Team', singular: 'team member', table: 'team_members', pk: 'id', ordered: true, groupBy: 'tier',
      order: { column: 'sort_order', ascending: true },
      item: { title: function (r) { return r.name; }, meta: function (r) { return r.position; }, thumb: 'photo', round: true },
      fields: [
        { key: 'name', label: 'Name', required: true, max: 120 },
        { key: 'position', label: 'Position', required: true, max: 120, placeholder: 'e.g. Volunteer' },
        { key: 'tier', label: 'Group', type: 'select', required: true, options: TIERS.map(function (t) { return [t.value, t.label]; }) },
        { key: 'photo', type: 'image', label: 'Photo', folder: 'team', outW: 400, outH: 400, mode: 'cover', shape: 'round', maxBytes: 60 * 1024,
          help: 'Drag the picture so the face is centred. Without a photo, a neutral avatar is shown.' },
        PUBLISHED
      ]
    },

    gallery: {
      label: 'Gallery', singular: 'gallery item', table: 'gallery_items', pk: 'id', ordered: true,
      order: { column: 'sort_order', ascending: true },
      item: { title: function (r) { return r.title; }, meta: function (r) { return [r.media_type === 'illustration' ? 'Illustration' : 'Photo', r.date_label].filter(Boolean).join(' · '); }, thumb: 'image' },
      fields: [
        { key: 'title', label: 'Title', required: true, max: 200 },
        { key: 'image', type: 'image', label: 'Image', required: true, folder: 'gallery', outW: 800, outH: 600, mode: 'cover', shape: 'wide', maxBytes: 220 * 1024 },
        { key: 'alt', label: 'Image description', max: 300, help: 'Describe what the picture shows, for people using screen readers.' },
        { key: 'description', label: 'Caption (optional)', type: 'textarea', max: 500 },
        { key: 'media_type', label: 'Kind', type: 'select', required: true, options: [['photo', 'Photo'], ['illustration', 'Illustration']] },
        { key: 'date_label', label: 'When', max: 60, placeholder: 'e.g. Aug 2026' },
        { key: 'location', label: 'Where', max: 200 },
        PUBLISHED
      ]
    },

    collaborations: {
      label: 'Collaborations', singular: 'collaboration', table: 'collaborations', pk: 'id', ordered: true,
      order: { column: 'sort_order', ascending: true },
      item: { title: function (r) { return r.name; }, meta: function (r) { return r.type; }, thumb: 'logo' },
      fields: [
        { key: 'name', label: 'Name', required: true, max: 160 },
        { key: 'type', label: 'Kind of partnership', required: true, max: 120, placeholder: 'e.g. Community partner' },
        { key: 'logo', type: 'image', label: 'Logo (optional)', folder: 'collaborations', outW: 480, outH: 200, mode: 'contain', shape: 'logo', maxBytes: 80 * 1024,
          help: 'The whole logo is kept inside the frame; transparent backgrounds work.' },
        { key: 'url', label: 'Website (optional)', kind: 'url', placeholder: 'https://', help: 'Must start with https://' },
        PUBLISHED
      ]
    }
  };

  PP.fmtDate = function (iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + m[1];
  };
  function shell(def, control, controlId, extra) {
    var errId = PP.uid('err');
    var hintId = PP.uid('hint');
    var errNode = el('div', { class: 'err', id: errId, role: 'alert', hidden: true });
    var describedBy = [];
    if (def.help) describedBy.push(hintId);
    describedBy.push(errId);
    if (control && control.setAttribute) control.setAttribute('aria-describedby', describedBy.join(' '));
    var node = el('div', { class: 'field' }, [
      el('label', { for: controlId }, [def.label, def.required ? el('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null, def.required ? el('span', { class: 'sr-only', text: ' (required)' }) : null]),
      control,
      def.help ? el('div', { class: 'hint', id: hintId, text: def.help }) : null,
      extra || null,
      errNode
    ]);
    function setError(msg) {
      errNode.hidden = !msg;
      errNode.textContent = msg || '';
      if (control && control.setAttribute) control.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    return { node: node, setError: setError };
  }

  function checkString(def, v) {
    if (def.required && !v) return 'This field is required.';
    if (!v) return '';
    if (def.max && v.length > def.max) return 'Please keep this under ' + def.max + ' characters (it is ' + v.length + ').';
    if (def.kind === 'url' && !URL_RE.test(v)) return 'Enter a full link that starts with https://';
    if (def.kind === 'date' && !validDate(v)) return 'Enter a valid date.';
    if (def.type === 'slug' && !SLUG_RE.test(v)) return 'Use lowercase letters, numbers and dashes only (at least 2 characters).';
    return '';
  }

  function textWidget(def, value, ctx) {
    var id = PP.uid('f');
    var isArea = def.type === 'textarea';
    var control = el(isArea ? 'textarea' : 'input', {
      id: id, name: def.key,
      type: isArea ? null : (def.kind === 'date' ? 'date' : def.kind === 'url' ? 'url' : 'text'),
      value: value == null ? '' : String(value),
      placeholder: def.placeholder, maxlength: def.max ? String(def.max + 50) : null, autocomplete: 'off', spellcheck: def.kind === 'url' || def.type === 'slug' ? 'false' : null
    });
    if (def.type === 'slug' && !ctx.isNew) control.readOnly = true;
    if (ctx.readOnly) control.disabled = true;
    var s = shell(def, control, id);
    function get() { var v = control.value.trim(); return v === '' ? (def.emptyAs !== undefined ? def.emptyAs : null) : v; }
    return {
      node: s.node, control: control, setError: s.setError, focus: function () { control.focus(); },
      get: get,
      check: function () { var m = checkString(def, control.value.trim()); s.setError(m); return m; }
    };
  }

  function selectWidget(def, value, ctx) {
    var id = PP.uid('f');
    var control = el('select', { id: id, name: def.key }, def.options.map(function (o) {
      return el('option', { value: o[0], text: o[1] });
    }));
    control.value = value || def.options[0][0];
    if (ctx.readOnly) control.disabled = true;
    var s = shell(def, control, id);
    return { node: s.node, control: control, setError: s.setError, focus: function () { control.focus(); }, get: function () { return control.value; }, check: function () { s.setError(''); return ''; } };
  }

  function checkboxWidget(def, value, ctx) {
    var id = PP.uid('f');
    var control = el('input', { type: 'checkbox', id: id, name: def.key, checked: value === undefined ? true : !!value });
    if (ctx.readOnly) control.disabled = true;
    var hintId = PP.uid('hint');
    if (def.help) control.setAttribute('aria-describedby', hintId);
    var node = el('div', { class: 'field' }, [el('label', { class: 'check', for: id }, [control, def.label]), def.help ? el('div', { class: 'hint', id: hintId, text: def.help }) : null]);
    return { node: node, control: control, setError: function () {}, focus: function () { control.focus(); }, get: function () { return control.checked; }, check: function () { return ''; } };
  }

  function stringListWidget(def, value, ctx) {
    var id = PP.uid('f');
    var control = el('textarea', { id: id, name: def.key, value: (Array.isArray(value) ? value : []).join('\n'), autocomplete: 'off' });
    if (ctx.readOnly) control.disabled = true;
    var s = shell(def, control, id);
    function get() { return control.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
    return {
      node: s.node, control: control, setError: s.setError, focus: function () { control.focus(); }, get: get,
      check: function () {
        var items = get(), m = '';
        if (def.maxItems && items.length > def.maxItems) m = 'At most ' + def.maxItems + ' lines are allowed.';
        else if (def.itemMax && items.some(function (x) { return x.length > def.itemMax; })) m = 'Each line must be under ' + def.itemMax + ' characters.';
        s.setError(m); return m;
      }
    };
  }

  function repeaterWidget(def, value, ctx) {
    var rows = [];
    var list = el('div', { class: 'group-body' });
    var count = el('span', { text: '' });
    var summary = el('summary', null, [def.label + ' (', count, ')']);
    var details = el('details', { class: 'group' }, [summary, list]);
    var errNode = el('div', { class: 'err', role: 'alert', hidden: true });
    var addBtn = el('button', { type: 'button', class: 'btn btn--small', text: '+ ' + (def.addLabel || 'Add'), onclick: function () { addRow({}); rows[rows.length - 1].widgets[0].focus(); notify(); } });
    if (ctx.readOnly) addBtn.disabled = true;

    function updateCount() { count.textContent = String(rows.length); }
    function notify() { updateCount(); if (ctx.onChange) ctx.onChange(); }

    function addRow(orig) {
      var widgets = def.fields.map(function (f) { return makeWidget(f, orig[f.key], ctx); });
      var row = { orig: orig, widgets: widgets };
      var actions = el('div', { class: 'repeat-row-actions' }, [
        el('button', { type: 'button', class: 'btn btn--small', text: 'Move up', onclick: function () { move(row, -1); } }),
        el('button', { type: 'button', class: 'btn btn--small', text: 'Move down', onclick: function () { move(row, 1); } }),
        el('button', { type: 'button', class: 'btn btn--small btn--danger', text: 'Remove', onclick: function () { remove(row); } })
      ]);
      if (ctx.readOnly) actions.hidden = true;
      row.node = el('div', { class: 'repeat-row' }, widgets.map(function (w) { return w.node; }).concat([actions]));
      rows.push(row);
      list.insertBefore(row.node, addBtn);
    }
    function move(row, delta) {
      var i = rows.indexOf(row), j = i + delta;
      if (j < 0 || j >= rows.length) return;
      rows.splice(i, 1); rows.splice(j, 0, row);
      rows.forEach(function (r) { list.insertBefore(r.node, addBtn); });
      notify();
    }
    function remove(row) {
      rows.splice(rows.indexOf(row), 1);
      list.removeChild(row.node);
      notify();
    }

    list.appendChild(addBtn);
    list.appendChild(errNode);
    (Array.isArray(value) ? value : []).forEach(function (o) { addRow(o && typeof o === 'object' ? o : {}); });
    details.open = rows.length > 0;
    updateCount();
    list.addEventListener('input', function () { if (ctx.onChange) ctx.onChange(); });

    function isEmptyRow(r) {
      return r.widgets.every(function (w) { var v = w.get(); return v === null || v === '' || (Array.isArray(v) && v.length === 0); });
    }
    function get() {
      return rows.filter(function (r) { return !isEmptyRow(r); }).map(function (r) {
        var obj = Object.assign({}, r.orig); // keep any fields this panel does not edit (e.g. ids)
        def.fields.forEach(function (f, idx) {
          var v = r.widgets[idx].get();
          if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete obj[f.key]; else obj[f.key] = v;
        });
        return obj;
      });
    }
    return {
      node: details, control: details, setError: function (m) { errNode.hidden = !m; errNode.textContent = m || ''; },
      focus: function () { details.open = true; var w = rows[0] && rows[0].widgets[0]; if (w) w.focus(); else addBtn.focus(); },
      get: get,
      check: function () {
        var m = '';
        rows.forEach(function (r) {
          if (isEmptyRow(r)) return;
          r.widgets.forEach(function (w) { var e = w.check(); if (e && !m) m = def.label + ': ' + e; });
        });
        if (def.maxItems && get().length > def.maxItems) m = 'At most ' + def.maxItems + ' entries are allowed.';
        errNode.hidden = !m; errNode.textContent = m;
        if (m) details.open = true;
        return m;
      }
    };
  }

  function imageWidget(def, value, ctx) {
    var state = { path: value || null, blob: null, blobUrl: null };
    var id = PP.uid('f');
    var previewHost = el('div');
    var chooseBtn = el('button', { type: 'button', id: id, class: 'btn', text: 'Choose image…' });
    var removeBtn = el('button', { type: 'button', class: 'btn btn--danger', text: 'Remove image' });
    var status = el('div', { class: 'hint', hidden: true });

    function currentSrc() { return state.blobUrl || PP.imgSrc(state.path); }
    function render() {
      PP.clear(previewHost);
      var src = currentSrc();
      if (src) {
        previewHost.appendChild(el('img', { class: 'imgfield-preview imgfield-preview--' + (def.shape || 'wide'), src: src, alt: 'Current image' }));
      } else {
        previewHost.appendChild(el('div', { class: 'imgfield-empty', text: 'No image' }));
      }
      chooseBtn.textContent = src ? 'Replace image…' : 'Choose image…';
      removeBtn.hidden = !src || ctx.readOnly;
      status.hidden = !state.blob;
      status.textContent = state.blob ? 'New image ready. It will be uploaded when you save.' : '';
    }
    chooseBtn.addEventListener('click', function () {
      PP.chooseImage({ title: 'Position the ' + def.label.toLowerCase().replace(/ \(optional\)/, ''), outW: def.outW, outH: def.outH, mode: def.mode, maxBytes: def.maxBytes, hint: def.help }).then(function (blob) {
        if (!blob) return;
        if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
        state.blob = blob; state.blobUrl = URL.createObjectURL(blob);
        render(); if (ctx.onChange) ctx.onChange();
      });
    });
    removeBtn.addEventListener('click', function () {
      if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
      state.path = null; state.blob = null; state.blobUrl = null;
      render(); if (ctx.onChange) ctx.onChange();
    });
    if (ctx.readOnly) chooseBtn.disabled = true;
    var s = shell(def, chooseBtn, id, el('div', { class: 'imgfield' }, [previewHost, el('div', { class: 'repeat-row-actions' }, [chooseBtn, removeBtn]), status]));
    render();
    return {
      node: s.node, control: chooseBtn, setError: s.setError, focus: function () { chooseBtn.focus(); },
      get: function () { return state.path; },
      pending: function () { return state.blob; },
      previewSrc: currentSrc,
      check: function () { var m = def.required && !state.path && !state.blob ? 'Please choose an image.' : ''; s.setError(m); return m; },
      commit: function (newPath) { state.path = newPath; state.blob = null; if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null; } render(); }
    };
  }

  function makeWidget(def, value, ctx) {
    switch (def.type) {
      case 'select': return selectWidget(def, value, ctx);
      case 'checkbox': return checkboxWidget(def, value, ctx);
      case 'stringlist': return stringListWidget(def, value, ctx);
      case 'repeater': return repeaterWidget(def, value, ctx);
      case 'image': return imageWidget(def, value, ctx);
      default: return textWidget(def, value, ctx);
    }
  }
  
  PP.buildForm = function (coll, record, ctx) {
    record = record || {};
    var widgets = {};
    var order = [];
    var slugTouched = false;
    var localCtx = Object.assign({}, ctx);
    localCtx.onChange = function () { if (ctx.onChange) ctx.onChange(); };

    coll.fields.forEach(function (def) {
      if (def.type === 'slug' && !ctx.isNew) {
        widgets[def.key] = textWidget(def, record[def.key], { isNew: false, readOnly: true });
      } else {
        var initial = record[def.key];
        if (def.key === 'published' && ctx.isNew) initial = true;
        widgets[def.key] = makeWidget(def, initial, localCtx);
      }
      order.push(def);
    });
    if (ctx.isNew && coll.slugFrom && widgets.id && widgets[coll.slugFrom]) {
      var idControl = widgets.id.control, srcControl = widgets[coll.slugFrom].control;
      idControl.addEventListener('input', function () { slugTouched = true; });
      srcControl.addEventListener('input', function () { if (!slugTouched) idControl.value = PP.slugify(srcControl.value); });
    }
    coll.fields.forEach(function (def) {
      var w = widgets[def.key];
      if (w && w.control && w.control.addEventListener && def.type !== 'repeater') {
        w.control.addEventListener('input', localCtx.onChange);
        w.control.addEventListener('change', localCtx.onChange);
      }
    });
    var form = el('form', { class: 'form', novalidate: 'novalidate' });
    var fieldset = el('fieldset', { class: 'form' }, []);
    if (ctx.readOnly) fieldset.disabled = false; // widgets are individually disabled (keeps text selectable)
    var grouped = coll.fields.some(function (f) { return f.group; });
    if (grouped) {
      var current = null, body = null;
      coll.fields.forEach(function (def) {
        if (def.group !== current) {
          current = def.group;
          body = el('div', { class: 'group-body' });
          var det = el('details', { class: 'group' }, [el('summary', { text: current }), body]);
          det._def = def;
          det.open = !!def.open;
          fieldset.appendChild(det);
        }
        body.appendChild(widgets[def.key].node);
      });
      [].forEach.call(fieldset.querySelectorAll('details.group'), function (det) {
        var has = coll.fields.some(function (f) {
          if (f.group !== det.querySelector('summary').textContent) return false;
          var v = widgets[f.key].get && widgets[f.key].get();
          return Array.isArray(v) ? v.length > 0 : (f.type !== 'checkbox' && f.type !== 'select' && f.type !== 'slug' && !!v && !ctx.isNew);
        });
        if (has) det.open = true;
      });
    } else {
      coll.fields.forEach(function (def) { fieldset.appendChild(widgets[def.key].node); });
    }
    fieldset.className = 'form';
    form.appendChild(fieldset);

    function rowFrom(validate) {
      var row = {}, errors = [], firstBad = null;
      order.forEach(function (def) {
        var w = widgets[def.key];
        if (validate) {
          var m = w.check();
          if (m) { errors.push(def.label + ': ' + m); if (!firstBad) firstBad = w; }
        }
        row[def.key] = w.get();
      });
      if (validate && ctx.isNew && coll.pk === 'id' && ctx.existingIds && ctx.existingIds.indexOf(row.id) >= 0) {
        widgets.id.setError('That ID is already used by another ' + coll.singular + '. Choose a different one.');
        errors.push('ID already in use'); if (!firstBad) firstBad = widgets.id;
      }
      return { row: row, errors: errors, firstBad: firstBad };
    }

    return {
      node: form,
      widgets: widgets,
      
      collect: function () {
        var r = rowFrom(true);
        var pending = [];
        order.forEach(function (def) {
          if (def.type === 'image') { var b = widgets[def.key].pending(); if (b) pending.push({ key: def.key, def: def, blob: b }); }
        });
        if (r.firstBad) { r.firstBad.focus(); }
        return { ok: r.errors.length === 0, errors: r.errors, row: r.row, pending: pending };
      },
      
      peek: function () {
        var r = rowFrom(false).row;
        order.forEach(function (def) {
          if (def.type === 'image') { var w = widgets[def.key]; r[def.key] = w.pending() ? 'pending-upload' : w.get(); }
        });
        return r;
      },
      previewImageSrc: function (key) { return widgets[key] && widgets[key].previewSrc ? widgets[key].previewSrc() : ''; }
    };
  };
}());
