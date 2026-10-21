# Admin panel: setup guide

You will set up a free database once (about 30–40 minutes), then the society edits everything from
`https://keshav.du.ac.in/blitz/prezi_panel/`. Changes show on the main site by themselves.

> Menu names inside Supabase and Google change from time to time. If a label here is not exactly where
> you expect, look for the closest match; the *settings* are what matter.

**Contents:** [How the website functions](#how-the-website-functions) · [1 Create the project](#1-create-the-supabase-project) · [2 Database](#2-create-the-database) ·
[3 Accounts](#3-create-the-admin-accounts) · [4 Login settings](#4-login-settings-no-sign-up-password-reset)
· [5 Connect the site](#5-connect-the-website) · [6 Deploy](#6-put-the-files-on-the-college-server) ·
[7 Keep-alive](#7-stop-the-free-database-from-pausing) · [8 Test](#8-first-run-checklist) ·
[9 Daily use](#9-daily-use-and-admin-people) · [10 Limits](#10-limits-and-things-to-know) ·
[11 Troubleshooting](#11-troubleshooting)

---

## How the website functions

BLITZ is a dependency-free static website with a Supabase-backed content system:

1. A visitor opens the public site at `https://keshav.du.ac.in/blitz/`.
2. The browser loads the HTML, CSS, JavaScript and fallback content bundled in
   `data.js`.
3. The public site uses the Supabase URL and anon/publishable key in
   `config.js` to request published content through the `site_content()` RPC.
4. If Supabase is available, the latest published announcements, events, team,
   gallery and collaboration records replace the fallback content. If it is
   unavailable, the page continues using its cached copy or `data.js`.
5. An administrator opens
   `https://keshav.du.ac.in/blitz/prezi_panel/`, signs in, and edits the
   database content. The admin panel uses Supabase Authentication, row-level
   security and storage rules to control access.
6. Changes are normally visible on a new visit or after an open page refreshes
   its content. Changing content does not require uploading a new website build.

The repository still contains the website code, contact details, fallback
content, SEO metadata, database schema and deployment files. The Supabase
project contains live content, administrator accounts, uploaded images and the
activity/history log. Keep both under BLITZ ownership.

### BLITZ account ownership

The Supabase project is linked to the shared BLITZ email account,
`team.blitzkmv@gmail.com`, not to an individual officer. Keep the Supabase
owner account, Gmail recovery methods, two-factor authentication, SMTP settings
and app passwords under the society's controlled password manager. Do not
transfer ownership to a personal email when officers change. Personal officers
may have their own admin accounts, but the shared BLITZ account must remain the
recovery and billing owner.

Never place the Gmail password, Gmail app password, Supabase database password
or Supabase `service_role`/secret key in this repository. The anon/publishable
key is the only Supabase key intended for `config.js`.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com>, sign in with the shared BLITZ email account
   (`team.blitzkmv@gmail.com`) and create an **organization** owned by that
   account. Do not use a personal officer account as the permanent owner.
2. **New project** → name it `blitz` → choose a strong **database password** (store it in the society's password manager; you rarely need it) → pick the **region nearest Delhi** (e.g. Mumbai / `ap-south-1`) → plan **Free**.
3. When it finishes, open **Project Settings → API** and note two things:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **anon / publishable key** (a long text). This one is public by design.
   - ⚠️ Also on that page is a **service_role / secret** key. **Never** put it in any file in this repository or send it to anyone. This setup never needs it.

## 2. Create the database

Open **SQL Editor → New query**. Paste each file's contents and press **Run**, in this order:

1. `supabase/schema.sql`: creates the tables, the security rules, the history/undo log and the image storage.
2. `supabase/seed.sql`: imports everything currently on the website (events, team, gallery, announcement). Safe to run twice.
   *(If you changed `data.js` and want the import to match, run `node tools/generate-seed.js` first.)*

Each should end with “Success”. If a step fails, stop and see [Troubleshooting](#11-troubleshooting).

The admin panel stores every newly selected event image, team photo, gallery image
and collaboration logo in the public `media` Storage bucket before saving its
`storage:<folder>/<generated-name>` reference in the corresponding table. The
bucket is public for website delivery, while uploads remain restricted to
authenticated owners and editors by both database privileges and RLS policies.

## 3. Create the admin accounts

You can add users via the Supabase Dashboard UI or using the SQL scripts:

1. **Create the Auth User** (pick either method):
   - **Method A (SQL Editor)**: Open `supabase/user.sql`, check/set the email (e.g. `aksh2425709@keshav.du.ac.in`) and temporary password, then run it.
   - **Method B (Dashboard UI)**: In **Authentication → Users → Add user → Create new user**. Enter the person's email and a temporary password, and tick **Auto Confirm User**.
2. **Assign the Admin Role**:
   - Open `supabase/admins.sql`, configure each person's email and role:
     - `owner`: full access
     - `editor`: create / edit / delete content and pictures
     - `viewer`: can look at everything (including drafts and history), cannot change anything
   - Paste `supabase/admins.sql` into the SQL Editor and **Run**. It syncs roles directly with `public.admins`. Check results with: `select email, role from public.admins;`
3. Tell each person their temporary password privately. They should change it at first sign-in (**Account** page).

Only people listed in `public.admins` can use the panel. A person with a login who is *not* listed gets a “No access” screen and the database refuses everything they try.

### Adding an administrator later

Use this process whenever a new officer or maintainer needs access:

1. Confirm that the person is currently responsible for BLITZ and that their
   email address is correct.
2. Create their auth user via `supabase/user.sql` (or in **Authentication → Users → Add user** with **Auto Confirm User**).
3. Add the email and role to `supabase/admins.sql` and run it in the Supabase SQL Editor.
4. Give the temporary password privately. The new administrator must sign in,
   change it from **Account**, and confirm that they can perform only the
   actions allowed by their role.
5. Record who approved the access and when in the society's password manager or
   handover record. Do not record passwords in the repository.

### Removing an administrator

Remove access immediately when someone leaves the team, loses responsibility,
or no longer needs access:

1. In **Authentication → Users**, open the user and choose **Delete user**.
   This invalidates their login and prevents future password-reset emails.
2. Remove the matching email from `public.admins` using the `delete from
   public.admins ...` statement in `supabase/admins.sql`, or run an equivalent
   carefully scoped SQL statement.
3. Check `select email, role from public.admins;` and confirm the person is no
   longer listed.
4. If the person knew a shared password, Gmail app password, database password
   or other secret, rotate that secret. Never reuse a departing officer's
   personal password.
5. Keep the person's content edits in the Activity history; deleting their
   account does not require deleting the content they created.

## 4. Login settings (no sign-up, password reset)

In **Authentication**:

1. **Sign In / Providers**: turn **OFF** “Allow new users to sign up”. (This is what makes it invitation-only.) Keep **Email** enabled; leave other providers off.
2. Set the **minimum password length** to **10** (the panel also enforces 10).
3. **URL Configuration**:
   - **Site URL:** `https://keshav.du.ac.in/blitz/prezi_panel/`
   - **Redirect URLs:** add the same address. (Password-reset links only work for addresses listed here.)
4. **Emails → SMTP Settings** (needed for password-reset emails to reach your officers): Supabase's built-in sender only delivers to your own project team and allows just a couple of emails per hour, so set a custom sender. The easiest is the society Gmail:
   - In the Google account `team.blitzkmv@gmail.com`: turn on **2-Step Verification**, then create an **App password** (Google Account → Security → App passwords). Copy the 16-character code.
   - In Supabase enable **Custom SMTP** and enter: host `smtp.gmail.com`, port `465`, username `team.blitzkmv@gmail.com`, password = the app password, sender email `team.blitzkmv@gmail.com`, sender name `BLITZ Admin`.
   - (Brevo's free SMTP is an alternative. Resend's free plan generally needs a domain you control, which you probably cannot configure on the college's domain.)
5. **Emails → Templates → Reset Password**: replace the body with the following, so people get **both** a link and a 6-digit code. The code works even when an email scanner has already “used” the link, or when the email is opened on another device:
   ```html
   <h2>Reset your BLITZ admin password</h2>
   <p>Click this link: <a href="{{ .ConfirmationURL }}">choose a new password</a></p>
   <p>Or open the admin panel, choose “Forgot your password?” and enter this code: <strong>{{ .Token }}</strong></p>
   <p>If you did not ask for this, ignore this email.</p>
   ```
6. *(Recommended, if your plan offers it)* Enable **multi-factor authentication (TOTP)** under Authentication settings. The panel signs people in with a password; MFA enrolment would be a further step, so only turn this on after deciding who manages it.

## 5. Connect the website

Copy `.env.example` to `.env` in the site folder and fill in the two **public** values
from step 1.3:

```text
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=eyJ...your anon/publishable key...
```

Then generate the browser configuration:

```text
node tools/configure-env.js
```

This writes `config.js`, which is loaded by both the public site and the admin panel:

```js
window.BLITZ_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseKey: 'eyJ...your anon/publishable key...'
};
```

That one file connects **both** the public site and the admin panel.

## 6. Put the files on the college server

Give your teacher the **whole folder** as a zip (it must keep the `prezi_panel` folder inside). It must end up as:

| Address | Folder |
|---|---|
| `https://keshav.du.ac.in/blitz/` | the main site (`index.html`, `event.html`, …) |
| `https://keshav.du.ac.in/blitz/prezi_panel/` | the admin panel |

Requirements and advice for whoever runs the server:

- **HTTPS must work** for both (password-reset links and login need it).
- Give them `prezi_panel/.htaccess.example`: security headers (no framing by other sites, no caching of the panel). Optional but recommended.
- You do **not** need to upload anything again when content changes. Only when the *code* changes.
- Do not add the admin address to `robots.txt` or the sitemap (the page is already marked `noindex`).

## 7. Stop the free database from pausing

Supabase's free plan **pauses a project after about a week with no activity.** Do both of these:

1. **GitHub Action (included).** In the GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the same public values as `config.js`). The workflow in `.github/workflows/keepalive.yml` then reads the public content every 3 days. Run it once by hand (**Actions → Supabase keep-alive → Run workflow**) and check it is green. *GitHub switches scheduled workflows off after 60 days without repository activity; if that happens, press “Enable workflow”.*
2. **Backup ping (recommended).** On <https://cron-job.org> (free) create a job every 3 days: method **POST** to `YOUR_SUPABASE_URL/rest/v1/rpc/site_content`, headers `apikey: YOUR_ANON_KEY` and `Content-Type: application/json`, body `{}`.

If a project does get paused, open the Supabase dashboard and press **Restore**. Meanwhile the website keeps working from its saved copy.

## 8. First-run checklist

Sign in at `/blitz/prezi_panel/` and tick through:

- [ ] Sign-in works and shows your email and role at the top.
- [ ] **Account → change password** (use a new, long password).
- [ ] **Announcements → New**: add “Test”, save. Open the main site: it appears. **Delete** it, then in **Activity** press **Restore**, then delete again.
- [ ] **Team → Edit** a person, **Choose image…**, drag to centre the face, save: the photo shows on the site.
- [ ] Use the **↑ ↓** arrows on a team member: the order changes on the site.
- [ ] **Events → Edit**: type in the form and watch the **Preview** update.
- [ ] Sign out; try **Forgot your password?** with your own email; confirm the email arrives and the code (or link) works.
- [ ] On a phone, open the panel and the site.
- [ ] A person who is **not** in `admins` can sign in but sees “No access”.

## 9. Daily use and admin people

- **Publish / draft:** every item has a *Show on the website* switch. Untick it to keep something hidden while preparing it.
- **Delete is reversible:** **Activity** lists the last 100 changes with who made them; **Restore** brings back a deleted item or an earlier version.
- **Images:** pictures are cropped and shrunk in your browser (team 400×400, gallery 800×600, event 1200×675, logos 480×200) so the site stays fast. PNG, JPEG and WebP are accepted. iPhone “HEIC” photos must be converted (Share → save as JPEG) first.
- **Add or remove an admin:** create/delete the user under **Authentication → Users**, then edit and re-run `supabase/admins.sql` (to remove, use the `delete from public.admins …` line in that file).
- **Someone forgot their password:** they use **Forgot your password?**. If email is not working, an owner can set a new one under **Authentication → Users**.
- **Someone left the society:** delete their user (Authentication → Users) **and** their row in `public.admins`.
- **Contact details** (email, Instagram, address) are in `data.js`, not the panel. Ask a developer, or hand over a new zip.
- **Backup / export** (in the panel): downloads a fresh `data.js`. Before you hand a new zip to the server team, replace `data.js` with it. This refreshes the fallback copy and the no-JavaScript text.

### Taking over for a new team

Complete this handover at the start and end of every team year. The outgoing
team should remain available until the incoming team has completed the checks.

**Outgoing team checklist**

- Confirm that the Supabase project owner is still the shared BLITZ email
  account (`team.blitzkmv@gmail.com`), not a departing officer.
- Transfer the Gmail recovery email/phone, two-factor authentication method,
  password-manager entry and backup codes to the incoming faculty coordinator
  or society-approved custodian.
- Give the incoming team access to the repository, hosting/server account,
  GitHub repository and Supabase dashboard. Use their individual accounts
  where available.
- Export the current content from **Backup / export**, download a copy of the
  database SQL or other approved backup, and store both in the society's
  password manager or approved drive.
- Review **Authentication → Users** and `public.admins`; identify accounts to
  retain, downgrade or remove.
- Check the production URL, Supabase URL, `config.js`, GitHub keep-alive
  secrets, SMTP sender and password-reset redirect URL.

**Incoming team checklist**

- Sign in to the shared BLITZ Gmail and confirm that recovery and two-factor
  authentication work without relying on the outgoing team's personal device.
- Sign in to Supabase with the shared owner account and verify that the project,
  database, storage and Authentication pages are accessible.
- Create individual admin accounts for incoming maintainers; do not use the
  shared owner login for daily editing. Give each person the minimum required
  role and test it.
- Open the public site and admin panel. Create a temporary announcement,
  verify that it appears, then delete it and restore the expected content if
  necessary.
- Check that a test password-reset email reaches the BLITZ inbox and that the
  configured redirect opens the admin panel.
- Run `node tools/validate-site.js` after any repository or domain change.
- Only after the incoming team confirms access should outgoing personal admin
  accounts be deleted or downgraded.

If nobody can access the shared BLITZ email account, stop and recover that
Google account first. Do not create a new Supabase project or overwrite
`config.js` as a workaround; doing so can disconnect the website from its live
content and history.

## 10. Limits and things to know

- **Free plan:** about 500 MB database and 1 GB file storage, 5 GB of data transfer per month, and projects pause after a week of inactivity. This site's data and photos are tiny (all team photos together are under 300 KB), so there is a lot of room. Check Supabase's pricing page for current numbers.
- **Backups:** the free plan does not include automatic daily backups, as far as I know; check your plan. Use **Backup / export** from time to time and keep the file.
- **If the database is down or paused:** visitors still see the last content they loaded, or the copy saved in `data.js`. They never see an empty page.
- **Visitors see changes** on their next visit, or within about two minutes if they return to an open tab.
- **Signed out automatically** after 30 minutes without activity; the login lives only in that browser tab.
- **Never share** the `service_role` key, the database password or an app password. The public anon key is meant to be public.

## 11. Troubleshooting

| Problem | What to do |
|---|---|
| Panel says **Not connected yet** | `config.js` is empty or has a typo. Re-copy both values (step 5). |
| Sign-in says “The email or password is incorrect” | Check the email spelling; use **Forgot your password?**; five wrong tries lock the form for 30+ seconds. |
| Sign-in says “Could not reach the server” | Internet problem, or the Supabase project is paused (dashboard → Restore). |
| **“No access”** after signing in | The email is not in `public.admins`: run `supabase/admins.sql` with that email. |
| Saving says “You do not have permission” | Your role is `viewer`, or you are not an admin. |
| Reset email never arrives | SMTP not set (step 4.4), or look in spam; the app password must be the 16-character Google code; the sender address must match the Gmail account. |
| Reset link says invalid/expired | Use the **6-digit code** from the same email instead, or request a new one. |
| Reset link opens an error or the wrong page | The address is missing from **Redirect URLs** (step 4.3). |
| Image upload fails | The file must be PNG/JPEG/WebP and under 20 MB before cropping; check you are an `owner` or `editor`. |
| Site still shows old content | Refresh once; check the item is **published**; check `config.js` on the server is filled in. |
| Schema step fails in the SQL editor | Run it again from the top (it is safe to repeat). If it still fails, copy the red error message to a developer. |
| Saving an event says “Could not find the 'brochure' (or 'logo') column in schema cache” | Run `supabase/migration_add_brochure_and_logo.sql` in the SQL Editor and reload the schema cache under **Project Settings → API**. |
| `seed.sql` complains about a value | A piece of content breaks a database rule (e.g. a link not starting with `https://`). Fix it in `data.js`, run `node tools/generate-seed.js`, and run it again. |

## For developers: tests

```bash
# database rules (scratch Postgres):  53 checks
createdb blitz_test && python supabase/tests/run_rls_tests.py blitz_test
# full admin + public site against a real Postgres + PostgREST:  75 checks
python supabase/tests/e2e/run_e2e.py /path/to/postgrest
```
These need `postgresql`, the [PostgREST](https://postgrest.org) binary, `playwright`, `psycopg2-binary` and `pillow`; they use a local stand-in for Supabase's login and storage services, so the real Supabase project should still be checked with the checklist in step 8.
