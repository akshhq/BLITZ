/*
 * Prezi Panel: read-only system check.
 *
 * It tells apart the different reasons the panel can fail to talk to Supabase (no connection, wrong project,
 * wrong key, missing table / column / function, stale schema cache, expired session, not an admin, storage
 * missing) by actually probing for each one. It never writes, never changes the schema and never runs SQL;
 * where a fix needs SQL it only points at the right file in supabase/ and at ERRORS.md.
 *
 *   PP.diagnose() -> Promise<[{ name, status: 'ok'|'problem'|'skipped', message }]>
 */
(function () {
  'use strict';

  var PP = window.PP;
  var E = window.BLITZ_ERRORS;
  var C = window.BLITZ_ERROR_CATALOG;
  if (!PP || !E) return;

  E.install({ ui: 'none' });          // the panel shows its own toasts, not the public site's bottom notices
  E.configure({ ui: 'none' });

  var EVENT_COLUMNS = ['id', 'title', 'date', 'time', 'location', 'description', 'category', 'layout', 'format', 'platform', 'participants',
    'speakers', 'key_points', 'winners', 'sessions', 'competition_sections', 'links', 'image', 'image_alt', 'logo', 'brochure',
    'event_details', 'placeholder', 'additional_info', 'published'];

  function privileged(key) {
    if (/^sb_secret_/.test(key)) return true;
    var parts = String(key).split('.');
    if (parts.length !== 3) return false;
    try { return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch (e) { return false; }
  }

  function step(name, fn) {
    return Promise.resolve().then(function () { return E.withTimeout(fn(), 12000, name); }).then(function (r) {
      return Object.assign({ name: name, status: 'ok', message: 'OK' }, r || {});
    }, function (err) {
      var n = E.report(err, { operation: 'diagnose', service: 'supabase', silent: true });
      return { name: name, status: 'problem', code: n.code, message: E.explain(n, { audience: 'admin', showCorrelation: false }) };
    });
  }

  function failFrom(res, ctx) {
    if (res && res.error) { var e = res.error; if (ctx) e.__ctx = ctx; throw e; }
  }

  PP.diagnose = function () {
    var out = [];
    function push(p) { return p.then(function (r) { out.push(r); return r; }); }
    var sb = PP.sb;

    return push(step('Configuration', function () {
      if (!PP.configured) return { status: 'problem', code: 'BLITZ-CFG-001', message: C.get('BLITZ-CFG-001').admin };
      if (privileged(PP.key)) return { status: 'problem', code: 'BLITZ-CFG-003', message: 'config.js contains a secret or service_role key. Remove it immediately, rotate that key in Supabase, and use only the public publishable/anon key.' };
      return { message: 'Project URL and public key are set, and the key is not a secret key.' };
    })).then(function (cfg) {
      if (cfg.status !== 'ok' || !sb) return [{ name: 'Remaining checks', status: 'skipped', message: 'Fix the configuration first.' }];
      var rest = [];
      var chain = Promise.resolve();
      function add(name, fn) { chain = chain.then(function () { return step(name, fn); }).then(function (r) { rest.push(r); }); }

      add('Connection and public content function', function () {
        return sb.rpc('site_content').then(function (res) {
          failFrom(res);
          return { message: 'The database answered and public.site_content() works.' };
        });
      });

      add('Your sign-in session', function () {
        return sb.auth.getUser().then(function (res) {
          if (res.error || !res.data || !res.data.user) throw res.error || { message: 'Auth session missing' };
          return { message: 'You are signed in and the session is accepted by the server.' };
        });
      });

      add('Admin access', function () {
        return sb.auth.getUser().then(function (res) {
          var uid = res.data && res.data.user && res.data.user.id;
          if (!uid) throw { message: 'Auth session missing' };
          return sb.from('admins').select('role').eq('user_id', uid).maybeSingle();
        }).then(function (res) {
          failFrom(res);
          if (!res.data) throw { code: '42501', message: 'permission denied: this account is not in public.admins' };
          return { message: 'Your role is "' + res.data.role + '"' + (res.data.role === 'viewer' ? ' (view only; saving will be refused).' : '.') };
        });
      });

      // One probe per event column, so every missing column is listed, not just the first one PostgREST complains about.
      add('Events table and columns', function () {
        var missing = [];
        var probes = EVENT_COLUMNS.map(function (col) {
          return sb.from('events').select(col).limit(0).then(function (res) {
            if (res.error) {
              var n = E.normalize(res.error, { service: 'supabase' });
              if (n.code === 'BLITZ-SCH-001') missing.push(col);
              else throw res.error;
            }
          });
        });
        return Promise.all(probes).then(function () {
          if (missing.length) {
            var migrations = {};
            missing.forEach(function (c) { if (C.KNOWN_EVENT_COLUMNS[c]) migrations[C.KNOWN_EVENT_COLUMNS[c].migration] = true; });
            var files = Object.keys(migrations);
            return {
              status: 'problem',
              code: 'BLITZ-SCH-001',
              message: 'The API does not recognise these columns on events: ' + missing.join(', ') + '. Either they are missing or the schema cache is stale. ' +
                (files.length
                  ? 'Run the diagnostic query in ERRORS.md. If it confirms they are missing, run ' + files.join(' and ') + '; if they exist, run NOTIFY pgrst, \'reload schema\';'
                  : 'Compare the project with supabase/schema.sql using the diagnostic query in ERRORS.md.')
            };
          }
          return { message: 'All ' + EVENT_COLUMNS.length + ' columns the panel uses are recognised.' };
        });
      });

      // Read-only probe: set_event_images() refuses an unknown event BEFORE it writes anything, so reaching that refusal proves it exists.
      add('Event images function', function () {
        return sb.rpc('set_event_images', { p_event_id: '__system-check__', p_images: [] }).then(function (res) {
          if (res.error && /^(PGRST202|42883)$/.test(String(res.error.code))) throw res.error;
          return { message: 'public.set_event_images() exists.' };
        });
      });

      add('Event image shapes', function () {
        return sb.from('event_images').select('aspect').limit(0).then(function (res) {
          if (res.error && /^(PGRST204|42703)$/.test(String(res.error.code))) return { status: 'problem', code: 'BLITZ-SCH-001', message: "The database has no 'aspect' column on event_images yet. Run supabase/migration_event_image_aspect.sql (after migration_event_images.sql); it is safe to run twice." };
          failFrom(res);
          return { message: 'event_images.aspect is there (16:9, 5:4 and 4:5 are supported).' };
        });
      });

      ['announcements', 'team_members', 'event_images', 'gallery_items', 'collaborations', 'content_history'].forEach(function (table) {
        add('Table ' + table, function () {
          return sb.from(table).select('*', { count: 'exact', head: true }).then(function (res) { failFrom(res); return { message: 'Readable.' }; });
        });
      });

      add('Image storage', function () {
        return sb.storage.from('media').list('', { limit: 1 }).then(function (res) {
          // A 404 here means the bucket is missing, not that the whole project address is wrong.
          if (res.error && (Number(res.error.status) === 404 || Number(res.error.statusCode) === 404 || /not found/i.test(res.error.message || ''))) throw { message: 'Bucket not found' };
          failFrom(res);
          return { message: 'The "media" bucket is reachable.' };
        });
      });

      return chain.then(function () { return rest; });
    }).then(function (rest) { return out.concat(rest); });
  };
}());
