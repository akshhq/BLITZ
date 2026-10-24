#!/usr/bin/env python3
"""
Error-handling end-to-end tests: how the public site and the Prezi Panel behave when things go wrong.

Same stack as run_e2e.py (REAL Postgres + REAL PostgREST + real Chromium; Supabase login/storage are the local
stand-in). Do not run both scripts at the same time: they share ports 3000 and 54321.

Each check is labelled:
  [REAL]       the failure is genuinely produced in Postgres / PostgREST (dropped column, dropped function, RLS, ...)
  [SIMULATED]  the failure is injected into the browser's network with Playwright (outage, 500, lost response, expired token)
Nothing here talks to a hosted Supabase project.

    python supabase/tests/e2e/run_error_tests.py  [path-to-postgrest-binary]
"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.error, io, atexit
import psycopg2
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
import fake_supabase as F

PGREST = sys.argv[1] if len(sys.argv) > 1 else '/tmp/postgrest'
DB = 'blitz_err'
SITE = 'http://localhost:54321'   # the stand-in serves the site AND the API from one origin
API = 'http://localhost:54321'
UID = {'owner': '00000000-0000-4000-8000-000000000001', 'editor': '00000000-0000-4000-8000-000000000002',
       'viewer': '00000000-0000-4000-8000-000000000003', 'stranger': '00000000-0000-4000-8000-000000000004'}
PW = {k: f'{k}-password-123' for k in UID}

procs = []
atexit.register(lambda: [p.terminate() for p in procs])
adm = psycopg2.connect(dbname='postgres'); adm.autocommit = True
c = adm.cursor(); c.execute(f'drop database if exists {DB}'); c.execute(f'create database {DB}'); adm.close()
db = psycopg2.connect(dbname=DB); db.autocommit = True; cur = db.cursor()
cur.execute(open(os.path.join(ROOT, 'supabase/tests/stub-supabase.sql')).read())
cur.execute(open(os.path.join(ROOT, 'supabase/schema.sql')).read())
cur.execute(open(os.path.join(ROOT, 'supabase/seed.sql')).read())
cur.execute("""do $$ begin if not exists (select from pg_roles where rolname='authenticator') then create role authenticator login password 'pw' noinherit; end if; end $$;
grant anon, authenticated to authenticator; alter role authenticator with password 'pw';""")
for k, v in UID.items():
    cur.execute('insert into auth.users (id,email) values (%s,%s)', (v, f'{k}@t.test'))
    F.State.users[f'{k}@t.test'] = {'id': v, 'password': PW[k]}
for k in ('owner', 'editor', 'viewer'):
    cur.execute('insert into public.admins (user_id,email,role) values (%s,%s,%s)', (UID[k], f'{k}@t.test', k))
F.State.editors = {UID['owner'], UID['editor']}
cur.execute("update public.events set published=false where id='agentic-ai-speaker-session-2026'")  # a draft to test visibility
env = dict(os.environ, PGRST_DB_URI=f'postgres://authenticator:pw@127.0.0.1:5432/{DB}', PGRST_DB_SCHEMAS='public',
           PGRST_DB_ANON_ROLE='anon', PGRST_JWT_SECRET=F.SECRET, PGRST_SERVER_PORT='3000', PGRST_LOG_LEVEL='error')
procs.append(subprocess.Popen([PGREST], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
F.ROOT = ROOT
F.start(54321)
for _ in range(100):  # PostgREST answers 503 until its schema cache is loaded; wait for a real 200
    try:
        if urllib.request.urlopen('http://127.0.0.1:3000/', timeout=1).status == 200: break
    except Exception:
        time.sleep(0.2)
else:
    sys.exit('PostgREST did not become ready')
R = []
def ok(name, cond, extra=''):
    R.append((bool(cond), name)); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'   -> {extra}'))

def q(sql, *a):
    cur.execute(sql, a); return cur.fetchall() if cur.description else []

def http(method, path, token=None, body=None, key=True, extra=None):
    h = {'Content-Type': 'application/json'}
    if key: h['apikey'] = F.ANON_KEY
    if token: h['Authorization'] = 'Bearer ' + token
    h.update(extra or {})
    req = urllib.request.Request('http://127.0.0.1:3000' + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=15); return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def jwt_for(who): return F.session_for(f'{who}@t.test')['access_token']

def test_png(path, color=(200, 80, 60), size=(900, 700)):
    im = Image.new('RGB', size, color)
    from PIL import ImageDraw
    d = ImageDraw.Draw(im); d.ellipse((size[0]//2-120, size[1]//3-120, size[0]//2+120, size[1]//3+120), fill=(250, 220, 190))
    im.save(path)
PNG = '/tmp/e2e-photo.png'; test_png(PNG)

CONFIG_JS = f"window.BLITZ_CONFIG = {{ supabaseUrl: '{API}', supabaseKey: '{F.ANON_KEY}' }};"
def new_context(p, viewport=(1280, 900), mobile=False):
    b = p.chromium.launch(args=['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'])
    ctx = b.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
    def route(r):
        url = r.request.url
        if url.endswith('/config.js'):
            return r.fulfill(status=200, content_type='application/javascript', body=CONFIG_JS)
        if url.endswith('/prezi_panel/') or url.endswith('/prezi_panel/index.html') or url.endswith('/prezi_panel/preview.html'):
            resp = r.fetch(); body = resp.text().replace('https://*.supabase.co', API)
            return r.fulfill(response=resp, body=body)
        r.continue_()
    import re
    ctx.route(re.compile(r'^http://localhost:54321/(config\.js|prezi_panel/(index\.html|preview\.html)?)$'), route)
    return b, ctx

def login(page, who, pw=None):
    page.goto(f'{SITE}/prezi_panel/'); page.wait_for_selector('input[type=email]')
    page.fill('input[type=email]', f'{who}@t.test'); page.fill('input[type=password]', pw or PW[who])
    page.click('button[type=submit]')

def watch(page, bucket):
    page.on('pageerror', lambda e: bucket.append('pageerror: ' + str(e)))
    page.on('console', lambda m: m.type == 'error' and 'ERR_NAME_NOT_RESOLVED' not in m.text and bucket.append('console: ' + m.text[:160]))

def flash(page, text, timeout=6000):
    try:
        page.wait_for_selector(f'.toast:has-text("{text}")', timeout=timeout)
        page.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")  # never match a stale toast later
        return True
    except Exception: return False

# ---------------------------------------------------------------------------------------------------------------
SC = f'{API}/rest/v1/rpc/site_content'
def notice(page, nid='content-status'): return page.locator(f'[data-notice-id="{nid}"]')
def attr(page, name): return page.evaluate(f"document.documentElement.getAttribute('{name}')")
def wait_status(page, want, timeout=15000):
    page.wait_for_function(f"document.documentElement.getAttribute('data-content-status')==='{want}'", timeout=timeout)
def cards(page): return page.evaluate("document.querySelectorAll('.team-card').length")
def op_log(page): return page.evaluate("window.BLITZ_ERRORS.recent().map(e=>e.operation+':'+e.code)")

q("insert into public.events (id,title,description,category,published) values ('live-only-evt','Live Only Event','Exists only in the database.','Test',true)")
q("insert into public.events (id,title,description,category,published) values ('secret-draft','Secret Draft Event','Must never be public.','Test',false)")
q("insert into public.events (id,title,description,category,image,published) values ('img-evt','Broken Image Event','Has an image that 404s.','Test','storage:events/missing.webp',true)")
live_expected = q("select count(*) from public.team_members where published")[0][0]

with sync_playwright() as p:
    print('\n== PUBLIC SITE: outage, fallback and recovery   [SIMULATED network failures against the real stack]')
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    page.goto(f'{SITE}/index.html'); wait_status(page, 'live')
    ok('live response: source is "live" and no warning is shown', attr(page, 'data-content-source') == 'live' and notice(page).count() == 0)
    ok('live response: every team member rendered', cards(page) == live_expected, (cards(page), live_expected))

    calls = {'n': 0}
    def abort(r): calls['n'] += 1; r.abort()
    ctx.route(SC, abort)
    page.reload(); page.wait_for_selector('[data-notice-id="content-status"]', timeout=20000)
    txt = notice(page).inner_text()
    ok('outage with a saved copy: says it is SAVED content and gives its date', attr(page, 'data-content-source') == 'cache' and 'Showing saved content' in txt and 'saved on' in txt, txt)
    ok('outage: the notice offers "Try again" and shows a code, not a stack trace', 'Try again' in txt and 'Code BLITZ-NET-002' in txt and 'TypeError' not in txt, txt)
    ok('outage: retried a bounded number of times (1 try + 2 retries = 3)', calls['n'] == 3, calls)
    ok('outage: the saved content is still on screen (never blank)', cards(page) == live_expected, cards(page))
    ok('outage: no uncaught JS errors', not [e for e in errs if 'pageerror' in e], errs[:3])

    page.evaluate("localStorage.clear()"); page.reload(); page.wait_for_selector('[data-notice-id="content-status"]', timeout=20000)
    txt = notice(page).inner_text()
    ok('outage with NO saved copy: says BUILT-IN content (a different message from saved)', attr(page, 'data-content-source') == 'snapshot' and 'Showing built-in content' in txt and 'saved on' not in txt, txt)
    snap_team = page.evaluate("window.BLITZ_DATA.team.length")
    ok('outage with no cache: bundled snapshot still renders the page', snap_team > 0 and cards(page) == snap_team, (cards(page), snap_team))

    ctx.unroute(SC)
    notice(page).locator('button:has-text("Try again")').click()
    wait_status(page, 'live')
    ok('recovery: "Try again" fetches live data, warning disappears, source is live', notice(page).count() == 0 and attr(page, 'data-content-source') == 'live' and cards(page) == live_expected, (cards(page), live_expected))

    # recovery without clicking anything: the browser coming back online
    ctx.route(SC, abort); page.reload(); page.wait_for_selector('[data-notice-id="content-status"]', timeout=20000)
    ctx.unroute(SC); page.evaluate("window.dispatchEvent(new Event('online'))"); wait_status(page, 'live')
    ok('recovery: coming back online refreshes by itself', notice(page).count() == 0)
    b.close()

    print('\n== PUBLIC SITE: other failure shapes   [SIMULATED responses]')
    def run_case(handler, wait_ms=20000):
        b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
        ctx.route(SC, handler); page.goto(f'{SITE}/index.html'); page.wait_for_selector('[data-notice-id="content-status"]', timeout=wait_ms)
        return b, ctx, page, errs
    c500 = {'n': 0}
    def h500(r): c500['n'] += 1; r.fulfill(status=500, content_type='application/json', body='{"code":"XX000","message":"internal boom at /var/lib/postgresql/x"}')
    b, ctx, page, errs = run_case(h500); txt = notice(page).inner_text()
    ok('HTTP 500: transient, retried 3 times in total, code BLITZ-DB-001', c500['n'] == 3 and 'BLITZ-DB-001' in txt, (c500, txt))
    ok('HTTP 500: server wording and internal paths are never shown', 'boom' not in page.inner_text('body') and '/var/lib' not in page.inner_text('body'))
    b.close()

    c401 = {'n': 0}
    def h401(r): c401['n'] += 1; r.fulfill(status=401, content_type='application/json', body='{"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}')
    b, ctx, page, errs = run_case(h401); txt = notice(page).inner_text()
    ok('rejected key: permanent, NOT retried (1 request), code BLITZ-CFG-003, no Try again button', c401['n'] == 1 and 'BLITZ-CFG-003' in txt and 'Try again' not in txt, (c401, txt))
    ok('rejected key: site still renders its built-in content', cards(page) > 0)
    b.close()

    cbad = {'n': 0}
    def hbad(r): cbad['n'] += 1; r.fulfill(status=200, content_type='application/json', body='{"unexpected": true}')
    b, ctx, page, errs = run_case(hbad); txt = notice(page).inner_text()
    ok('malformed 200 response: treated as unusable (BLITZ-DATA-004), existing content kept', 'BLITZ-DATA-004' in txt and cards(page) > 0, txt)
    b.close()

    cempty = {'n': 0}
    def hempty(r): cempty['n'] += 1; r.fulfill(status=200, content_type='application/json', body=json.dumps({'announcements': [], 'events': [], 'team': [], 'gallery': [], 'collaborations': []}))
    b, ctx, page, errs = run_case(hempty); ok('empty live response never blanks the site and says why', 'BLITZ-DATA-004' in notice(page).inner_text() and cards(page) > 0); b.close()

    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    page.route('**/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body="window.BLITZ_CONFIG = { supabaseUrl: 'not a url', supabaseKey: 'short' };"))
    page.goto(f'{SITE}/index.html'); page.wait_for_selector('[data-notice-id="content-status"]', timeout=8000); txt = notice(page).inner_text()
    ok('invalid configuration: built-in content + BLITZ-CFG-001, no request made, no Try again', 'BLITZ-CFG-001' in txt and 'Try again' not in txt and cards(page) > 0, txt)
    b.close()
    b, ctx = new_context(p); page = ctx.new_page()
    page.route('**/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body="window.BLITZ_CONFIG = { supabaseUrl: '', supabaseKey: '' };"))
    page.goto(f'{SITE}/index.html'); page.wait_for_timeout(800)
    ok('live updates deliberately not configured: no warning (it is intended)', notice(page).count() == 0 and attr(page, 'data-content-source') == 'snapshot')
    b.close()
    b, ctx = new_context(p); page = ctx.new_page()
    page.route('**/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body="window.BLITZ_CONFIG = { supabaseUrl: '%s', supabaseKey: 'sb_secret_abcdefghijklmnopqrstuvwxyz' };" % API))
    reqs = []; ctx.on('request', lambda r: reqs.append(r.url) if 'site_content' in r.url else None)
    page.goto(f'{SITE}/index.html'); page.wait_for_timeout(1000)
    ok('a SECRET key in config.js is refused: no request is ever sent with it', not reqs and notice(page).count() == 1)
    b.close()

    print('\n== PUBLIC SITE: one broken section must not blank the page')
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    def poison(r):
        resp = r.fetch(); body = resp.text().replace('function renderTeam() {', "function renderTeam() { throw new Error('simulated team failure');", 1); r.fulfill(response=resp, body=body)
    page.route('**/script.js', poison); page.goto(f'{SITE}/index.html'); page.wait_for_timeout(1500)
    ok('a section that throws is caught and logged, not thrown', any(x.startswith('render-team:') for x in op_log(page)), op_log(page))
    ok('...and events, gallery and the rest of the page still render', page.locator('.events-panel').count() > 0 and page.locator('#main-content, main').count() > 0 and not [e for e in errs if 'pageerror' in e], errs[:3])
    b.close()

    b, ctx = new_context(p); page = ctx.new_page(); page.goto(f'{SITE}/index.html'); wait_status(page, 'live')
    for _ in range(3): page.evaluate("setTimeout(() => Promise.reject(new Error('secret internal boom')), 0)")
    page.wait_for_timeout(300)
    ok('unhandled promise rejection: reported ONCE (de-duplicated), friendly, no raw message', page.locator('[data-notice-id^="error:"]').count() == 1 and 'secret internal boom' not in page.locator('#blitz-notices').inner_text())
    b.close()

    print('\n== PUBLIC SITE: event pages, direct URLs, refresh')
    def event_state(page, wait='#lp-state:not([hidden])'):
        page.wait_for_selector(wait, timeout=15000); return page.inner_text('#lp-state')
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    page.goto(f'{SITE}/event.html?event=does-not-exist'); wait_status(page, 'live')
    t = event_state(page)
    ok('unknown event id: clear "Event not found" with a way out', 'Event not found' in t and 'Browse all events' in t and 'BLITZ-DATA-001' in t, t)
    ok('unknown event id: page is marked noindex and no window opened', page.locator('meta[name=robots][content=noindex]').count() == 1 and page.locator('.lp-window').count() == 0)
    page.reload(); wait_status(page, 'live'); ok('unknown event id: survives a browser refresh', 'Event not found' in event_state(page))
    page.click('#lp-state button:has-text("Browse all events")')
    ok('"Browse all events" clears the state and the address', page.locator('#lp-state').is_hidden() and 'event=' not in page.url and page.locator('.lp-tile').count() > 0)
    page.goto(f'{SITE}/event.html?event=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E'); t = event_state(page)
    ok('invalid event id (markup): rejected as invalid, never echoed into the page', "isn't valid" in t and 'BLITZ-DATA-002' in t and page.locator('#lp-state img').count() == 0, t)
    page.goto(f'{SITE}/event.html?event=secret-draft'); wait_status(page, 'live'); t = event_state(page)
    ok('[REAL RLS] unpublished (draft-only) event is "not found" publicly and its title never appears', 'Event not found' in t and 'Secret Draft Event' not in page.content())
    s, bb = http('GET', '/events_public?id=eq.secret-draft'); ok('[REAL RLS] anon API cannot read the draft through the public view either', s == 200 and json.loads(bb) == [], (s, bb[:80]))
    s, bb = http('POST', '/rpc/site_content', body={}); ok('[REAL RLS] site_content() does not include the draft', 'secret-draft' not in bb)
    b.close()

    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    page.goto(f'{SITE}/event.html?event=live-only-evt')
    page.wait_for_selector('.lp-window h2:has-text("Live Only Event")', timeout=15000)
    ok('direct URL to an event that exists ONLY in live data opens it once live data arrives', True)
    ok('...with no leftover error state', page.locator('#lp-state').is_hidden())
    page.reload(); page.wait_for_selector('.lp-window h2:has-text("Live Only Event")', timeout=15000); ok('...and survives a browser refresh', True)
    ok('no uncaught JS errors on event pages', not [e for e in errs if 'pageerror' in e], errs[:3])
    b.close()

    b, ctx = new_context(p); page = ctx.new_page()
    ctx.route(SC, lambda r: r.abort())
    page.goto(f'{SITE}/event.html?event=live-only-evt'); page.wait_for_function("document.querySelector('#lp-state') && document.querySelector('#lp-state').textContent.includes(\"Couldn't load\")", timeout=25000); t = page.inner_text('#lp-state')
    ok("outage + unknown-to-snapshot event: says it COULDN'T LOAD (not falsely 'not found') and offers Try again", "Couldn't load this event" in t and 'Try again' in t and 'Event not found' not in t, t)
    ctx.unroute(SC); page.click('#lp-state button:has-text("Try again")')
    page.wait_for_selector('.lp-window h2:has-text("Live Only Event")', timeout=15000); ok('...and Try again then opens the event', True)
    b.close()

    b, ctx = new_context(p); page = ctx.new_page()
    page.goto(f'{SITE}/event.html?event=agentic-ai-speaker-session-2026')
    page.wait_for_selector('#lp-state:not([hidden])', timeout=15000); t = page.inner_text('#lp-state')
    ok('an event unpublished after the snapshot was built: window closes and the visitor is told why', 'no longer available' in t and page.locator('.lp-window').count() == 0, t)
    b.close()

    b, ctx = new_context(p); page = ctx.new_page(); page.goto(f'{SITE}/event.html'); wait_status(page, 'live')
    page.fill('#lp-search', 'zzzqqqxxx'); t = event_state(page)
    ok('empty search: explains, names the query, offers Clear search', 'No events match' in t and 'zzzqqqxxx' in t and 'Clear search' in t, t)
    page.click('#lp-state button:has-text("Clear search")')
    ok('...clearing restores every event', page.locator('#lp-state').is_hidden() and page.locator('.lp-tile').count() > 0)
    page.fill('#lp-search', '<b>x</b>'); t = event_state(page); ok('empty search with markup is shown as text', page.locator('#lp-state b').count() == 0)
    b.close()

    print('\n== PUBLIC SITE: broken images and connectivity')
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    page.route('**/storage/v1/object/public/media/events/missing.webp', lambda r: r.fulfill(status=404, content_type='text/plain', body='nope'))
    page.goto(f'{SITE}/event.html?event=img-evt'); page.wait_for_selector('.lp-window h2:has-text("Broken Image Event")', timeout=15000)
    page.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>{i.loading='eager'})")
    try: page.wait_for_selector('.lp-window img.is-broken', state='attached', timeout=8000)
    except Exception: pass
    ok('event image that 404s: marked broken (no broken-image icon) and the window still works', page.locator('.lp-window img.is-broken').count() >= 1 and page.locator('.lp-window h2').count() >= 1, page.evaluate("[...document.querySelectorAll('.lp-window img')].map(i=>i.src+'|'+i.className)"))
    ok('...and the failure is logged silently (no scary popup for a missing picture)', page.locator('[data-notice-id^="error:"]').count() == 0)
    b.close()
    b, ctx = new_context(p); page = ctx.new_page()
    page.route('**/assets/images/team/vinita-jindal.webp', lambda r: r.abort())
    page.goto(f'{SITE}/index.html'); page.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>{i.loading='eager'})"); page.evaluate("document.querySelector('#team').scrollIntoView()"); page.wait_for_timeout(2500)
    ok('missing team photo falls back to the neutral avatar', page.evaluate("[...document.querySelectorAll('.team-card img')].some(i=>i.getAttribute('data-blitz-fallback')==='avatar' && /avatar-placeholder/.test(i.src))"))
    b.close()
    b, ctx = new_context(p); page = ctx.new_page(); page.goto(f'{SITE}/index.html'); wait_status(page, 'live')
    ctx.set_offline(True); page.wait_for_selector('[data-notice-id="offline"]', timeout=5000)
    ok('going offline shows a clear "You are offline" notice', 'you are offline' in notice(page, 'offline').inner_text().lower() and 'Something went wrong' not in notice(page, 'offline').inner_text(), notice(page, 'offline').inner_text())
    ctx.set_offline(False); page.wait_for_function("!document.querySelector('[data-notice-id=\"offline\"]')", timeout=5000); ok('...and it goes away when the connection returns', True)
    b.close()

    print('\n== PANEL: failed writes keep the form, never claim success   [SIMULATED network]')
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs); login(page, 'editor'); page.wait_for_selector('h1:has-text("Dashboard")')
    def open_new_announcement(title):
        page.goto(f'{SITE}/prezi_panel/#/announcements/new'); page.wait_for_selector('input[name=title]')
        page.fill('input[name=title]', title); page.fill('input[name=date]', '2026-12-01'); page.fill('textarea[name=summary]', 'Typed summary that must survive failures')
    def toast_text(): return page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')")
    def clear_toasts(): page.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")
    POSTS = re.compile(r'/rest/v1/announcements(\?.*)?$')

    open_new_announcement('Failure Test One')
    ctx.route(POSTS, lambda r: r.abort() if r.request.method == 'POST' else r.continue_())
    page.click('button[type=submit]'); page.wait_for_selector('.toast--error', timeout=10000); t = toast_text()
    ok('failed create: error toast names the problem, the code, and what to do', 'could not reach the server' in t.lower() and 'BLITZ-NET-002' in t, t)
    ok('failed create: warns the outcome is unknown, so nothing is saved twice', 'could not confirm whether the change was saved' in t.lower(), t)
    ok('failed create: NO success message was shown', 'Created' not in t)
    ok('failed create: every typed value is still in the form', page.input_value('input[name=title]') == 'Failure Test One' and page.input_value('textarea[name=summary]') == 'Typed summary that must survive failures')
    ok('failed create: Save button is usable again with its original label', page.is_enabled('button[type=submit]') and 'Create announcement' in page.inner_text('button[type=submit]'))
    ok('failed create: nothing reached the database', not q("select 1 from public.announcements where id='failure-test-one'"))
    ctx.unroute(POSTS); clear_toasts()
    page.click('button[type=submit]'); ok('retry after the connection returns: saved', flash(page, 'Created', 8000))
    ok('retry created exactly one row', q("select count(*) from public.announcements where id='failure-test-one'")[0][0] == 1)

    print('\n== PANEL: the response is lost but the write landed (the dangerous case)   [SIMULATED]')
    open_new_announcement('Landed But Lost')
    def lose_response(r):
        if r.request.method != 'POST': return r.continue_()
        r.fetch(); r.abort()                       # the server really processed it; the browser never hears back
    ctx.route(POSTS, lose_response)
    page.click('button[type=submit]'); page.wait_for_selector('.toast--error', timeout=10000); t = toast_text()
    ok('lost response: told it may or may not have saved, and to check before retrying', 'could not confirm' in t.lower(), t)
    ok('lost response: the row IS in the database (so a naive retry would have duplicated or errored)', q("select count(*) from public.announcements where id='landed-but-lost'")[0][0] == 1)
    ctx.unroute(POSTS); clear_toasts(); page.click('button[type=submit]')
    ok('retry detects the earlier attempt succeeded: no false "already exists", no duplicate', flash(page, 'already been saved by your earlier attempt', 8000))
    ok('...exactly one row remains', q("select count(*) from public.announcements where id='landed-but-lost'")[0][0] == 1)
    page.wait_for_url(re.compile(r'#/announcements$'))

    print('\n== PANEL: duplicate submission is blocked')
    open_new_announcement('Double Click'); posted = {'n': 0}
    def count_post(r):
        if r.request.method == 'POST': posted['n'] += 1
        r.continue_()
    ctx.route(POSTS, count_post)
    page.dblclick('button[type=submit]'); page.wait_for_url(re.compile(r'#/announcements$'), timeout=10000)
    ctx.unroute(POSTS)
    ok('double-click on Save sent ONE request', posted['n'] == 1, posted)
    ok('...and created ONE row', q("select count(*) from public.announcements where id='double-click'")[0][0] == 1)

    print('\n== PANEL: publish / unpublish / delete failures')
    q("insert into public.announcements (id,title,date,published) values ('err-ann','Err Announcement','2026-01-01',true) on conflict (id) do update set published=true")
    page.goto(f'{SITE}/prezi_panel/#/announcements'); page.wait_for_selector('.item:has-text("Err Announcement")'); clear_toasts()
    PATCH = re.compile(r'/rest/v1/announcements\?.*')
    ctx.route(PATCH, lambda r: r.fulfill(status=500, content_type='application/json', body='{"code":"XX000","message":"internal error near /srv/pg"}') if r.request.method == 'PATCH' else r.continue_())
    page.click('button[aria-label="Unpublish Err Announcement"]'); page.wait_for_selector('.toast--error', timeout=10000); t = toast_text()
    ok('failed unpublish: error shown with code, NO "Unpublished" success message', 'BLITZ-DB-001' in t and 'Unpublished.' not in t, t)
    ok('failed unpublish: internal server text is not leaked into the UI', '/srv/pg' not in t)
    ok('failed unpublish: database unchanged, and the list still says Published', q("select published from public.announcements where id='err-ann'")[0][0] is True and page.locator('.item:has-text("Err Announcement") .badge--live').count() == 1)
    ctx.unroute(PATCH)

    clear_toasts(); page.wait_for_selector('button[aria-label="Unpublish Err Announcement"]:not([disabled])')
    q("delete from public.announcements where id='err-ann'")      # removed behind the page's back: UPDATE now matches zero rows and PostgREST answers 200 []
    page.click('button[aria-label="Unpublish Err Announcement"]'); page.wait_for_selector('.toast--error', timeout=10000); t = toast_text()
    ok('[REAL] a write that changed ZERO rows (RLS / already deleted) is reported as a FAILURE, code BLITZ-DB-005', 'BLITZ-DB-005' in t and 'Unpublished.' not in t, t)
    page.locator('.item', has_text='Err Announcement').wait_for(state='detached', timeout=8000); ok('[REAL] ...and the list refreshes to show reality', True)

    print('\n== PANEL: expired session while editing   [SIMULATED expiry]')
    clear_toasts(); open_new_announcement('Expired Session Test')
    ctx.route(POSTS, lambda r: r.fulfill(status=401, content_type='application/json', body='{"code":"PGRST301","message":"JWT expired"}') if r.request.method == 'POST' else r.continue_())
    page.click('button[type=submit]'); page.wait_for_selector('dialog[open] h2:has-text("Your session expired")', timeout=10000)
    ok('expired session: re-sign-in dialog appears on top of the page', True)
    ok('expired session: the form behind it keeps everything that was typed', page.input_value('input[name=title]') == 'Expired Session Test' and page.input_value('textarea[name=summary]') == 'Typed summary that must survive failures')
    page.fill('dialog input[type=password]', 'wrong-password-xyz'); page.click('dialog button:has-text("Sign in again")'); page.wait_for_selector('dialog .err:not([hidden])', timeout=8000)
    ok('wrong password in the dialog: stays open with a message', 'incorrect' in page.inner_text('dialog .err').lower())
    page.fill('dialog input[type=password]', PW['editor']); page.click('dialog button:has-text("Sign in again")'); page.wait_for_selector('dialog[open]', state='detached', timeout=8000)
    ctx.unroute(POSTS); clear_toasts()
    ok('after signing in again the form is intact and saving works', page.input_value('input[name=title]') == 'Expired Session Test')
    page.click('button[type=submit]'); ok('...saved after re-authentication', flash(page, 'Created', 8000))
    ok('...exactly once', q("select count(*) from public.announcements where id='expired-session-test'")[0][0] == 1)

    print('\n== PANEL: validation happens before any write')
    page.goto(f'{SITE}/prezi_panel/#/events/new'); page.wait_for_selector('input[name=title]'); evposts = {'n': 0}
    def count_ev(r):
        if r.request.method == 'POST': evposts['n'] += 1
        r.continue_()
    ctx.route(re.compile(r'/rest/v1/events(\?.*)?$'), count_ev)
    page.fill('input[name=title]', 'Bad Details Event'); page.fill('input[name=category]', 'Test'); page.fill('textarea[name=description]', 'd')
    page.fill('input[name=id]', 'code-verse-2026')
    page.click('summary:has-text("Template details")'); page.fill('textarea[name=event_details]', '{"registration": {"url": "javascript:alert(1)"}, "links": ["http://insecure.example"]}')
    page.uncheck('input[name=published]'); page.click('button[type=submit]'); page.wait_for_timeout(600)
    errtext = ' '.join(page.evaluate("[...document.querySelectorAll('.err:not([hidden])')].map(e=>e.textContent)"))
    ok('[REAL] duplicate event ID (read from the database) is refused with a field-specific message', 'already used by another event' in errtext, errtext)
    page.fill('input[name=id]', 'bad-details-event'); page.click('button[type=submit]'); page.wait_for_timeout(600)
    errtext = ' '.join(page.evaluate("[...document.querySelectorAll('.err:not([hidden])')].map(e=>e.textContent)"))
    ok('unsafe/insecure links inside event_details are refused, naming the exact path', 'registration.url' in errtext and 'https://' in errtext, errtext)
    ok('...and the second insecure link too (links[0])', 'links[0]' in errtext, errtext)
    page.fill('input[name=id]', 'bad-details-event'); page.fill('textarea[name=event_details]', '{ not json')
    page.click('button[type=submit]'); page.wait_for_timeout(400); ok('invalid JSON in event_details is refused', 'valid JSON object' in page.inner_text('main'))
    page.fill('textarea[name=event_details]', json.dumps({'objectives': ['x' * 200] * 400}))
    page.click('button[type=submit]'); page.wait_for_timeout(500); body = page.inner_text('main')
    ok('oversized event_details is refused before the database is touched', 'too large' in body.lower(), body[:300])
    ok('none of those attempts sent a write', evposts['n'] == 0, evposts)
    ctx.unroute(re.compile(r'/rest/v1/events(\?.*)?$'))

    print('\n== PANEL: template import validation')
    page.goto(f'{SITE}/prezi_panel/#/events/new'); page.wait_for_selector('select#event-editor-mode'); page.select_option('select#event-editor-mode', 'template'); page.wait_for_selector('.template-panel:not([hidden])')
    def imp(name, content):
        page.set_input_files('.template-panel input[type=file]', files=[{'name': name, 'mimeType': 'application/json', 'buffer': content if isinstance(content, bytes) else content.encode()}])
        page.wait_for_selector('.template-result:not([hidden])'); page.wait_for_timeout(500); return page.inner_text('.template-result')
    r = imp('broken.json', '{\n  "template": "BLITZ_EVENT",\n  "version": 1,\n  "event": {"title": "x",\n}')
    ok('malformed JSON: says it is invalid AND where (line), and nothing was imported', 'Invalid JSON' in r and 'line' in r and 'Nothing was imported' in r and page.is_disabled('button:has-text("Import into form")'), r)
    r = imp('thin.json', json.dumps({'template': 'BLITZ_EVENT', 'version': 1, 'event': {'title': 'Only a title'}}))
    ok('missing required fields: each one is named', 'category' in r and 'description' in r, r)
    r = imp('typo.json', json.dumps({'template': 'BLITZ_EVENT', 'version': 1, 'event': {'title': 't', 'category': 'c', 'description': 'd', 'titel': 'typo'}}))
    ok('unknown field (a typo) is rejected, not silently dropped', 'titel' in r, r)
    r = imp('wrongver.json', json.dumps({'template': 'BLITZ_EVENT', 'version': 99, 'event': {}}))
    ok('wrong template version is rejected', 'version' in r.lower(), r)
    r = imp('baddate.json', json.dumps({'template': 'BLITZ_EVENT', 'version': 1, 'event': {'title': 't', 'category': 'c', 'description': 'd', 'date': '2026-02-31'}}))
    ok('impossible date (31 Feb) is rejected, naming the field', 'date' in r.lower() and 'Template needs attention' in r, r)
    r = imp('dup.json', json.dumps({'template': 'BLITZ_EVENT', 'version': 1, 'event': {'id': 'code-verse-2026', 'title': 't', 'category': 'c', 'description': 'd'}}))
    ok('[REAL] duplicate of an existing event ID (read from the database) is rejected', 'Another event already uses' in r, r)
    r = imp('unsafe.json', json.dumps({'template': 'BLITZ_EVENT', 'version': 1, 'event': {'title': 't', 'category': 'c', 'description': 'd', 'registration': {'url': 'javascript:alert(1)'}}}))
    ok('script link in registration URL is rejected with its path', 'registration.url' in r, r)
    r = imp('huge.json', b'{"template":"BLITZ_EVENT","version":1,"event":{"title":"' + b'x' * 1100000 + b'"}}')
    ok('file over 1 MB is rejected', '1 MB' in r, r[:120])
    good = json.loads(open(os.path.join(ROOT, 'BLITZ_EVENT_TEMPLATE.json')).read()); good['event'].update({'id': 'imported-ok', 'title': 'Imported OK', 'category': 'Workshop', 'description': 'Valid import.'})
    r = imp('good.json', json.dumps(good)); ok('a valid template validates and enables Import', 'Template validated' in r and page.is_enabled('button:has-text("Import into form")'), r)
    n0 = q("select count(*) from public.events")[0][0]; page.click('button:has-text("Import into form")'); page.wait_for_selector('input[name=title]'); page.wait_for_timeout(300)
    ok('importing fills the form but saves NOTHING', page.input_value('input[name=title]') == 'Imported OK' and q("select count(*) from public.events")[0][0] == n0)
    ok('no uncaught JS errors in the panel', not [e for e in errs if 'pageerror' in e], [e for e in errs if 'pageerror' in e][:3])
    b.close()

    print('\n== PANEL + SITE: a REAL broken schema, diagnosed precisely, then repaired with the project\'s own migration   [REAL]')
    def reload_schema(): q("NOTIFY pgrst, 'reload schema'"); time.sleep(1.5)
    def wait_for(pred, secs=15):
        end = time.time() + secs
        while time.time() < end:
            if pred(): return True
            time.sleep(0.4)
        return False
    tok = jwt_for('editor')
    cur.execute("alter table public.events drop column event_details cascade"); reload_schema()
    ok('[REAL] column is genuinely gone (API now rejects it)', wait_for(lambda: http('GET', '/events?select=event_details&limit=1', token=tok)[0] == 400))

    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    page.goto(f'{SITE}/index.html'); page.wait_for_selector('[data-notice-id="content-status"]', timeout=20000); txt = page.inner_text('#blitz-notices')
    ok('[REAL] public site with the content function failing: falls back, shows a code, leaks no database detail', 'BLITZ-SCH-001' in txt and 'event_details' not in page.inner_text('body') and 'column' not in txt.lower() and cards(page) > 0, txt)
    b.close()

    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs); login(page, 'editor'); page.wait_for_selector('h1:has-text("Dashboard")')
    page.click('button:has-text("Run system check")'); page.wait_for_selector('#system-check .item', timeout=60000)
    rep = page.inner_text('#system-check')
    ok('[REAL] system check reports problems and says nothing was changed', 'problem' in rep.lower() and 'Nothing was changed' in rep, rep[:200])
    ok('[REAL] it names the missing column and the RIGHT migration file', 'event_details' in rep and 'migration_add_event_details.sql' in rep, rep)
    ok('[REAL] it does NOT tell you to ALTER TABLE ... ADD COLUMN ... text (the column is jsonb)', 'ADD COLUMN' not in rep.upper() and ' text' not in rep.split('event_details')[1][:60].lower())
    ok('[REAL] it tells you to check first and mentions the schema-cache alternative', 'diagnostic query' in rep and 'reload' in rep.lower())
    ok('[REAL] unaffected parts still report OK (admin access, storage)', 'OK · Admin access' in rep and 'OK · Image storage' in rep, rep)

    page.goto(f'{SITE}/prezi_panel/#/events/new'); page.wait_for_selector('input[name=title]')
    page.fill('input[name=title]', 'Needs Details'); page.fill('input[name=category]', 'Test'); page.fill('textarea[name=description]', 'd'); page.uncheck('input[name=published]')
    page.click('summary:has-text("Template details")'); page.fill('textarea[name=event_details]', '{"objectives": ["something real"]}')
    page.click('button[type=submit]'); page.wait_for_selector('.toast--error', timeout=10000); t = toast_text()
    ok('[REAL] saving real details into the missing column fails LOUDLY with BLITZ-SCH-001 and the right guidance', 'BLITZ-SCH-001' in t and 'event_details' in t and 'jsonb' in t and 'migration_add_event_details.sql' in t, t)
    ok('[REAL] ...no success message, nothing saved, form intact', 'Created' not in t and not q("select 1 from public.events where id='needs-details'") and page.input_value('input[name=title]') == 'Needs Details')
    clear_toasts(); page.fill('textarea[name=event_details]', '{}'); page.click('button[type=submit]')
    ok('[REAL] an EMPTY value for the missing column can still be saved, but the person is told the field was left out', flash(page, 'does not recognise the field', 10000))

    sql = open(os.path.join(ROOT, 'supabase/migration_add_event_details.sql')).read()
    cur.execute(sql); reload_schema()
    ok('[REAL] repair: the repo migration restores the column as jsonb', q("select data_type from information_schema.columns where table_schema='public' and table_name='events' and column_name='event_details'")[0][0] == 'jsonb')
    ok('[REAL] repair: API accepts the column again (after schema reload)', wait_for(lambda: http('GET', '/events?select=event_details&limit=1', token=tok)[0] == 200))
    page.goto(f'{SITE}/prezi_panel/#/'); page.wait_for_selector('h1:has-text("Dashboard")'); page.click('button:has-text("Run system check")')
    page.wait_for_selector('#system-check .notice', timeout=60000); rep = page.inner_text('#system-check')
    ok('[REAL] repair: system check is healthy again', 'looks healthy' in rep and 'Problem ·' not in rep, rep[:300])
    page.goto(f'{SITE}/prezi_panel/#/events/new'); page.wait_for_selector('input[name=title]')
    page.fill('input[name=title]', 'Needs Details Two'); page.fill('input[name=category]', 'Test'); page.fill('textarea[name=description]', 'd'); page.uncheck('input[name=published]')
    page.click('summary:has-text("Template details")'); page.fill('textarea[name=event_details]', '{"objectives": ["something real"]}'); page.click('button[type=submit]')
    ok('[REAL] repair: the same save now succeeds', flash(page, 'Created', 10000))
    ok('[REAL] ...and the details round-trip as real JSON', q("select event_details->'objectives'->>0 from public.events where id='needs-details-two'")[0][0] == 'something real')
    b.close()

    # missing RPC
    cur.execute("alter function public.site_content() rename to site_content_hidden"); reload_schema()
    ok('[REAL] content function genuinely missing', wait_for(lambda: http('POST', '/rpc/site_content', body={})[0] == 404))
    b, ctx = new_context(p); page = ctx.new_page(); login(page, 'editor'); page.wait_for_selector('h1:has-text("Dashboard")')
    page.click('button:has-text("Run system check")'); page.wait_for_selector('#system-check .item', timeout=60000); rep = page.inner_text('#system-check')
    ok('[REAL] missing RPC is diagnosed as a missing function (BLITZ-SCH-003), not a vague failure', 'BLITZ-SCH-003' in rep and 'site_content' in rep, rep)
    b.close()
    b, ctx = new_context(p); page = ctx.new_page(); page.goto(f'{SITE}/index.html'); page.wait_for_selector('[data-notice-id="content-status"]', timeout=20000)
    ok('[REAL] public site with the function missing: built-in content + BLITZ-SCH-003, still renders', 'BLITZ-SCH-003' in page.inner_text('#blitz-notices') and cards(page) > 0)
    cur.execute("alter function public.site_content_hidden() rename to site_content"); reload_schema()
    wait_for(lambda: http('POST', '/rpc/site_content', body={})[0] == 200)
    page.locator('[data-notice-id="content-status"] button:has-text("Try again")').count()
    page.reload(); wait_status(page, 'live', 20000); ok('[REAL] recovery: public site returns to live content once the function is back', notice(page).count() == 0)
    b.close()

print(f"\n{sum(1 for g, _ in R if g)}/{len(R)} passed")
sys.exit(0 if all(g for g, _ in R) else 1)
