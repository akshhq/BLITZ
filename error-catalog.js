/*
 * BLITZ error catalog.
 *
 * One list of every machine-readable error code the site and the Prezi Panel can raise, with the
 * text a person sees and what they can do about it. It has no dependencies and works both in the
 * browser (window.BLITZ_ERROR_CATALOG) and in Node (require) so tests can check it.
 *
 * Rules for this file:
 *  - `message` and `hint` are shown to visitors. Never put SQL, paths, tokens or admin details there.
 *  - `admin` (optional) is extra detail shown only inside the Prezi Panel.
 *  - Every code here must be documented in ERRORS.md (tools/validate-site.js enforces it).
 *  - `retryable: true` means the failure is usually temporary, so retrying a safe (read) request
 *    makes sense. It never means "retry a write automatically".
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BLITZ_ERROR_CATALOG = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var CATEGORIES = {
    NET: 'Network',
    DB: 'Database',
    SCH: 'Schema',
    AUTH: 'Authentication',
    PERM: 'Permission',
    VAL: 'Validation',
    DATA: 'Content',
    CFG: 'Configuration',
    IMG: 'Images and files',
    OP: 'Operation',
    JS: 'Script',
    HTTP: 'Web server'
  };

  function e(code, severity, retryable, title, message, hint, admin) {
    return { code: code, category: code.split('-')[1], severity: severity, retryable: retryable, title: title, message: message, hint: hint, admin: admin || '' };
  }

  var LIST = [
    // ---- Network -------------------------------------------------------------------------
    e('BLITZ-NET-001', 'warning', true, 'You are offline', 'Your device appears to be offline.', 'Reconnect to the internet and try again.'),
    e('BLITZ-NET-002', 'warning', true, 'Could not reach the server', 'We could not reach the server.', 'Check your internet connection and try again in a moment.'),
    e('BLITZ-NET-003', 'warning', true, 'The request timed out', 'The server took too long to respond.', 'Try again in a moment.'),
    e('BLITZ-NET-004', 'warning', true, 'Too many requests', 'Too many requests were sent in a short time.', 'Wait a minute and try again.'),

    // ---- Database ------------------------------------------------------------------------
    e('BLITZ-DB-001', 'error', true, 'Server error', 'The server reported an unexpected problem.', 'Try again in a moment. If it keeps happening, tell the BLITZ team.'),
    e('BLITZ-DB-002', 'warning', true, 'Service temporarily unavailable', 'The content service is temporarily unavailable.', 'Try again in a few minutes.',
      'The Supabase project may be paused, restarting or still loading its schema. Check the project dashboard.'),
    e('BLITZ-DB-003', 'error', false, 'Value rejected', 'The database rejected one of the values.', 'Check the fields for text that is too long, a wrong format, or a link that does not start with https://.'),
    e('BLITZ-DB-004', 'error', false, 'Already exists', 'An item with this web address (ID) already exists.', 'Choose a different ID.'),
    e('BLITZ-DB-005', 'error', false, 'Nothing was changed', 'The change was not saved because no record was updated.', 'The item may have been removed by someone else, or your role may not allow this change. Reload the list and try again.',
      'The request succeeded but affected zero rows. With row level security this usually means the policy filtered the row out.'),
    e('BLITZ-DB-006', 'error', false, 'Linked data conflict', 'This item is linked to other data and cannot be changed this way.', 'Review the related items and try again.'),
    e('BLITZ-DB-007', 'error', false, 'Request too large', 'The data being saved is too large.', 'Shorten the text or remove some entries and try again.'),

    // ---- Schema --------------------------------------------------------------------------
    e('BLITZ-SCH-001', 'error', false, 'Database column not recognised', 'The database does not recognise a field this form is trying to save.', 'Tell the BLITZ owner so the database can be checked.',
      'Either the column is missing or the PostgREST schema cache has not reloaded. Run the schema diagnostic query in ERRORS.md. Only if it reports the column missing, run the matching migration in supabase/, then run: NOTIFY pgrst, \'reload schema\';'),
    e('BLITZ-SCH-002', 'error', false, 'Database table not recognised', 'A table or view the site needs was not found.', 'Tell the BLITZ owner so the database can be checked.',
      'The table or view is missing, or the schema cache is stale. Compare the project with supabase/schema.sql using the diagnostic query in ERRORS.md.'),
    e('BLITZ-SCH-003', 'error', false, 'Database function not found', 'A database function the site needs was not found.', 'Tell the BLITZ owner so the database can be checked.',
      'The RPC function (normally public.site_content) is missing or has a different signature, or the schema cache is stale. Check it with the diagnostic query in ERRORS.md.'),

    // ---- Authentication ------------------------------------------------------------------
    e('BLITZ-AUTH-001', 'error', false, 'Sign-in failed', 'The email or password is incorrect.', 'Check them and try again, or use "Forgot your password?".'),
    e('BLITZ-AUTH-002', 'warning', false, 'Session expired', 'Your session has expired.', 'Sign in again to continue. Anything you typed is still on this page.'),
    e('BLITZ-AUTH-003', 'warning', false, 'Not signed in', 'You are not signed in.', 'Sign in and try again.'),
    e('BLITZ-AUTH-004', 'warning', true, 'Too many sign-in attempts', 'Too many sign-in attempts.', 'Wait a few minutes and try again.'),

    // ---- Permission ----------------------------------------------------------------------
    e('BLITZ-PERM-001', 'error', false, 'Permission denied', 'You do not have permission to do that.', 'Ask a BLITZ owner to check your role.',
      'Row level security or a missing grant rejected the request (SQLSTATE 42501). See "Authentication and RLS troubleshooting" in ERRORS.md.'),
    e('BLITZ-PERM-002', 'info', false, 'View only', 'Your role is view only, so changes are not allowed.', 'Ask a BLITZ owner if you need to edit content.'),
    e('BLITZ-PERM-003', 'error', false, 'No access', 'This account has not been given access to the admin panel.', 'Ask a BLITZ owner to add you.'),

    // ---- Validation ----------------------------------------------------------------------
    e('BLITZ-VAL-001', 'error', false, 'Please fix the highlighted fields', 'Some fields need attention before this can be saved.', 'Fix the fields marked in red and try again. Nothing has been saved.'),
    e('BLITZ-VAL-002', 'error', false, 'Invalid JSON file', 'The file is not valid JSON.', 'Download a fresh template and keep its structure intact.'),
    e('BLITZ-VAL-003', 'error', false, 'Template needs attention', 'The imported event does not match the template.', 'Fix the problems listed and import again. Nothing has been saved.'),
    e('BLITZ-VAL-004', 'error', false, 'Duplicate event ID', 'Another event already uses this ID.', 'Choose a different ID.'),
    e('BLITZ-VAL-005', 'error', false, 'Event details invalid', 'The extra event details are not valid or are too large.', 'Check the JSON in the "Template details" field.'),
    e('BLITZ-VAL-006', 'error', false, 'File not accepted', 'That file cannot be used.', 'Choose a PNG, JPEG or WebP image under the size limit.'),

    // ---- Content (public site) -----------------------------------------------------------
    e('BLITZ-DATA-001', 'info', false, 'Event not found', 'We could not find that event.', 'It may have been removed or the link may be wrong. Browse all events instead.'),
    e('BLITZ-DATA-002', 'info', false, 'Invalid event link', 'That event link is not valid.', 'Browse all events instead.'),
    e('BLITZ-DATA-003', 'warning', false, 'Some content was skipped', 'Some content could not be shown because it was incomplete.', 'The rest of the page is unaffected.'),
    e('BLITZ-DATA-004', 'warning', true, 'Live content unusable', 'The latest content from the server was empty or in an unexpected format.', 'Showing the last good copy instead. Try again in a moment.'),

    // ---- Configuration -------------------------------------------------------------------
    e('BLITZ-CFG-001', 'warning', false, 'Live updates not configured', 'Live updates are not set up correctly on this site.', 'The page is showing its built-in content.',
      'config.js is missing or invalid. It needs https://<project>.supabase.co and the public publishable/anon key. See README.md.'),
    e('BLITZ-CFG-002', 'warning', false, 'Content service address not found', 'The content service address does not look right.', 'The page is showing its built-in content.',
      'The API host answered but not as Supabase (HTTP 404), or the project URL in config.js points to the wrong project.'),
    e('BLITZ-CFG-003', 'warning', false, 'Content service key rejected', 'The content service rejected this site\'s public key.', 'The page is showing its built-in content.',
      'The key in config.js is wrong, revoked or belongs to a different project. Use the public publishable/anon key only, never a secret or service_role key.'),

    // ---- Images and files ----------------------------------------------------------------
    e('BLITZ-IMG-001', 'info', false, 'Image unavailable', 'An image could not be loaded.', 'The rest of the page is unaffected.'),
    e('BLITZ-IMG-002', 'error', false, 'Image upload failed', 'The image could not be uploaded.', 'Try again. Your other changes have not been saved yet.'),
    e('BLITZ-IMG-003', 'error', false, 'Storage not set up', 'The image storage area was not found.', 'Tell the BLITZ owner so storage can be checked.',
      'The "media" storage bucket is missing. It is created by supabase/schema.sql.'),

    // ---- Operation -----------------------------------------------------------------------
    e('BLITZ-OP-001', 'info', false, 'Already working on it', 'That action is already in progress.', 'Please wait for it to finish.'),
    e('BLITZ-OP-002', 'warning', false, 'Result not confirmed', 'We could not confirm whether the change was saved.', 'Check the list before trying again, so nothing is saved twice.'),
    e('BLITZ-OP-003', 'warning', false, 'Gave up retrying', 'The request kept failing, so we stopped trying.', 'Try again later.'),

    // ---- Script --------------------------------------------------------------------------
    e('BLITZ-JS-001', 'error', false, 'Something went wrong', 'Something unexpected went wrong on this page.', 'Reload the page. If it keeps happening, tell the BLITZ team.'),
    e('BLITZ-JS-002', 'error', false, 'Something went wrong', 'An action did not finish because of an unexpected problem.', 'Reload the page and try again.'),
    e('BLITZ-JS-003', 'error', true, 'A file failed to load', 'Part of this page failed to load.', 'Reload the page. Check your connection if it keeps happening.'),

    // ---- Web server (the static error pages) ---------------------------------------------
    e('BLITZ-HTTP-403', 'error', false, 'Access forbidden', 'You do not have access to this page.', 'Go back to the BLITZ homepage.'),
    e('BLITZ-HTTP-404', 'error', false, 'Page not found', 'We could not find the page you asked for.', 'Check the address, or use the links below.'),
    e('BLITZ-HTTP-500', 'error', true, 'Server error', 'The server hit a problem and could not finish your request.', 'Try again in a moment.'),
    e('BLITZ-HTTP-503', 'warning', true, 'Temporarily unavailable', 'The site is temporarily unavailable, perhaps for maintenance.', 'Please try again in a few minutes.')
  ];

  var BY_CODE = {};
  LIST.forEach(function (entry) { BY_CODE[entry.code] = entry; });

  // Columns that exist in supabase/schema.sql for public.events and are known to be missing from
  // projects created before they were added. Used only to point at the RIGHT migration.
  var KNOWN_EVENT_COLUMNS = {
    event_details: { type: 'jsonb', migration: 'supabase/migration_add_event_details.sql' },
    placeholder: { type: 'boolean', migration: 'supabase/migration_add_event_details.sql' },
    brochure: { type: 'text', migration: 'supabase/migration_add_brochure_and_logo.sql' },
    logo: { type: 'text', migration: 'supabase/migration_add_brochure_and_logo.sql' }
  };

  return {
    CATEGORIES: CATEGORIES,
    list: LIST,
    byCode: BY_CODE,
    get: function (code) { return BY_CODE[code] || BY_CODE['BLITZ-JS-001']; },
    has: function (code) { return Object.prototype.hasOwnProperty.call(BY_CODE, code); },
    KNOWN_EVENT_COLUMNS: KNOWN_EVENT_COLUMNS
  };
}));
