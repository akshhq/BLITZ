
(function () {
  'use strict';

  var PP = window.PP;
  var el = PP.el;
  var sb = PP.sb;
  var COLLS = PP.COLLECTIONS;
  var COLL_KEYS = ['announcements', 'events', 'team', 'gallery', 'collaborations'];

  var main = document.getElementById('main');
  var topbar = document.getElementById('topbar');
  var mainnav = document.getElementById('mainnav');
  var whoami = document.getElementById('whoami');

  var me = null;               // { id, email, role }
  var recovery = false;        // arrived via a password-reset link
  var codeFlow = false;        // busy with the emailed-code reset (verifyOtp also raises a recovery event)
  var dirty = false;           // unsaved changes in an open form
  var IDLE_MS = 30 * 60 * 1000;
  var idleTimer = null;
  var MIN_PASSWORD = 10;

  function canEdit() { return !!me && (me.role === 'owner' || me.role === 'editor'); }
  function show(title, nodes) {
    PP.clear(main);
    var h1 = el('h1', { tabindex: '-1', text: title });
    main.appendChild(h1);
    [].concat(nodes || []).forEach(function (n) { if (n) main.appendChild(n); });
    document.title = title + ' · BLITZ Admin';
    h1.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return h1;
  }

  function showAuth(title, intro, body, links, notice) {
    topbar.hidden = true;
    PP.clear(main);
    var card = el('section', { class: 'auth', 'aria-labelledby': 'auth-title' }, [
      el('img', { src: '../assets/logo/blitz-logo.png', alt: '', width: '70', height: '40' }),
      el('h1', { id: 'auth-title', tabindex: '-1', text: title }),
      intro ? el('p', { class: 'muted', text: intro }) : null,
      notice ? el('div', { class: 'notice ' + (notice.error ? 'notice--error' : 'notice--ok'), role: notice.error ? 'alert' : 'status', text: notice.text }) : null,
      body,
      links ? el('div', { class: 'links' }, links) : null
    ]);
    main.appendChild(card);
    document.title = title + ' · BLITZ Admin';
    var first = card.querySelector('input:not([readonly])');
    (first || card.querySelector('h1')).focus({ preventScroll: true });
  }

  function field(label, input, hint) {
    var id = PP.uid('a');
    input.id = id;
    return el('div', { class: 'field' }, [el('label', { for: id, text: label }), input, hint ? el('div', { class: 'hint', text: hint }) : null]);
  }

  function linkButton(text, onclick) { return el('button', { type: 'button', class: 'linkbtn', text: text, onclick: onclick }); }

  function passwordProblem(pw, confirm, email) {
    if (pw.length < MIN_PASSWORD) return 'Use at least ' + MIN_PASSWORD + ' characters.';
    if (email && pw.toLowerCase() === String(email).toLowerCase()) return 'The password must not be your email address.';
    if (pw !== confirm) return 'The two passwords do not match.';
    return '';
  }
  function showSetup() {
    showAuth('Not connected yet', 'This panel needs the project URL and public key.', el('div', { class: 'notice notice--error', role: 'alert' }, [
      'Open ', el('code', { text: 'config.js' }), ' in the site folder and fill in ', el('code', { text: 'supabaseUrl' }), ' and ', el('code', { text: 'supabaseKey' }), '. See the setup guide (SETUP-ADMIN.md).'
    ]));
  }
  var failures = 0, lockedUntil = 0;

  function showLogin(notice) {
    stopIdle(); me = null; dirty = false;
    var email = el('input', { type: 'email', name: 'email', autocomplete: 'username', required: 'required', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false' });
    var pw = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: 'required' });
    var submit = el('button', { type: 'submit', class: 'btn btn--primary', text: 'Sign in' });
    var msg = el('div', { class: 'err', role: 'alert', hidden: true });
    var form = el('form', { novalidate: 'novalidate' }, [field('Email', email), field('Password', pw), msg, submit]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.hidden = true;
      var wait = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (wait > 0) { msg.textContent = 'Too many attempts. Please wait ' + wait + ' seconds.'; msg.hidden = false; return; }
      if (!email.value.trim() || !pw.value) { msg.textContent = 'Enter your email and password.'; msg.hidden = false; return; }
      submit.disabled = true; submit.textContent = 'Signing in…';
      sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value }).then(function (res) {
        submit.disabled = false; submit.textContent = 'Sign in';
        if (res.error) {
          var e = res.error;
          if (!e.status || e.name === 'AuthRetryableFetchError' || /fetch|network/i.test(e.message || '')) {
            msg.textContent = 'Could not reach the server. Check your internet connection and try again.';
            msg.hidden = false; return;
          }
          if (e.status === 429 || /rate|too many/i.test(e.message || '')) {
            msg.textContent = 'Too many attempts. Please wait a few minutes and try again.'; msg.hidden = false; return;
          }
          failures += 1;
          if (failures >= 5) { lockedUntil = Date.now() + Math.min(300, 30 * (failures - 4)) * 1000; }
          msg.textContent = 'The email or password is incorrect.';
          msg.hidden = false; pw.value = ''; pw.focus();
          return;
        }
        failures = 0; enter();
      });
    });
    showAuth('Sign in', 'BLITZ website administration. Accounts are created by an owner; there is no sign-up.', form, [linkButton('Forgot your password?', function () { showForgot(email.value.trim()); })], notice);
  }

  function showForgot(prefill) {
    var email = el('input', { type: 'email', name: 'email', autocomplete: 'username', required: 'required', value: prefill || '', autocapitalize: 'none', spellcheck: 'false' });
    var submit = el('button', { type: 'submit', class: 'btn btn--primary', text: 'Send reset email' });
    var msg = el('div', { class: 'err', role: 'alert', hidden: true });
    var form = el('form', { novalidate: 'novalidate' }, [field('Email', email), msg, submit]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(value)) { msg.textContent = 'Enter the email address of your account.'; msg.hidden = false; return; }
      submit.disabled = true; submit.textContent = 'Sending…';
      sb.auth.resetPasswordForEmail(value, { redirectTo: window.location.origin + window.location.pathname }).then(function () {
        showResetCode(value);
      });
    });
    showAuth('Reset your password', 'We will email a link and a 6-digit code to the address on your account.', form, [linkButton('Back to sign in', function () { showLogin(); })]);
  }

  function showResetCode(emailValue) {
    var email = el('input', { type: 'email', name: 'email', value: emailValue, readOnly: true, autocomplete: 'username' });
    var code = el('input', { type: 'text', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', required: 'required' });
    var pw = el('input', { type: 'password', name: 'new-password', autocomplete: 'new-password', required: 'required' });
    var pw2 = el('input', { type: 'password', name: 'confirm-password', autocomplete: 'new-password', required: 'required' });
    var submit = el('button', { type: 'submit', class: 'btn btn--primary', text: 'Set new password' });
    var msg = el('div', { class: 'err', role: 'alert', hidden: true });
    var form = el('form', { novalidate: 'novalidate' }, [
      field('Email', email), field('Code from the email', code, 'Or simply click the link in the email instead.'),
      field('New password', pw, 'At least ' + MIN_PASSWORD + ' characters.'), field('Repeat new password', pw2), msg, submit
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg.hidden = true;
      var problem = passwordProblem(pw.value, pw2.value, emailValue);
      if (!code.value.trim()) problem = 'Enter the code from the email.';
      if (problem) { msg.textContent = problem; msg.hidden = false; return; }
      submit.disabled = true; submit.textContent = 'Saving…';
      codeFlow = true;
      sb.auth.verifyOtp({ email: emailValue, token: code.value.trim(), type: 'recovery' }).then(function (res) {
        if (res.error) { throw new Error('That code is wrong or has expired. Request a new one.'); }
        return sb.auth.updateUser({ password: pw.value });
      }).then(function (res) {
        if (res.error) throw new Error(res.error.message);
        codeFlow = false; PP.toast('Password updated.', 'ok'); enter();
      }).catch(function (err) {
        codeFlow = false;
        submit.disabled = false; submit.textContent = 'Set new password';
        msg.textContent = err.message; msg.hidden = false;
      });
    });
    showAuth('Check your email', 'If that address belongs to an administrator, we have sent a reset link and a code. It expires after an hour.', form, [linkButton('Back to sign in', function () { showLogin(); })], { text: 'Reset email requested.' });
  }

  function showSetPassword() {
    var pw = el('input', { type: 'password', name: 'new-password', autocomplete: 'new-password', required: 'required' });
    var pw2 = el('input', { type: 'password', name: 'confirm-password', autocomplete: 'new-password', required: 'required' });
    var submit = el('button', { type: 'submit', class: 'btn btn--primary', text: 'Save new password' });
    var msg = el('div', { class: 'err', role: 'alert', hidden: true });
    var form = el('form', { novalidate: 'novalidate' }, [field('New password', pw, 'At least ' + MIN_PASSWORD + ' characters.'), field('Repeat new password', pw2), msg, submit]);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg.hidden = true;
      var problem = passwordProblem(pw.value, pw2.value, null);
      if (problem) { msg.textContent = problem; msg.hidden = false; return; }
      submit.disabled = true; submit.textContent = 'Saving…';
      sb.auth.updateUser({ password: pw.value }).then(function (res) {
        if (res.error) { submit.disabled = false; submit.textContent = 'Save new password'; msg.textContent = res.error.message; msg.hidden = false; return; }
        recovery = false; PP.toast('Password updated.', 'ok'); enter();
      });
    });
    showAuth('Choose a new password', 'You followed a reset link. Set a new password to continue.', form);
  }

  function showNotAdmin(email) {
    showAuth('No access', null, el('div', null, [
      el('p', { text: 'You are signed in as ' + email + ', but this account has not been given access to the admin panel. Ask an owner to add you.' }),
      el('button', { type: 'button', class: 'btn', text: 'Sign out', onclick: signOut })
    ]));
  }
  function signOut(notice) {
    return sb.auth.signOut().then(function () { showLogin(notice && notice.text ? notice : null); });
  }
  document.getElementById('signout').addEventListener('click', function () { guardNav(function () { signOut(); }); });

  function startIdle() {
    stopIdle();
    var reset = function () {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { signOut({ text: 'You were signed out after 30 minutes of inactivity.' }); }, IDLE_MS);
    };
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (t) { document.addEventListener(t, reset, { passive: true }); });
    startIdle.reset = reset; reset();
  }
  function stopIdle() { clearTimeout(idleTimer); }

  function enter() {
    sb.auth.getUser().then(function (res) {
      if (res.error || !res.data || !res.data.user) throw new Error('no user');
      var user = res.data.user;
      if (recovery) return null; // a reset link was followed: the new-password screen must come first
      return sb.from('admins').select('role').eq('user_id', user.id).maybeSingle().then(function (r) {
        if (recovery) return;
        if (r.error) throw r.error;
        if (!r.data) { showNotAdmin(user.email); return; }
        me = { id: user.id, email: user.email, role: r.data.role };
        topbar.hidden = false;
        whoami.textContent = me.email + ' · ' + me.role;
        buildNav();
        startIdle();
        route();
      });
    }).catch(function () { showLogin({ error: true, text: 'Please sign in again.' }); });
  }
  function buildNav() {
    PP.clear(mainnav);
    var items = [['#/', 'Dashboard']].concat(COLL_KEYS.map(function (k) { return ['#/' + k, COLLS[k].label]; })).concat([['#/activity', 'Activity'], ['#/account', 'Account']]);
    items.forEach(function (it) {
      var a = el('a', { href: it[0], text: it[1] });
      a.addEventListener('click', function (e) {
        if (dirty) { e.preventDefault(); guardNav(function () { window.location.hash = it[0]; }); }
      });
      mainnav.appendChild(a);
    });
  }

  function markNav(hash) {
    [].forEach.call(mainnav.querySelectorAll('a'), function (a) {
      var target = a.getAttribute('href');
      var on = target === '#/' ? (hash === '#/' || hash === '' || hash === '#') : hash.indexOf(target) === 0;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function guardNav(proceed) {
    if (!dirty) return proceed();
    PP.confirm({ title: 'Discard unsaved changes?', message: 'You have changes that have not been saved. If you leave now they will be lost.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true }).then(function (ok) {
      if (ok) { dirty = false; proceed(); }
    });
  }
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  function go(hash) { dirty = false; window.location.hash = hash; }

  function route() {
    if (!me) return;
    dirty = false;
    var hash = window.location.hash || '#/';
    if (/^#(access_token|error)/.test(hash)) return; // auth redirect leftovers
    var parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    markNav(hash);
    var key = parts[0];
    if (key === '' || key === undefined) return viewDashboard();
    if (key === 'activity') return viewActivity();
    if (key === 'account') return viewAccount();
    if (key === 'export') return viewExport();
    if (COLLS[key]) {
      if (parts[1] === 'new') return viewEdit(key, null);
      if (parts[1] === 'edit' && parts[2]) return viewEdit(key, parts[2]);
      return viewList(key);
    }
    return viewDashboard();
  }
  window.addEventListener('hashchange', route);
  function viewDashboard() {
    var list = el('ul', { class: 'list' });
    show('Dashboard', [
      el('p', { class: 'muted', text: 'Everything you save here appears on the website straight away. Visitors who already have the page open see it within a couple of minutes.' }),
      el('div', { id: 'dash-notice' }),
      list,
      el('p', null, [el('a', { class: 'btn', href: '#/export', text: 'Backup / export a snapshot' })])
    ]);
    COLL_KEYS.forEach(function (k) {
      var c = COLLS[k];
      var count = el('span', { class: 'item-meta', text: 'Counting…' });
      list.appendChild(el('li', { class: 'item' }, [
        el('span', { class: 'item-thumb--empty', 'aria-hidden': 'true', text: c.label.slice(0, 2) }),
        el('div', { class: 'item-main' }, [el('div', { class: 'item-title', text: c.label }), count]),
        el('div', { class: 'item-actions' }, [
          el('a', { class: 'btn btn--small', href: '#/' + k, text: 'Manage' }),
          canEdit() ? el('a', { class: 'btn btn--small btn--primary', href: '#/' + k + '/new', text: 'New ' + c.singular }) : null
        ])
      ]));
      Promise.all([
        sb.from(c.table).select('*', { count: 'exact', head: true }),
        sb.from(c.table).select('*', { count: 'exact', head: true }).eq('published', false)
      ]).then(function (r) {
        if (r[0].error) { count.textContent = 'Could not load.'; return; }
        count.textContent = r[0].count + ' in total' + (r[1].count ? ' · ' + r[1].count + ' draft' + (r[1].count === 1 ? '' : 's') : '');
      });
    });
    if (!canEdit()) document.getElementById('dash-notice').appendChild(el('p', { class: 'notice', text: 'Your role is “viewer”: you can look at everything but not change it.' }));
  }
  function thumbFor(coll, row) {
    var key = coll.item.thumb;
    var src = key && row[key] ? PP.imgSrc(row[key]) : '';
    if (src) return el('img', { class: 'item-thumb' + (coll.item.round ? ' item-thumb--round' : ''), src: src, alt: '', width: '56', height: '56', loading: 'lazy' });
    return el('span', { class: 'item-thumb--empty' + (coll.item.round ? ' item-thumb--round' : ''), 'aria-hidden': 'true', text: key ? 'No image' : '' });
  }

  function viewList(key) {
    var coll = COLLS[key];
    var rows = [];
    var search = el('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search ' + coll.label.toLowerCase(), autocomplete: 'off' });
    var status = el('select', { 'aria-label': 'Filter by status' }, [el('option', { value: '', text: 'All' }), el('option', { value: 'live', text: 'Published' }), el('option', { value: 'draft', text: 'Drafts' })]);
    var listHost = el('div');
    var info = el('p', { class: 'hint', hidden: true });
    show(coll.label, [
      el('div', { class: 'pagehead' }, [
        el('p', { class: 'muted', text: coll.ordered ? 'Use the arrows to change the order shown on the website.' : 'Newest first.' }),
        canEdit() ? el('a', { class: 'btn btn--primary', href: '#/' + key + '/new', text: 'New ' + coll.singular }) : null
      ]),
      el('div', { class: 'toolbar' }, [search, status]), info, listHost
    ]);
    listHost.appendChild(el('p', { class: 'loading', text: 'Loading…' }));

    function load(focusSpec) {
      var q = sb.from(coll.table).select('*').order(coll.order.column, { ascending: coll.order.ascending, nullsFirst: !!coll.order.nullsFirst });
      if (coll.ordered) q = q.order(coll.groupBy ? 'name' : 'created_at', { ascending: true });
      q.then(function (res) {
        if (res.error) { PP.clear(listHost).appendChild(el('p', { class: 'notice notice--error', role: 'alert', text: PP.explain(res.error) })); return; }
        rows = res.data; draw(focusSpec);
      });
    }

    function filtered() {
      var term = search.value.trim().toLowerCase();
      return rows.filter(function (r) {
        if (status.value === 'live' && !r.published) return false;
        if (status.value === 'draft' && r.published) return false;
        if (term && (coll.item.title(r) + ' ' + (coll.item.meta(r) || '')).toLowerCase().indexOf(term) < 0) return false;
        return true;
      });
    }

    function draw(focusSpec) {
      PP.clear(listHost);
      var filtering = !!(search.value.trim() || status.value);
      info.hidden = !(coll.ordered && filtering);
      info.textContent = 'Reordering is available when no search or filter is active.';
      var shown = filtered();
      if (!shown.length) { listHost.appendChild(el('p', { class: 'notice', text: rows.length ? 'Nothing matches your search.' : 'Nothing here yet.' })); return; }

      function itemNode(r, indexInGroup, groupSize) {
        var isLive = r.published;
        var actions = el('div', { class: 'item-actions' });
        var titleText = coll.item.title(r);
        actions.appendChild(el('a', { class: 'btn btn--small', href: '#/' + key + '/edit/' + encodeURIComponent(r[coll.pk]), text: canEdit() ? 'Edit' : 'View', 'aria-label': (canEdit() ? 'Edit ' : 'View ') + titleText }));
        if (canEdit()) {
          if (coll.ordered && !filtering) {
            actions.appendChild(el('button', { type: 'button', class: 'btn btn--small', text: '↑', 'aria-label': 'Move ' + titleText + ' up', dataset: { act: 'up', id: r.id }, disabled: indexInGroup === 0, onclick: function () { move(r, -1); } }));
            actions.appendChild(el('button', { type: 'button', class: 'btn btn--small', text: '↓', 'aria-label': 'Move ' + titleText + ' down', dataset: { act: 'down', id: r.id }, disabled: indexInGroup === groupSize - 1, onclick: function () { move(r, 1); } }));
          }
          actions.appendChild(el('button', { type: 'button', class: 'btn btn--small', text: isLive ? 'Unpublish' : 'Publish', 'aria-label': (isLive ? 'Unpublish ' : 'Publish ') + titleText, onclick: function () { togglePublished(r); } }));
          actions.appendChild(el('button', { type: 'button', class: 'btn btn--small btn--danger', text: 'Delete', 'aria-label': 'Delete ' + titleText, onclick: function () { remove(r); } }));
        }
        return el('li', { class: 'item' }, [
          thumbFor(coll, r),
          el('div', { class: 'item-main' }, [
            el('div', { class: 'item-title', text: titleText }),
            el('div', { class: 'item-meta', text: coll.item.meta(r) || '' }),
            el('span', { class: 'badge ' + (isLive ? 'badge--live' : 'badge--draft'), text: isLive ? 'Published' : 'Draft' })
          ]),
          actions
        ]);
      }

      if (coll.groupBy) {
        PP.TIERS.forEach(function (t) {
          var inGroup = rows.filter(function (r) { return r[coll.groupBy] === t.value; });
          var visible = shown.filter(function (r) { return r[coll.groupBy] === t.value; });
          if (!visible.length) return;
          listHost.appendChild(el('h2', { class: 'group-title', text: t.label + ' (' + visible.length + ')' }));
          var ul = el('ul', { class: 'list' });
          visible.forEach(function (r) { ul.appendChild(itemNode(r, inGroup.indexOf(r), inGroup.length)); });
          listHost.appendChild(ul);
        });
      } else {
        var ul = el('ul', { class: 'list' });
        shown.forEach(function (r) { ul.appendChild(itemNode(r, rows.indexOf(r), rows.length)); });
        listHost.appendChild(ul);
      }
      if (focusSpec) {
        var target = listHost.querySelector('[data-act="' + focusSpec.act + '"][data-id="' + focusSpec.id + '"]:not(:disabled)') || listHost.querySelector('[data-id="' + focusSpec.id + '"]:not(:disabled)');
        if (target) target.focus();
      }
    }

    function move(row, delta) {
      var group = rows.filter(function (r) { return !coll.groupBy || r[coll.groupBy] === row[coll.groupBy]; });
      var i = group.indexOf(row), j = i + delta;
      if (j < 0 || j >= group.length) return;
      var next = group.slice(); next.splice(i, 1); next.splice(j, 0, row);
      var updates = [];
      next.forEach(function (r, idx) {
        var want = (idx + 1) * 10;
        if (r.sort_order !== want) updates.push({ r: r, want: want });
      });
      Promise.all(updates.map(function (u) { return sb.from(coll.table).update({ sort_order: u.want }).eq('id', u.r.id).then(function (res) { if (res.error) throw res.error; }); }))
        .then(function () { PP.toast('Order updated.', 'ok'); load({ act: delta < 0 ? 'up' : 'down', id: row.id }); })
        .catch(function (err) { PP.toast(PP.explain(err), 'error'); load(); });
    }

    function togglePublished(row) {
      var want = !row.published;
      sb.from(coll.table).update({ published: want }).eq(coll.pk, row[coll.pk]).then(function (res) {
        if (res.error) { PP.toast(PP.explain(res.error), 'error'); return; }
        PP.toast(want ? 'Published. It is now live on the website.' : 'Unpublished. It is hidden from the website.', 'ok');
        load({ act: 'pub', id: row.id });
      });
    }

    function remove(row) {
      PP.confirm({ title: 'Delete “' + coll.item.title(row) + '”?', message: 'It disappears from the website immediately. You can bring it back from the Activity page.', confirmLabel: 'Delete', danger: true }).then(function (ok) {
        if (!ok) return;
        sb.from(coll.table).delete().eq(coll.pk, row[coll.pk]).then(function (res) {
          if (res.error) { PP.toast(PP.explain(res.error), 'error'); return; }
          PP.toast('Deleted. You can restore it from Activity.', 'ok');
          load();
        });
      });
    }

    search.addEventListener('input', function () { draw(); });
    status.addEventListener('change', function () { draw(); });
    load();
  }
  function previewEvent(form) {
    var row = form.peek();
    var mapped = PP.map.event(Object.assign({}, row, { image: null }));
    var src = form.previewImageSrc('image');
    if (src) mapped.image = 'preview-image'; // passes the renderer's check; the real picture is swapped in by preview.js
    return { event: mapped, imageSrc: src || '' };
  }

  function viewEdit(key, id) {
    var coll = COLLS[key];
    var isNew = id === null;
    show(isNew ? 'New ' + coll.singular : 'Edit ' + coll.singular, [el('p', { class: 'loading', text: 'Loading…' })]);

    var loadRecord = isNew ? Promise.resolve({ data: {} }) : sb.from(coll.table).select('*').eq(coll.pk, id).maybeSingle();
    var loadIds = isNew && coll.pk === 'id' && coll.fields.some(function (f) { return f.type === 'slug'; })
      ? sb.from(coll.table).select('id') : Promise.resolve({ data: [] });

    Promise.all([loadRecord, loadIds]).then(function (res) {
      if (res[0].error) { show('Could not load', [el('p', { class: 'notice notice--error', role: 'alert', text: PP.explain(res[0].error) })]); return; }
      if (!res[0].data) { show('Not found', [el('p', { class: 'notice', text: 'That ' + coll.singular + ' does not exist (it may have been deleted).' }), el('a', { class: 'btn', href: '#/' + key, text: 'Back to ' + coll.label.toLowerCase() })]); return; }
      buildEditor(coll, key, isNew, res[0].data, (res[1].data || []).map(function (r) { return r.id; }));
    });
  }

  function buildEditor(coll, key, isNew, record, existingIds) {
    var readOnly = !canEdit();
    var previewWin = null, previewReady = false, previewTimer = null;
    var form = PP.buildForm(coll, record, {
      isNew: isNew, readOnly: readOnly, existingIds: existingIds,
      onChange: function () { dirty = true; schedulePreview(); }
    });

    var saveBtn = el('button', { type: 'submit', class: 'btn btn--primary', text: isNew ? 'Create ' + coll.singular : 'Save changes' });
    var cancel = el('a', { class: 'btn', href: '#/' + key, text: readOnly ? 'Back' : 'Cancel' });
    cancel.addEventListener('click', function (e) { if (dirty) { e.preventDefault(); guardNav(function () { go('#/' + key); }); } });
    var actions = el('div', { class: 'form-actions' }, readOnly ? [cancel] : [saveBtn, cancel]);
    form.node.appendChild(actions);

    var editorChildren = [el('div', null, [
      readOnly ? el('p', { class: 'notice', text: 'View only: your role does not allow changes.' }) : null,
      form.node
    ])];
    var frame = null;
    if (coll.preview) {
      frame = el('iframe', { class: 'preview-frame', src: 'preview.html', title: 'Live preview of the event page', sandbox: 'allow-scripts' }); // no allow-same-origin: the preview cannot reach this page's login session
      editorChildren.push(el('aside', { class: 'preview-box', 'aria-label': 'Preview' }, [el('h2', { text: 'Preview' }), el('p', { class: 'hint', text: 'Updates as you type. This is how the event page will look.' }), frame]));
      window.addEventListener('message', onPreviewMessage);
    }
    var h1 = show((isNew ? 'New ' : 'Edit ') + coll.singular, [el('div', { class: 'editor' + (coll.preview ? ' editor--preview' : '') }, editorChildren)]);
    dirty = false;

    function onPreviewMessage(e) {
      if (!frame || e.source !== frame.contentWindow) return; // sandboxed frame has an opaque origin: identify it by window
      if (e.data && e.data.type === 'preview-ready') { previewReady = true; sendPreview(); }
      if (e.data && e.data.type === 'preview-height') frame.style.height = Math.max(420, Number(e.data.height) || 420) + 'px';
    }
    function sendPreview() {
      if (!frame || !previewReady || !frame.isConnected || !frame.contentWindow) return; // editor may already be closed
      frame.contentWindow.postMessage(Object.assign({ type: 'render' }, previewEvent(form)), '*'); // only preview text goes across
    }
    function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(sendPreview, 250); }
    var stop = function () { clearTimeout(previewTimer); window.removeEventListener('message', onPreviewMessage); window.removeEventListener('hashchange', stop); };
    window.addEventListener('hashchange', stop);

    form.node.addEventListener('submit', function (e) {
      e.preventDefault();
      if (readOnly) return;
      var result = form.collect();
      if (!result.ok) {
        PP.toast('Please fix ' + result.errors.length + ' problem' + (result.errors.length === 1 ? '' : 's') + ' and save again.', 'error');
        return;
      }
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      var row = Object.assign({}, result.row);
      result.pending.reduce(function (chain, p) {
        return chain.then(function () {
          return PP.uploadImage(p.def.folder, p.blob).then(function (path) { row[p.key] = path; form.widgets[p.key].commit(path); });
        });
      }, Promise.resolve()).then(function () {
        if (isNew && coll.ordered) {
          return sb.from(coll.table).select('sort_order').order('sort_order', { ascending: false }).limit(1).then(function (r) {
            row.sort_order = ((r.data && r.data[0] && r.data[0].sort_order) || 0) + 10;
          });
        }
      }).then(function () {
        if (isNew) return sb.from(coll.table).insert(row);
        var change = Object.assign({}, row); delete change[coll.pk];
        return sb.from(coll.table).update(change).eq(coll.pk, record[coll.pk]);
      }).then(function (res) {
        if (res && res.error) throw res.error;
        PP.toast(isNew ? 'Created. It is now on the website.' : 'Saved. The website is updated.', 'ok');
        dirty = false; go('#/' + key);
      }).catch(function (err) {
        saveBtn.disabled = false; saveBtn.textContent = isNew ? 'Create ' + coll.singular : 'Save changes';
        PP.toast(PP.explain(err), 'error');
      });
    });
    h1.focus({ preventScroll: true });
  }
  var TABLE_LABEL = { announcements: 'Announcement', events: 'Event', team_members: 'Team member', gallery_items: 'Gallery item', collaborations: 'Collaboration' };

  function rowTitle(r) { return r ? (r.title || r.name || r.id) : ''; }

  function viewActivity() {
    var host = el('div', null, [el('p', { class: 'loading', text: 'Loading…' })]);
    show('Activity', [el('p', { class: 'muted', text: 'The last 100 changes. Use “Restore” to bring back a deleted item or an earlier version.' }), host]);
    Promise.all([
      sb.from('content_history').select('*').order('changed_at', { ascending: false }).limit(100),
      sb.from('admins').select('user_id,email')
    ]).then(function (res) {
      if (res[0].error) { PP.clear(host).appendChild(el('p', { class: 'notice notice--error', role: 'alert', text: PP.explain(res[0].error) })); return; }
      var names = {};
      (res[1].data || []).forEach(function (a) { names[a.user_id] = a.email; });
      PP.clear(host);
      if (!res[0].data.length) { host.appendChild(el('p', { class: 'notice', text: 'No changes recorded yet.' })); return; }
      var ul = el('ul', { class: 'history' });
      res[0].data.forEach(function (h) {
        var snap = h.op === 'DELETE' ? h.old_row : h.new_row;
        var who = h.changed_by === me.id ? 'you' : (names[h.changed_by] || (h.changed_by ? 'another admin' : 'the database'));
        var line = el('div', null, [
          el('span', { class: 'op op--' + h.op, text: h.op }), ' ',
          el('strong', { text: (TABLE_LABEL[h.table_name] || h.table_name) + ': ' + rowTitle(snap) }),
          el('div', { class: 'item-meta', text: PP.formatDateTime(h.changed_at) + ' by ' + who })
        ]);
        var li = el('li', null, [line]);
        if (canEdit() && h.op !== 'INSERT' && h.old_row) {
          li.appendChild(el('button', { type: 'button', class: 'btn btn--small', text: h.op === 'DELETE' ? 'Restore' : 'Restore this earlier version', onclick: function () { restore(h); } }));
        }
        ul.appendChild(li);
      });
      host.appendChild(ul);
    });

    function restore(h) {
      PP.confirm({ title: 'Restore this version?', message: 'The ' + (TABLE_LABEL[h.table_name] || 'item').toLowerCase() + ' “' + rowTitle(h.old_row) + '” goes back to how it was ' + PP.formatDateTime(h.changed_at) + ' (before that change). The website updates immediately.', confirmLabel: 'Restore' }).then(function (ok) {
        if (!ok) return;
        var row = Object.assign({}, h.old_row);
        delete row.created_at; delete row.updated_at; delete row.updated_by;
        sb.from(h.table_name).upsert(row, { onConflict: 'id' }).then(function (res) {
          if (res.error) { PP.toast(PP.explain(res.error), 'error'); return; }
          PP.toast('Restored.', 'ok'); viewActivity();
        });
      });
    }
  }
  function viewAccount() {
    var pw = el('input', { type: 'password', name: 'new-password', autocomplete: 'new-password' });
    var pw2 = el('input', { type: 'password', name: 'confirm-password', autocomplete: 'new-password' });
    var msg = el('div', { class: 'err', role: 'alert', hidden: true });
    var submit = el('button', { type: 'submit', class: 'btn btn--primary', text: 'Change password' });
    var form = el('form', { class: 'form', novalidate: 'novalidate' }, [field('New password', pw, 'At least ' + MIN_PASSWORD + ' characters.'), field('Repeat new password', pw2), msg, submit]);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); msg.hidden = true;
      var p = passwordProblem(pw.value, pw2.value, me.email);
      if (p) { msg.textContent = p; msg.hidden = false; return; }
      submit.disabled = true;
      sb.auth.updateUser({ password: pw.value }).then(function (res) {
        submit.disabled = false;
        if (res.error) { msg.textContent = res.error.message; msg.hidden = false; return; }
        pw.value = ''; pw2.value = ''; PP.toast('Password changed.', 'ok');
      });
    });
    show('Account', [
      el('p', null, ['Signed in as ', el('strong', { text: me.email }), ' with the role ', el('strong', { text: me.role }), '.']),
      el('p', { class: 'hint', text: 'Roles: owner and editor can change content; viewer can only look. Roles are managed by an owner in the database, not here.' }),
      el('h2', { text: 'Change password' }), form
    ]);
  }
  function viewExport() {
    var btn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Download data.js' });
    btn.addEventListener('click', function () {
      btn.disabled = true;
      sb.rpc('site_content').then(function (res) {
        btn.disabled = false;
        var mapped = res.error ? null : PP.map.all(res.data, { allowEmpty: true });
        if (!mapped) { PP.toast(PP.explain(res.error) || 'Could not read the content.', 'error'); return; }
        var base = window.BLITZ_DATA || {};
        var out = Object.assign({}, base, mapped); // keeps contact details and any other fixed keys
        var text = '\n' +
          'window.BLITZ_DATA = ' + JSON.stringify(out, null, 2) + ';\n';
        var url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        var a = el('a', { href: url, download: 'data.js' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        PP.toast('data.js downloaded.', 'ok');
      });
    });
    show('Backup / export', [
      el('p', { text: 'The website reads live data, so you never have to do this for edits to show up. Export a snapshot only before handing over a new zip of the site: it refreshes the fallback copy used when the database is unreachable and the text shown to visitors without JavaScript.' }),
      el('ol', null, [
        el('li', { text: 'Click the button below to download data.js.' }),
        el('li', { text: 'Replace data.js in the site folder with it (optionally run: node tools/sync-noscript.js).' }),
        el('li', { text: 'Zip the site folder and hand it over as usual.' })
      ]),
      canEdit() ? btn : el('p', { class: 'notice', text: 'Viewers cannot export.' })
    ]);
  }
  if (window.top !== window.self) { document.documentElement.textContent = ''; return; }

  if (!PP.configured || !sb) { showSetup(); return; }

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') { if (codeFlow) return; recovery = true; setTimeout(showSetPassword, 0); }
    else if (event === 'SIGNED_OUT' && me) { setTimeout(function () { showLogin(); }, 0); }
  });

  sb.auth.getSession().then(function (res) {
    if (PP.recoveryInUrl || recovery) { recovery = true; showSetPassword(); return; }
    if (res.data && res.data.session) enter(); else showLogin();
  });
}());
