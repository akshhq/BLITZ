# BLITZ errors: codes, causes and recovery

This file explains what the error messages on the BLITZ website and in the Prezi Panel mean, how to find the real cause, and how to recover. It documents only things that exist in this repository. Where something could not be verified, it is listed under [Known limitations](#11-known-limitations-and-unverified-checks).

Contents: [1 How it works](#1-how-errors-are-handled) · [2 Symptom to code](#2-symptom-to-code) · [3 Code reference](#3-error-code-reference) · [4 Schema diagnostics](#4-supabase-schema-diagnostic-queries) · [5 Schema cache](#5-schema-cache-recovery) · [6 Auth and RLS](#6-authentication-and-rls-troubleshooting) · [7 Failed publishing](#7-recovering-from-a-failed-event-publish) · [8 Hosting](#8-hosting-and-custom-error-pages) · [9 Local testing](#9-local-testing) · [10 GitHub Actions](#10-github-actions-and-secrets) · [11 Limitations](#11-known-limitations-and-unverified-checks)

## 1. How errors are handled

One shared system serves the public site and the Prezi Panel:

| File | Role |
|---|---|
| `error-catalog.js` | The only list of error codes, with the text people see and the recovery hint. |
| `error-handler.js` | Turns any failure (network, Supabase, auth, script) into a catalog code, hides secrets, avoids duplicate notices, retries safe reads, shows notices. |
| `error.css`, `error-page.js` | Styling and tiny behaviours for the notices and the static error pages. |
| `404.html` `403.html` `500.html` `503.html` `offline.html` | Static error pages (see [Hosting](#8-hosting-and-custom-error-pages)). |
| `prezi_panel/event-validator.js` | Checks an event against the same limits as the database **before** any write. |
| `prezi_panel/database-diagnostics.js` | The dashboard's read-only **Run system check** button. |
| `prezi_panel/operation-status.js` | Runs every panel write safely (see below). |

**Codes** look like `BLITZ-DB-005`: category, then number. A visitor sees a short plain message and the code. The panel shows more detail to signed-in admins, plus a correlation ID such as `BZ-k3f9-2a1c` that appears in the browser console next to the same failure, so you can match a screenshot to a log line.

**What is never shown or logged:** SQL, stack traces, file paths, tokens, API keys, emails, or database row contents. They are redacted before logging, and visitors only ever get the catalog text.

**Rules the panel follows for writes**

- The same action cannot run twice at once; buttons are disabled and relabelled while it runs.
- "Saved" appears only after the database confirmed it **and** at least one row actually changed. A write that row level security silently filtered out is reported as `BLITZ-DB-005`, not as success.
- A request that hangs ends in a time-out (30 s for writes, 60 s for image uploads), not an endless spinner.
- Failures keep everything you typed. Writes are **never** retried automatically; reads are retried at most twice, with backoff, and only for temporary failures (network, time-out, 5xx).
- If the connection drops *during* a create, the panel warns that the result is unknown. When you retry, it checks whether the earlier attempt landed and, if so, reports that instead of creating a duplicate or a false "already exists".
- If your session expires while editing, a sign-in dialog appears on top of the page; the form is untouched.

**What visitors see on the public site**

The site always works from the content bundled in `data.js`, then replaces it with live data. The attribute `data-content-source` on `<html>` is `live`, `cache` (a copy this browser saved, with its date) or `snapshot` (bundled content). If a live request fails you get a notice that says which of the last two you are looking at, with **Try again** when trying again could help. Transient failures are retried twice automatically before the notice appears. Leaving `config.js` blank on purpose (no live updates) shows no notice.

## 2. Symptom to code

| You see | Probably | Go to |
|---|---|---|
| Site shows "Showing built-in content" or "Showing saved content" | `BLITZ-NET-*`, `BLITZ-DB-002`, `BLITZ-SCH-*`, `BLITZ-CFG-*` (the code is printed in the notice) | [3](#3-error-code-reference), [4](#4-supabase-schema-diagnostic-queries) |
| Panel: "does not recognise a field" / column | `BLITZ-SCH-001` | [4](#4-supabase-schema-diagnostic-queries), [5](#5-schema-cache-recovery) |
| Panel: "Nothing was changed" | `BLITZ-DB-005` | [6](#6-authentication-and-rls-troubleshooting) |
| Panel: "session expired" | `BLITZ-AUTH-002` | Sign in again in the dialog; nothing is lost |
| Panel: "Could not check your access" | Network or database problem, not a wrong password | Press **Try again**; run **System check** |
| Event link says "Event not found" | `BLITZ-DATA-001` | Event unpublished, deleted or the link is wrong |
| Page at an unknown address | HTTP 404 page | [8](#8-hosting-and-custom-error-pages) |
| Keep-alive run is red in GitHub | See the run log | [10](#10-github-actions-and-secrets) |

**First step for almost any panel problem:** open the dashboard and press **Run system check**. It reads only (it never writes, never changes the schema, never runs SQL) and reports connection, session, admin role, every events column the panel uses, each table, the `site_content()` function, and image storage.

## 3. Error code reference

Generated from `error-catalog.js`; `node tools/validate-site.js` fails if a code is missing from this section or documented here but not in the catalog.

### Network (`BLITZ-NET-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-NET-001` | Your device appears to be offline. | Device has no connection (Wi-Fi/mobile data off). | Reconnect to the internet and try again. |
| `BLITZ-NET-002` | We could not reach the server. | No internet, a firewall/proxy, a wrong project URL, or the Supabase project is unreachable. | Check your internet connection and try again in a moment. |
| `BLITZ-NET-003` | The server took too long to respond. | Very slow connection, or the database is waking up or overloaded. | Try again in a moment. |
| `BLITZ-NET-004` | Too many requests were sent in a short time. | Too many requests from one network in a short time. | Wait a minute and try again. |

### Database (`BLITZ-DB-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-DB-001` | The server reported an unexpected problem. | Supabase or PostgREST returned a 5xx or an unreadable (for example HTML) response. | Try again in a moment. If it keeps happening, tell the BLITZ team. |
| `BLITZ-DB-002` | The content service is temporarily unavailable. | Free project paused or restarting; PostgREST still loading its schema cache (503 / PGRST002). | Try again in a few minutes. Admin: The Supabase project may be paused, restarting or still loading its schema. Check the project dashboard. |
| `BLITZ-DB-003` | The database rejected one of the values. | A value broke a CHECK constraint, has the wrong type/format, is too long, or a required column is empty. | Check the fields for text that is too long, a wrong format, or a link that does not start with https://. |
| `BLITZ-DB-004` | An item with this web address (ID) already exists. | Primary key already exists (SQLSTATE 23505). | Choose a different ID. |
| `BLITZ-DB-005` | The change was not saved because no record was updated. | An update/delete matched zero rows: the row was removed, or row level security filtered it out. | The item may have been removed by someone else, or your role may not allow this change. Reload the list and try again. Admin: The request succeeded but affected zero rows. With row level security this usually means the policy filtered the row out. |
| `BLITZ-DB-006` | This item is linked to other data and cannot be changed this way. | Foreign-key conflict (SQLSTATE 23503). | Review the related items and try again. |
| `BLITZ-DB-007` | The data being saved is too large. | Payload over a size limit (HTTP 413 / program limit). | Shorten the text or remove some entries and try again. |

### Schema (`BLITZ-SCH-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-SCH-001` | The database does not recognise a field this form is trying to save. | Column missing from the table, OR the PostgREST schema cache has not been reloaded after it was added (PGRST204 / 42703). | Tell the BLITZ owner so the database can be checked. Admin: Either the column is missing or the PostgREST schema cache has not reloaded. Run the schema diagnostic query in ERRORS.md. Only if it reports the column missing, run the matching migration in supabase/, then run: NOTIFY pgrst, 'reload schema'; |
| `BLITZ-SCH-002` | A table or view the site needs was not found. | Table or view missing, or stale schema cache (PGRST205 / 42P01). | Tell the BLITZ owner so the database can be checked. Admin: The table or view is missing, or the schema cache is stale. Compare the project with supabase/schema.sql using the diagnostic query in ERRORS.md. |
| `BLITZ-SCH-003` | A database function the site needs was not found. | RPC function missing, different signature, or stale schema cache (PGRST202 / 42883). | Tell the BLITZ owner so the database can be checked. Admin: The RPC function (normally public.site_content) is missing or has a different signature, or the schema cache is stale. Check it with the diagnostic query in ERRORS.md. |

### Authentication (`BLITZ-AUTH-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-AUTH-001` | The email or password is incorrect. | Wrong email or password. | Check them and try again, or use "Forgot your password?". |
| `BLITZ-AUTH-002` | Your session has expired. | Access token expired and could not be refreshed, or the session was ended elsewhere (PGRST301 / "JWT expired"). | Sign in again to continue. Anything you typed is still on this page. |
| `BLITZ-AUTH-003` | You are not signed in. | No session at all (PGRST302 / HTTP 401). | Sign in and try again. |
| `BLITZ-AUTH-004` | Too many sign-in attempts. | Supabase Auth rate limit. | Wait a few minutes and try again. |

### Permission (`BLITZ-PERM-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-PERM-001` | You do not have permission to do that. | RLS policy or grant rejected the request (SQLSTATE 42501 / HTTP 403). | Ask a BLITZ owner to check your role. Admin: Row level security or a missing grant rejected the request (SQLSTATE 42501). See "Authentication and RLS troubleshooting" in ERRORS.md. |
| `BLITZ-PERM-002` | Your role is view only, so changes are not allowed. | Account has the viewer role. | Ask a BLITZ owner if you need to edit content. |
| `BLITZ-PERM-003` | This account has not been given access to the admin panel. | Signed in, but the user is not in public.admins. | Ask a BLITZ owner to add you. |

### Validation (`BLITZ-VAL-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-VAL-001` | Some fields need attention before this can be saved. | One or more form fields failed validation. | Fix the fields marked in red and try again. Nothing has been saved. |
| `BLITZ-VAL-002` | The file is not valid JSON. | Imported file is not valid JSON. | Download a fresh template and keep its structure intact. |
| `BLITZ-VAL-003` | The imported event does not match the template. | Imported event does not match the template. | Fix the problems listed and import again. Nothing has been saved. |
| `BLITZ-VAL-004` | Another event already uses this ID. | Event ID is already used. | Choose a different ID. |
| `BLITZ-VAL-005` | The extra event details are not valid or are too large. | event_details is not an object, is over 50,000 bytes, or contains a bad link. | Check the JSON in the "Template details" field. |
| `BLITZ-VAL-006` | That file cannot be used. | Image type/size not accepted. | Choose a PNG, JPEG or WebP image under the size limit. |

### Content (`BLITZ-DATA-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-DATA-001` | We could not find that event. | Unknown or unpublished event ID (visitors cannot tell them apart, by design). | It may have been removed or the link may be wrong. Browse all events instead. |
| `BLITZ-DATA-002` | That event link is not valid. | The ?event= value contains characters an event ID never has. | Browse all events instead. |
| `BLITZ-DATA-003` | Some content could not be shown because it was incomplete. | A record was incomplete and was skipped. | The rest of the page is unaffected. |
| `BLITZ-DATA-004` | The latest content from the server was empty or in an unexpected format. | Live response was empty or not in the expected shape; the last good copy is used. | Showing the last good copy instead. Try again in a moment. |

### Configuration (`BLITZ-CFG-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-CFG-001` | Live updates are not set up correctly on this site. | config.js missing, malformed or contains a secret key. | The page is showing its built-in content. Admin: config.js is missing or invalid. It needs https://<project>.supabase.co and the public publishable/anon key. See README.md. |
| `BLITZ-CFG-002` | The content service address does not look right. | Project URL wrong (host answers 404). | The page is showing its built-in content. Admin: The API host answered but not as Supabase (HTTP 404), or the project URL in config.js points to the wrong project. |
| `BLITZ-CFG-003` | The content service rejected this site's public key. | Wrong, revoked or secret key. | The page is showing its built-in content. Admin: The key in config.js is wrong, revoked or belongs to a different project. Use the public publishable/anon key only, never a secret or service_role key. |

### Images and files (`BLITZ-IMG-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-IMG-001` | An image could not be loaded. | Image URL 404s or is blocked. | The rest of the page is unaffected. |
| `BLITZ-IMG-002` | The image could not be uploaded. | Upload failed (network, permission or size). | Try again. Your other changes have not been saved yet. |
| `BLITZ-IMG-003` | The image storage area was not found. | Storage bucket "media" does not exist. | Tell the BLITZ owner so storage can be checked. Admin: The "media" storage bucket is missing. It is created by supabase/schema.sql. |

### Operation (`BLITZ-OP-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-OP-001` | That action is already in progress. | The same action was triggered twice. | Please wait for it to finish. |
| `BLITZ-OP-002` | We could not confirm whether the change was saved. | The connection dropped during a write, so the outcome is unknown. | Check the list before trying again, so nothing is saved twice. |
| `BLITZ-OP-003` | The request kept failing, so we stopped trying. | Retries exhausted. | Try again later. |

### Script (`BLITZ-JS-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-JS-001` | Something unexpected went wrong on this page. | A bug or a browser extension. | Reload the page. If it keeps happening, tell the BLITZ team. |
| `BLITZ-JS-002` | An action did not finish because of an unexpected problem. | An unhandled promise rejection. | Reload the page and try again. |
| `BLITZ-JS-003` | Part of this page failed to load. | A script or stylesheet of the site failed to load. | Reload the page. Check your connection if it keeps happening. |

### Web server (`BLITZ-HTTP-…`)

| Code | What the person sees | Likely cause | What to do |
|---|---|---|---|
| `BLITZ-HTTP-403` | You do not have access to this page. | Server refuses access (permissions, directory listing off). | Go back to the BLITZ homepage. |
| `BLITZ-HTTP-404` | We could not find the page you asked for. | No such file at that address. | Check the address, or use the links below. |
| `BLITZ-HTTP-500` | The server hit a problem and could not finish your request. | Server-side script or configuration failure. | Try again in a moment. |
| `BLITZ-HTTP-503` | The site is temporarily unavailable, perhaps for maintenance. | Maintenance mode or overload. | Please try again in a few minutes. |

## 4. Supabase schema diagnostic queries

Run these in the Supabase **SQL Editor**. They only read. Compare the output with `supabase/schema.sql`, which is the source of truth. **Do not run a migration unless a query below shows something is actually missing**: a `BLITZ-SCH-*` error can also mean the schema cache is stale (next section).

**4.1 Do the events columns exist, with the right types?** Expected: `event_details` is `jsonb`, `NOT NULL`, default `'{}'`; `placeholder` is `boolean`; `brochure` and `logo` are `text`.

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'events'
order by ordinal_position;
```

**4.2 Which of the four columns added after the first release are missing?** No rows means none are missing.

```sql
select c as missing_column
from unnest(array['event_details', 'placeholder', 'brochure', 'logo']) as c
where c not in (
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'events'
);
```

- Missing `event_details` or `placeholder` → run `supabase/migration_add_event_details.sql`.
- Missing only `brochure` or `logo` → run `supabase/migration_add_brochure_and_logo.sql`.
- Both migrations keep existing rows, never drop anything, and are safe to run twice. Never drop or recreate a table to fix a missing column.

**4.3 Does the public content function exist with the right signature?** Expected: one row, no arguments, returns `jsonb`.

```sql
select p.proname, pg_get_function_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as returns
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'site_content';
```

**4.4 Are all expected tables and the public view there?** Expected: 8 rows.

```sql
select schemaname, tablename as name, 'table' as kind from pg_tables
where schemaname = 'public' and tablename in ('announcements','events','team_members','gallery_items','collaborations','content_history','admins')
union all
select schemaname, viewname, 'view' from pg_views where schemaname = 'public' and viewname = 'events_public'
order by 3, 2;
```

**4.5 Is row level security on everywhere?** Expected: `true` for all seven.

```sql
select relname, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
  and relname in ('announcements','events','team_members','gallery_items','collaborations','content_history','admins')
order by relname;
```

**4.6 Policies and constraints on events.** Expected: `events_select/insert/update/delete`, and a CHECK that keeps `event_details` a JSON object under 50,000 bytes.

```sql
select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'events' order by policyname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.events'::regclass and contype = 'c' order by conname;
```

**4.7 Grants.** Expected: visitors (`anon`) can run `site_content()` and read `events_public`, but cannot read the `events` table directly.

```sql
select has_function_privilege('anon', 'public.site_content()', 'execute') as anon_can_run_site_content,
       has_table_privilege('anon', 'public.events_public', 'select')      as anon_can_read_public_view,
       has_table_privilege('anon', 'public.events', 'select')             as anon_can_read_events_table_must_be_false,
       has_table_privilege('authenticated', 'public.events', 'insert')    as signed_in_can_write;
```

**4.8 Image storage bucket.** Expected: one row.

```sql
select id, public from storage.buckets where id = 'media';
```

**4.9 Who is an admin, and with what role?**

```sql
select email, role from public.admins order by role, email;
```

## 5. Schema cache recovery

Supabase's REST layer (PostgREST) caches the schema. After you add a column, table or function, it can keep answering as if it did not exist: errors mention "schema cache" (`PGRST204`, `PGRST205`, `PGRST202`). Migrations in `supabase/` already end with the reload command. To do it by hand, in the SQL Editor:

```sql
notify pgrst, 'reload schema';
```

Wait a few seconds, then press **Run system check** in the panel. If the project was paused, resume it in the Supabase dashboard first (`BLITZ-DB-002`). The dashboard may also offer a reload or restart option; its wording changes over time, so it is not described here.

How to tell the two causes apart: if query 4.1/4.2 shows the column **exists** and the error persists, the cache is stale: reload it. If the query shows it is **missing**, run the matching migration (it reloads the cache itself).

## 6. Authentication and RLS troubleshooting

| Symptom | Check |
|---|---|
| Sign-in says the password is wrong | Reset it with "Forgot your password?". Too many attempts triggers a short lockout (`BLITZ-AUTH-004`). |
| Signed in, "no access" (`BLITZ-PERM-003`) | The user is not in `public.admins` (query 4.9). Add them from SQL: `insert into public.admins (user_id, email, role) select id, email, 'editor' from auth.users where email = 'name@example.com';` |
| Cannot save, "view only" (`BLITZ-PERM-002`) | Role is `viewer`. Roles are `owner`, `editor`, `viewer`; only `owner` and `editor` can write. |
| "Permission denied" (`BLITZ-PERM-001`) | Query 4.6/4.7: a missing policy or grant. Re-run `supabase/schema.sql` only if the queries show policies are missing; it is written to be re-runnable. |
| "Nothing was changed" (`BLITZ-DB-005`) | The row no longer exists (someone deleted it) or your role cannot update it. Reload the list. If it repeats for a row you can see, check the role in query 4.9. |
| "Session expired" (`BLITZ-AUTH-002`) | Sign in again in the dialog. If it returns immediately, the device clock may be wrong. |
| Everything is rejected with 401 and "Invalid API key" (`BLITZ-CFG-003`) | `config.js` holds the wrong project's key. Use only the **publishable/anon** key. A `service_role` or `sb_secret_…` key must never be in any browser file; the site and panel refuse to run with one, and `tools/validate-site.js` fails if it finds one. If one was ever committed, rotate it in Supabase. |

## 7. Recovering from a failed event publish

1. Read the message. It names the cause and what to do; the form still holds everything you typed.
2. **Do not press Save repeatedly.** If the message says it "could not confirm whether the change was saved", open **Events** and look for the event before trying again. If it is there, you are done; if you retry anyway, the panel detects the earlier attempt and does not duplicate it.
3. If it names a field, fix that field. Validation runs before anything is sent, so nothing was written.
4. If it says the database does not recognise a field (`BLITZ-SCH-001`), press **Run system check** on the dashboard and follow [section 4](#4-supabase-schema-diagnostic-queries) and [5](#5-schema-cache-recovery). Your text is still on the page; you can also copy it out.
5. If an event is saved but not visible on the site: it may be a draft (list shows *Draft*), or the visitor's browser is showing a saved copy; the site refreshes on load and when a tab becomes visible again.
6. A deleted event can be restored from **Activity** (the database keeps the deleted row).

## 8. Hosting and custom error pages

`404.html` and the others are normal files. **A web server must be told to use them**; creating them does nothing by itself. The site is documented to live at `https://keshav.du.ac.in/blitz/`, a college server, so the repository ships `.htaccess.example` (Apache) with an nginx equivalent inside it. The actual server software and whether it allows `.htaccess` are **not known to this repository and must be confirmed with whoever runs it.**

**Apache.** Rename `.htaccess.example` to `.htaccess` in the site folder (the server must allow `AllowOverride FileInfo`, and `Options` for the directory-listing line). It maps 403/404/500/503 to the pages using **local paths**, which keeps the true HTTP status. Do not use full `http://…` URLs in `ErrorDocument` (that becomes a redirect and loses the 404 status), and do not rewrite unknown URLs to the homepage.

**Folder other than `/blitz/`.** The error pages are served at the address that failed, so they carry `<base href="/blitz/">`. Run `python tools/set-site-url.py https://your.domain/your-folder/` (it updates the `<base>` in all five pages) and edit the `ErrorDocument` paths.

**Verifying (do this on the real server).**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://keshav.du.ac.in/blitz/no-such-page      # expect 404
curl -s https://keshav.du.ac.in/blitz/no-such-page | grep -o "<h1[^>]*>[^<]*"            # expect: Page not found
curl -s -o /dev/null -w "%{http_code}\n" https://keshav.du.ac.in/blitz/assets/           # expect 403 (listing off)
```

**Maintenance mode.** Uncomment the block in `.htaccess` marked *Maintenance mode*. Every page then returns a real `503` with the friendly page and `Retry-After: 3600`; the page's own CSS, script and logo stay reachable.

**Hosts that do not support this.** GitHub Pages and Netlify-style static hosts serve a file named `404.html` automatically but do not support custom 403, 500 or 503 pages. Best supported alternative there: keep `404.html`, accept the host's default for the others.

**`offline.html` and the service worker.** The site has no service worker, and none was added. Without one, a browser that is offline cannot fetch `offline.html`, so it is **not** shown automatically. Instead, the site shows an "You are offline" notice when the connection drops, and already-open pages keep working. `offline.html` is a ready page (with a "Try again" that returns you to where you were, using `?from=` with same-site paths only) for when a service worker is added later.

**Event pages cannot return a real 404.** Events are opened as `event.html?event=<id>`: the server only sees `event.html`, which exists, so it answers 200. For an unknown or unpublished ID the page shows an in-page "Event not found" state, marks itself `noindex`, and offers a way back. A true 404 would need server-side routing the static design does not have.

## 9. Local testing

Requirements: Node 20+ (22 recommended), Python 3.10+, PostgreSQL 14+ with a superuser connection, the `postgrest` binary (v12), and `pip install psycopg2-binary pillow playwright && python -m playwright install chromium`.

```bash
# fast, no database, no network
for f in *.js prezi_panel/*.js tools/*.js tests/unit/*.js; do node --check "$f"; done
node --test "tests/unit/*.test.js"      # error handler, catalog, event validator
node tools/validate-data.js             # bundled content, templates, JSON syntax, event rules
node tools/validate-site.js             # error pages, script order, palette, docs, secrets, hosting config, workflows

# against a scratch PostgreSQL (never Supabase)
createdb blitz_rls && python supabase/tests/run_rls_tests.py blitz_rls
createdb blitz_schema_test && python supabase/tests/run_schema_contract_tests.py blitz_schema_test

# browser tests: real PostgreSQL + real PostgREST + Chromium; Supabase login/storage are a local stand-in
python supabase/tests/e2e/run_e2e.py /path/to/postgrest
python supabase/tests/e2e/run_error_tests.py /path/to/postgrest     # do not run both at once (shared ports)
```

**What is real and what is simulated.** The database, row level security, PostgREST, constraints and migrations in these tests are real. Supabase **Auth** and **Storage** are `supabase/tests/e2e/fake_supabase.py`. Network outages, 5xx responses, lost responses and token expiry are injected with Playwright and labelled `[SIMULATED]` in the output; genuinely broken schemas (dropped column, dropped function) are labelled `[REAL]`. None of this touches a hosted Supabase project.

## 10. GitHub Actions and secrets

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every push / pull request | syntax, unit tests, data and site validation, seed freshness; schema/RLS tests on a Postgres service container; both browser suites. Uses no secrets. |
| `keepalive.yml` | daily 03:17 UTC (08:47 IST) and manually | one read of `public.site_content()`. |

**Secrets (names only; set under Settings → Secrets and variables → Actions):**

- `SUPABASE_URL`: the project URL, `https://<project-ref>.supabase.co`.
- `SUPABASE_PUBLISHABLE_KEY`: the public publishable (or legacy anon) key. Never a secret or `service_role` key. It is the same public key that is in `config.js`; the locally used `.env` may call it `SUPABASE_ANON_KEY`, which is only a local file and not the GitHub secret name.

**Reading a red keep-alive run.** The log names the cause and never prints a key: missing secret (by name), `https://` missing, unreachable host, HTTP 401/403 (key rejected), 404 (wrong URL or missing function), 5xx (project paused), or a 200 without an events list. A passing run proves the content function answered that day. **It does not guarantee the database will never pause**; if GitHub disables scheduled workflows after a period of repository inactivity, or the project is paused for another reason, the run will fail or stop, so check the Actions tab occasionally.

## 11. Known limitations and unverified checks

- **Never run against a hosted Supabase project.** All database behaviour was tested on a scratch PostgreSQL with PostgREST. Supabase Auth and Storage were a stand-in, so real-project quirks (for example exact Auth error codes) are covered by classification rules and unit tests, not live checks.
- **GitHub Actions workflows have not been run on GitHub.** The YAML parses and the keep-alive script's branches were executed locally against a mock server; the CI jobs were run as their individual commands, not through Actions.
- **Hosting:** verified on Apache 2.4 with this `.htaccess` (404, 403, 500 from a failing script, and the 503 maintenance recipe return the right status and the custom page). Not verified: the real college server, nginx, and the `500` page for server *configuration* errors (a broken `.htaccess` makes Apache show its own default 500 page, because its configuration cannot be read at all).
- **Time-outs** (8 s for public content, 30 s panel writes) are covered by unit tests, not by a browser test, to keep the suite fast.
- **Event `status` text:** the schema has no enumerated event status; publication state is the boolean `published`. `event_details.status` is only length-checked.
- **Existing images in the database** are not re-checked; only references being saved are validated.
- **Cached content** can be up to 30 days old if the database is unreachable; it is always labelled with its date, never presented as live.
- **The public site has no forms**, so there is no form-submission error path to test; the only contact route is a `mailto:` link.
