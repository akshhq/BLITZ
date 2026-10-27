#!/usr/bin/env python3
"""
Acceptance tests: event image carousel + Gallery built from event images.

Same stack as run_e2e.py (REAL Postgres + REAL PostgREST + real Chromium; Supabase login/storage are the local stand-in).
Do not run it at the same time as the other e2e scripts (shared ports 3000 and 54321).

    python supabase/tests/e2e/run_image_tests.py  [path-to-postgrest-binary]
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
DB = 'blitz_img'
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
TEAM = ['aditya-raj', 'aksh-kumar', 'anand', 'ashutosh-singh', 'eesha', 'jyoti-kumari']
def team_path(i): return f'assets/images/team/{TEAM[i % len(TEAM)]}.webp'
import shutil, tempfile
TMP = tempfile.mkdtemp()
COLORS = [(200, 60, 60), (60, 160, 90), (70, 90, 200), (210, 170, 40), (150, 60, 170)]
PNGS = []
for i, c in enumerate(COLORS):
    pth = os.path.join(TMP, f'pic{i}.png'); test_png(pth, color=c, size=(1600, 900)); PNGS.append(pth)

def open_groups(page): page.evaluate("document.querySelectorAll('details.group').forEach(d => { d.open = true; })")
def gal_cards(page): return page.locator('.gal-card').count()
def toast_text(page): return page.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')")
def clear_toasts(page): page.evaluate("document.querySelectorAll('.toast').forEach(t=>t.remove())")
def imgs(event_id): return q("select id::text, image, gallery_enabled, sort_order from public.event_images where event_id=%s order by sort_order, created_at", event_id)
def add_images(page, paths):
    with page.expect_file_chooser() as fc: page.locator('.evimg-field > .repeat-row-actions button').first.click()
    fc.value.set_files(paths)
    for i in range(len(paths)):
        page.wait_for_selector('canvas.crop-canvas', timeout=15000)
        if len(paths) > 1: page.wait_for_selector(f'dialog:has-text("{i + 1} of {len(paths)}")', timeout=30000)   # "Position the event image (2 of 3)"
        page.click('button:has-text("Use this crop")')
        if i < len(paths) - 1: page.wait_for_selector(f'dialog:has-text("{i + 2} of {len(paths)}")', timeout=30000)
    page.wait_for_selector('canvas.crop-canvas', state='detached', timeout=15000)
def public_gallery(p, wait_live=True):
    b, ctx = new_context(p); pg = ctx.new_page(); pg.goto(f'{SITE}/index.html')
    pg.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000)
    res = pg.evaluate("[...document.querySelectorAll('.gallery-item')].map(f=>({title:f.querySelector('.gallery-item-title')&&f.querySelector('.gallery-item-title').textContent, src:(f.querySelector('img')||{}).src||''}))")
    b.close(); return res

# Events B (4 images, published) and C (2 images, draft) exist already; A is created through the panel.
q("insert into public.events (id,title,description,category,published,date) values ('event-b','Event B','Has four images.','Test',true,'2026-03-02'),('event-c','Event C','Has two images.','Test',false,'2026-02-01')")
for i in range(4): q("insert into public.event_images (event_id,image,sort_order) values ('event-b',%s,%s)", team_path(i), (i + 1) * 10)
for i in range(2): q("insert into public.event_images (event_id,image,sort_order) values ('event-c',%s,%s)", team_path(i + 4), (i + 1) * 10)
# A single-image event saved before multi-image support: only events.image, NO event_images row at all.
q("insert into public.events (id,title,description,category,image,published,date) values ('legacy-one','Legacy One','Single image, old style.','Test',%s,true,'2026-01-01')", team_path(2))

with sync_playwright() as p:
    print('\n== 1. Prezi Panel: several images on one event')
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs); login(page, 'editor'); page.wait_for_selector('h1:has-text("Dashboard")')
    page.goto(f'{SITE}/prezi_panel/#/events/new'); page.wait_for_selector('input[name=title]')
    page.fill('input[name=title]', 'Image Fest'); page.fill('input[name=category]', 'Festival'); page.fill('textarea[name=description]', 'An event with several images.')
    page.uncheck('input[name=published]')                       # start as a draft (checks 10 and 4 need that)
    open_groups(page)
    add_images(page, PNGS[:3])
    ok('1  three images are listed in the editor, in the order chosen, the first marked Cover', page.locator('.evimg').count() == 3 and 'Cover' in page.locator('.evimg-pos').first.inner_text())
    page.click('button[type=submit]'); ok('1  event with 3 images saved', flash(page, 'Created', 15000))
    A = imgs('image-fest')
    ok('1  3 rows in event_images, each with its own id, belonging to the event, in order', len(A) == 3 and [r[3] for r in A] == [10, 20, 30] and len({r[0] for r in A}) == 3, A)
    ok('1  new images default to NOT in the Gallery', all(r[2] is False for r in A))
    ok('1  the event cover (events.image) is the first image', q("select image from public.events where id='image-fest'")[0][0] == A[0][1])
    s, _ = http('GET', '/storage/v1/object/public/media/' + A[0][1].replace('storage:', ''), key=False) if False else (200, '')
    ok('1  images were stored with the existing Supabase Storage upload (storage: references)', all(r[1].startswith('storage:events/') for r in A), A)

    print('\n== 2. Prezi Panel Gallery shows ALL event images combined (A:3 + B:4 + C:2 = 9)')
    page.goto(f'{SITE}/prezi_panel/#/gallery'); page.wait_for_selector('.gal-card')
    ok('2  9 images are listed (including those of a DRAFT event and of events not in the public Gallery)', gal_cards(page) == 9, gal_cards(page))
    ok('2  every image shows its event title', all(any(t in c for t in ('Image Fest', 'Event B', 'Event C')) for c in page.locator('.gal-card').all_inner_texts()))
    ok('2  grouped per event with the right counts', page.locator('.gal-event').count() == 3 and page.locator('.gal-event:has-text("Image Fest") .gal-card').count() == 3 and page.locator('.gal-event:has-text("Event B") .gal-card').count() == 4 and page.locator('.gal-event:has-text("Event C") .gal-card').count() == 2)
    ok('2  a draft event is labelled as such', page.locator('.gal-event:has-text("Event C") .badge--draft').count() == 1 and page.locator('.gal-event:has-text("Image Fest") .badge--draft').count() == 1)
    ok('2  there is no upload control and no gallery-specific filter in the Gallery section', page.locator('input[type=file]').count() == 0 and page.locator('button:has-text("Choose image")').count() == 0 and page.locator('select, input[type=search]').count() == 0)
    ok('2  every image has a star toggle, all off', page.locator('.gal-star').count() == 9 and page.locator('.gal-star[aria-pressed="true"]').count() == 0)

    print('\n== 3. One star on, the others off')
    star = page.locator('.gal-event:has-text("Image Fest") .gal-card').nth(1).locator('.gal-star')
    star.click(); page.wait_for_selector('.toast--ok', timeout=8000)
    A = imgs('image-fest')
    ok('3  exactly that one image is enabled in the database', [r[2] for r in A] == [False, True, False], A)
    ok('3  the star shows it (pressed + filled), the others stay outlined', star.get_attribute('aria-pressed') == 'true' and page.locator('.gal-star[aria-pressed="true"]').count() == 1)
    ok('3  other events\' images were not touched', all(r[2] is False for r in imgs('event-b') + imgs('event-c')))
    ok('3  the message says it waits for the event to be published', 'once its event is published' in toast_text(page))
    starred_src = A[1][1]

    print('\n== 10. A DRAFT event contributes nothing to the public Gallery (even starred)')
    ok('10 public site_content has no gallery item from the draft event', 'image-fest' not in json.dumps(json.loads(http('POST', '/rpc/site_content', body={})[1])['gallery']) and len(json.loads(http('POST', '/rpc/site_content', body={})[1])['gallery']) == 0)
    pg = public_gallery(p); ok('10 the public Gallery shows no images', len(pg) == 0, pg)
    b0, c0 = new_context(p); p0 = c0.new_page(); p0.goto(f'{SITE}/index.html'); p0.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000)
    ok('10 ...and says so instead of showing an empty hole', 'will appear here' in p0.inner_text('#gallery-track').lower()); b0.close()

    print('\n== 4. Publish the event: only the starred image appears publicly')
    page.goto(f'{SITE}/prezi_panel/#/events'); page.wait_for_selector('.item:has-text("Image Fest")')
    page.click('button[aria-label="Publish Image Fest"]'); ok('4  event published', flash(page, 'Published', 8000))
    pg = public_gallery(p)
    ok('4  the public Gallery has exactly ONE image', len(pg) == 1, pg)
    ok('4  ...it is the starred one, titled with its event', pg and pg[0]['title'] == 'Image Fest' and pg[0]['src'].endswith(starred_src.replace('storage:', '/storage/v1/object/public/media/').split('/media/')[-1]), (pg, starred_src))
    gj = json.loads(http('POST', '/rpc/site_content', body={})[1])['gallery']
    ok('4  site_content derives it (no copy table): 1 item, and gallery_items was not touched', len(gj) == 1 and q("select count(*) from public.gallery_items")[0][0] == 5, (len(gj)))

    print('\n== 5. Disable the star: gone from the public Gallery, still on its event')
    page.goto(f'{SITE}/prezi_panel/#/gallery'); page.wait_for_selector('.gal-card')
    star = page.locator('.gal-event:has-text("Image Fest") .gal-card').nth(1).locator('.gal-star')
    ok('6  (reloaded editor) the star is still ON after a page reload', star.get_attribute('aria-pressed') == 'true')
    clear_toasts(page); star.click(); ok('5  star turned off', flash(page, 'Removed from the public Gallery', 8000))
    ok('5  the image is still attached to its event', len(imgs('image-fest')) == 3 and imgs('image-fest')[1][2] is False)
    ok('5  the public Gallery is empty again', len(public_gallery(p)) == 0)
    page.reload(); page.wait_for_selector('.gal-card')
    ok('6  the OFF state also persists after a reload', page.locator('.gal-event:has-text("Image Fest") .gal-star[aria-pressed="true"]').count() == 0 and gal_cards(page) == 9)
    page.locator('.gal-event:has-text("Image Fest") .gal-card').nth(1).locator('.gal-star').click(); page.wait_for_selector('.toast--ok')   # back on for the carousel and removal checks
    ok('3  star on again (independent per image: others untouched)', [r[2] for r in imgs('image-fest')] == [False, True, False])
    b.close()

    print('\n== 7/8/9. event.html carousel')
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs)
    page.goto(f'{SITE}/event.html?event=image-fest'); page.wait_for_selector('.lp-window .event-carousel', timeout=20000)
    page.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000)
    page.wait_for_selector('.lp-window .event-carousel .ec-slide:nth-child(3)')
    ok('7  an event with 3 images renders an Instagram-style carousel inside the existing image area', page.locator('.lp-window figure.event-detail-media.event-carousel').count() == 1 and page.locator('.lp-window .ec-slide').count() == 3)
    ok('7  there are dots, one per image, the first active', page.locator('.lp-window .ec-dots i').count() == 3 and page.locator('.lp-window .ec-dots i.is-active').count() == 1)
    ok('7  on the FIRST image there is no left arrow (like Instagram); the right arrow is there', not page.locator('.lp-window .ec-prev').is_visible() and page.locator('.lp-window .ec-next').is_visible())
    page.click('.lp-window .ec-next'); page.wait_for_function("document.querySelector('.lp-window .event-carousel').getAttribute('data-index')==='1'", timeout=5000)
    g = page.evaluate("""(()=>{const f=document.querySelector('.lp-window .event-carousel'), r=f.getBoundingClientRect(), a=f.querySelector('.ec-prev').getBoundingClientRect(), n=f.querySelector('.ec-next').getBoundingClientRect(),
       pc=f.querySelector('.ec-prev span').getBoundingClientRect(), nc=f.querySelector('.ec-next span').getBoundingClientRect(),
       img=f.querySelector('.ec-slide img').getBoundingClientRect(), top=document.elementFromPoint(a.left+a.width/2, a.top+a.height/2), top2=document.elementFromPoint(n.left+n.width/2, n.top+n.height/2);
       return {box:[r.left,r.top,r.right,r.bottom], img:[img.left,img.top,img.right,img.bottom], prevLeftGap:a.left-r.left, nextRightGap:r.right-n.right, prevMid:(a.top+a.height/2)-(r.top+r.height/2), nextMid:(n.top+n.height/2)-(r.top+r.height/2),
       discGapL:pc.left-r.left, discGapR:r.right-nc.right, inside:a.left>=r.left-.5&&a.right<=r.right+.5&&a.top>=r.top-.5&&a.bottom<=r.bottom+.5&&n.left>=r.left-.5&&n.right<=r.right+.5&&n.top>=r.top-.5&&n.bottom<=r.bottom+.5,
       prevOnTop: !!top.closest('.ec-prev'), nextOnTop: !!top2.closest('.ec-next'), figH:r.height, imgH:img.height}})()""")
    ok('8  both arrows are INSIDE the image container (overlaying it, not above or outside)', g['inside'] and g['prevOnTop'] and g['nextOnTop'], g)
    ok('8  the left arrow touches the extreme LEFT edge, the right arrow the extreme RIGHT edge', abs(g['prevLeftGap']) <= 1.5 and abs(g['nextRightGap']) <= 1.5 and g['discGapL'] <= 12 and g['discGapR'] <= 12, g)
    ok('8  both are vertically centred on the image (within 1.5px)', abs(g['prevMid']) <= 1.5 and abs(g['nextMid']) <= 1.5, g)
    ok('8  the container is exactly the image height (nothing added above or below)', abs(g['figH'] - g['imgH']) <= 1.5, g)
    ok('8  arrows have a 44px tap target', page.evaluate("[...document.querySelectorAll('.lp-window .ec-arrow')].every(a=>a.getBoundingClientRect().width>=44&&a.getBoundingClientRect().height>=44)"))
    ok('7  navigating stays on the card (no navigation, no new window)', 'event=image-fest' in page.url and page.locator('.lp-window').count() == 1)
    ok('7  the dot follows', page.locator('.lp-window .ec-dots i').nth(1).get_attribute('class') == 'is-active')
    page.click('.lp-window .ec-next'); page.wait_for_function("document.querySelector('.lp-window .event-carousel').getAttribute('data-index')==='2'", timeout=5000)
    ok('7  on the LAST image the right arrow disappears and the left remains', not page.locator('.lp-window .ec-next').is_visible() and page.locator('.lp-window .ec-prev').is_visible())
    page.click('.lp-window .ec-prev'); page.wait_for_function("document.querySelector('.lp-window .event-carousel').getAttribute('data-index')==='1'", timeout=5000); ok('7  left arrow goes back', True)
    page.focus('.lp-window .ec-track'); page.keyboard.press('ArrowRight'); page.wait_for_function("document.querySelector('.lp-window .event-carousel').getAttribute('data-index')==='2'", timeout=5000)
    ok('7  keyboard arrows work too', True)
    ok('7  the slides are this event\'s images, in order', page.evaluate("[...document.querySelectorAll('.lp-window .ec-slide img')].map(i=>i.src.split('/').pop())") == [r[1].split('/')[-1] for r in imgs('image-fest')])

    print('\n== 9. Each card only navigates its own images')
    b2, c2 = new_context(p); p2 = c2.new_page(); p2.goto(f'{SITE}/event.html?event=image-fest'); p2.wait_for_selector('.lp-window .event-carousel')
    p2.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000)
    p2.evaluate("[...document.querySelectorAll('.lp-tile')].find(t => t.textContent.includes('Event B')).click()"); p2.wait_for_selector('.lp-window:has-text("Event B") .event-carousel .ec-slide:nth-child(4)', timeout=15000)
    ok('9  two cards open: A has 3 slides, B has 4', p2.locator('.lp-window:has-text("Image Fest") .ec-slide').count() == 3 and p2.locator('.lp-window:has-text("Event B") .ec-slide').count() == 4)
    p2.evaluate("[...document.querySelectorAll('.event-carousel')].find(c=>c.getAttribute('aria-label').includes('Image Fest')).querySelector('.ec-next').click()")
    p2.wait_for_function("[...document.querySelectorAll('.event-carousel')].find(c=>c.getAttribute('aria-label').includes('Image Fest')).getAttribute('data-index')==='1'", timeout=5000)
    st = p2.evaluate("[...document.querySelectorAll('.event-carousel')].map(c=>[c.getAttribute('aria-label'), c.getAttribute('data-index'), c.querySelector('.ec-track').scrollLeft])")
    ok('9  moving A to image 2 leaves B on image 1', dict((a, (i, round(s_))) for a, i, s_ in st)['Images from Event B'] == ('0', 0), st)
    b2.close()

    print('\n== 7 (mobile). touch swipe')
    b3, c3 = new_context(p, viewport=(390, 800), mobile=True); p3 = c3.new_page(); p3.goto(f'{SITE}/event.html?event=image-fest'); p3.wait_for_selector('.lp-window .event-carousel .ec-slide:nth-child(3)', timeout=20000)
    p3.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000)
    p3.locator('.lp-window .ec-track').scroll_into_view_if_needed(); p3.wait_for_timeout(300)
    box = p3.locator('.lp-window .ec-track').bounding_box(); cdp = c3.new_cdp_session(p3)
    print('   (track on screen:', box, ')')
    x0, x1, y = box['x'] + box['width'] * 0.8, box['x'] + box['width'] * 0.2, box['y'] + box['height'] / 2
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y}]})
    for i in range(1, 11):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * i / 10, 'y': y}]}); p3.wait_for_timeout(16)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    try: p3.wait_for_function("document.querySelector('.lp-window .event-carousel').getAttribute('data-index')==='1'", timeout=6000); swiped = True
    except Exception: swiped = False
    ok('7  a left swipe moves to the next image (native touch scrolling, snapped)', swiped, p3.evaluate("document.querySelector('.lp-window .event-carousel').getAttribute('data-index')"))
    ok('7  mobile: no horizontal page overflow', not p3.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    p3.screenshot(path='/tmp/carousel-mobile.png')
    b3.close()

    print('\n== 12. Existing single-image events keep working')
    b4, c4 = new_context(p); p4 = c4.new_page(); p4.goto(f'{SITE}/event.html?event=legacy-one'); p4.wait_for_selector('.lp-window h2:has-text("Legacy One")', timeout=20000)
    p4.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000)
    ok('12 an event with one image (and no event_images row) still shows it', p4.locator('.lp-window figure.event-detail-media img').count() == 1)
    ok('12 ...as a plain image: no carousel, no arrows, no dots', p4.locator('.lp-window .event-carousel, .lp-window .ec-arrow, .lp-window .ec-dots').count() == 0)
    ok('12 ...public site_content still gives the event its image', any(e['id'] == 'legacy-one' and e['image'] for e in json.loads(http('POST', '/rpc/site_content', body={})[1])['events']))
    b4.close()
    b, ctx = new_context(p); page = ctx.new_page(); errs = []; watch(page, errs); login(page, 'editor'); page.wait_for_selector('h1:has-text("Dashboard")')
    page.goto(f'{SITE}/prezi_panel/#/events/edit/legacy-one'); page.wait_for_selector('.evimg', timeout=15000)
    ok('12 the editor shows the old image as image 1 of the event', page.locator('.evimg').count() == 1)
    page.click('button[type=submit]'); page.wait_for_selector('dialog button:has-text("Publish")'); page.click('dialog button:has-text("Publish")'); ok('12 saving converts it to an event_images row without losing it', flash(page, 'Saved', 10000) and len(imgs('legacy-one')) == 1 and imgs('legacy-one')[0][1] == team_path(2), imgs('legacy-one'))

    print('\n== 1 (cont.). adding images to an existing event keeps the old ones; order and retry')
    before = imgs('image-fest')
    page.goto(f'{SITE}/prezi_panel/#/events/edit/image-fest'); page.wait_for_selector('.evimg')
    ok('1  the editor lists the 3 stored images', page.locator('.evimg').count() == 3)
    open_groups(page)
    page.select_option('.evimg-shape', '4:5')                        # this one is a portrait
    add_images(page, PNGS[3:4])
    ok('1  a 4th image can be added next to the existing three', page.locator('.evimg').count() == 4)
    def lose(r):
        if r.request.method != 'POST': return r.continue_()
        r.fetch(); r.abort()
    ctx.route(re.compile(r'/rest/v1/rpc/set_event_images'), lose)
    page.click('button[type=submit]'); page.wait_for_selector('dialog button:has-text("Publish")'); page.click('dialog button:has-text("Publish")')
    page.wait_for_selector('.toast--error', timeout=15000)
    ok('1  response lost during the image save: told it was not confirmed', 'could not confirm' in toast_text(page).lower() or 'images were not' in toast_text(page).lower(), toast_text(page))
    ok('1  ...but the images DID land (4 rows)', len(imgs('image-fest')) == 4)
    ctx.unroute(re.compile(r'/rest/v1/rpc/set_event_images')); clear_toasts(page)
    page.click('button[type=submit]'); page.wait_for_selector('dialog button:has-text("Publish")'); page.click('dialog button:has-text("Publish")'); ok('1  retry succeeds', flash(page, 'Saved', 15000))
    after = imgs('image-fest')
    ok('1  retry created NO duplicates (still 4) and the first three keep the same ids', len(after) == 4 and [r[0] for r in after[:3]] == [r[0] for r in before], (before, after))
    ok('1  the Gallery star of the starred image survived editing', [r[2] for r in after] == [False, True, False, False], after)

    page.goto(f'{SITE}/prezi_panel/#/events/edit/image-fest'); page.wait_for_selector('.evimg')
    page.locator('.evimg').nth(0).locator('.evimg-later').click()
    page.click('button[type=submit]'); page.wait_for_selector('dialog button:has-text("Publish")'); page.click('dialog button:has-text("Publish")'); flash(page, 'Saved', 15000)
    re_ordered = imgs('image-fest')
    ok('1  reordering is saved: old image 1 is now 2nd, and the event cover follows', re_ordered[1][0] == before[0][0] and re_ordered[0][0] == before[1][0] and q("select image from public.events where id='image-fest'")[0][0] == re_ordered[0][1], re_ordered)
    ok('1  the star stays with the image it belongs to (not with the position)', [r[2] for r in re_ordered] == [True, False, False, False], re_ordered)

    print('\n== 11. Delete an event image: gone from carousel AND Gallery management (and public)')
    gone_id = re_ordered[0][0]                                        # the starred one
    page.goto(f'{SITE}/prezi_panel/#/events/edit/image-fest'); page.wait_for_selector('.evimg')
    page.locator('.evimg').nth(0).locator('.evimg-remove').click()
    ok('11 removal is only staged until Save (nothing deleted yet)', len(imgs('image-fest')) == 4 and page.locator('.evimg').count() == 3)
    page.click('button[type=submit]'); page.wait_for_selector('dialog button:has-text("Publish")'); page.click('dialog button:has-text("Publish")'); flash(page, 'Saved', 15000)
    ok('11 the row is deleted from event_images', len(imgs('image-fest')) == 3 and gone_id not in [r[0] for r in imgs('image-fest')])
    page.goto(f'{SITE}/prezi_panel/#/gallery'); page.wait_for_selector('.gal-card')
    ok('11 Gallery management now lists 10 images (A 3 + B 4 + C 2 + the converted legacy event 1)', gal_cards(page) == 10 and page.locator('.gal-event:has-text("Image Fest") .gal-card').count() == 3, gal_cards(page))
    ok('11 the public Gallery lost it', len(public_gallery(p)) == 0)
    b5, c5 = new_context(p); p5 = c5.new_page(); p5.goto(f'{SITE}/event.html?event=image-fest'); p5.wait_for_selector('.lp-window .event-carousel')
    p5.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000)
    ok('11 the carousel has 3 slides, without the deleted image', p5.locator('.lp-window .ec-slide').count() == 3 and not any(gone_id in s_ for s_ in p5.evaluate("[...document.querySelectorAll('.lp-window .ec-slide img')].map(i=>i.src)")))
    b5.close()

    print('\n== 10 (again). Unpublishing removes a starred image from the public Gallery, keeps it attached')
    q("update public.event_images set gallery_enabled=true where event_id='image-fest' and sort_order=(select min(sort_order) from public.event_images where event_id='image-fest')")
    ok('10 starred + published event => 1 public image', len(public_gallery(p)) == 1)
    page.goto(f'{SITE}/prezi_panel/#/events'); page.wait_for_selector('.item:has-text("Image Fest")')
    page.click('button[aria-label="Unpublish Image Fest"]'); page.wait_for_selector('dialog button:has-text("Unpublish")')
    ok('10 unpublishing an event asks first and says it also hides its Gallery images', 'Gallery' in page.inner_text('dialog'))
    page.click('dialog button:has-text("Unpublish")'); ok('10 unpublished', flash(page, 'Unpublished', 8000))
    ok('10 ...the public Gallery is empty again, the images are still attached', len(public_gallery(p)) == 0 and len(imgs('image-fest')) == 3)
    q("update public.events set published=true where id='image-fest'")
    b.close()

    print('\n== Gallery shapes: 16:9, 5:4 and 4:5 side by side')
    shapes = {r[0]: r[1] for r in q("select id::text, aspect from public.event_images where event_id='image-fest' order by sort_order")}
    ok('the portrait added in the editor was stored as 4:5, the others as 16:9', sorted(shapes.values()) == ['16:9', '16:9', '4:5'], shapes)
    wide, port = [k for k, v in shapes.items() if v == '16:9'], [k for k, v in shapes.items() if v == '4:5']
    q("update public.event_images set aspect='5:4' where id=%s", wide[1])          # a landscape one too (the editor path is the same code)
    q("update public.event_images set gallery_enabled=true where event_id='image-fest'")
    q("update public.events set published=true where id='image-fest'")
    def cards_of(p_, viewport):
        b_, c_ = new_context(p_, viewport=viewport, mobile=viewport[0] < 700); pg_ = c_.new_page(); pg_.goto(f'{SITE}/index.html')
        pg_.wait_for_function("document.documentElement.getAttribute('data-content-status')==='live'", timeout=20000); pg_.wait_for_selector('.gallery-item')
        out = pg_.evaluate("""[...document.querySelectorAll('.gallery-item')].map(f=>{const s=f.querySelector('.gallery-img-shell').getBoundingClientRect(), i=f.querySelector('img'), c=f.getBoundingClientRect();
            return {cls:f.className.replace('gallery-item','').trim(), w:s.width, h:s.height, cardW:c.width, nw:i.getAttribute('width'), nh:i.getAttribute('height'), contained: getComputedStyle(i).objectFit}})""")
        over = pg_.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"); b_.close(); return out, over
    cards, over = cards_of(p, (1440, 810))
    byc = {c['cls']: c for c in cards}
    ok('public Gallery: one card per starred image of the published event, each classed by its shape', sorted(byc) == ['gallery-item--16-9', 'gallery-item--4-5', 'gallery-item--5-4'] and len(cards) == 3, cards)
    ok('each picture box has exactly its shape (16:9 = 1.778, 5:4 = 1.25, 4:5 = 0.8)', abs(byc['gallery-item--16-9']['w'] / byc['gallery-item--16-9']['h'] - 16 / 9) < 0.02 and abs(byc['gallery-item--5-4']['w'] / byc['gallery-item--5-4']['h'] - 1.25) < 0.02 and abs(byc['gallery-item--4-5']['w'] / byc['gallery-item--4-5']['h'] - 0.8) < 0.02, byc)
    ok('desktop: all three pictures are the same height, so the row is tidy', max(c['h'] for c in cards) - min(c['h'] for c in cards) < 1.5, [c['h'] for c in cards])
    ok('a portrait card is narrower than a landscape one, which is narrower than a wide one', byc['gallery-item--4-5']['cardW'] < byc['gallery-item--5-4']['cardW'] < byc['gallery-item--16-9']['cardW'], [c['cardW'] for c in cards])
    ok('width/height attributes match the shape (reserves space, no layout shift while lazy-loading)', byc['gallery-item--4-5']['nw'] == '960' and byc['gallery-item--4-5']['nh'] == '1200' and byc['gallery-item--5-4']['nh'] == '960', byc)
    cards, over = cards_of(p, (390, 800))
    byc = {c['cls']: c for c in cards}
    ok('phone: every card fits the screen (82vw at most) and keeps its shape', all(c['cardW'] <= 390 * 0.82 + 1 for c in cards) and abs(byc['gallery-item--4-5']['w'] / byc['gallery-item--4-5']['h'] - 0.8) < 0.02 and not over, cards)
    # older bundled gallery items have no shape: they keep the 4:3 look they always had
    b_, c_ = new_context(p); pg_ = c_.new_page(); pg_.route(re.compile(r'/rest/v1/rpc/site_content'), lambda r: r.abort()); pg_.goto(f'{SITE}/index.html'); pg_.wait_for_selector('.gallery-item', timeout=20000)
    ok('older bundled items (no shape recorded) still render 4:3', pg_.locator('.gallery-item--4-3').count() >= 1 and abs(pg_.evaluate("(()=>{const s=document.querySelector('.gallery-item--4-3 .gallery-img-shell').getBoundingClientRect();return s.width/s.height})()") - 4 / 3) < 0.02)
    b_.close()

    print('\n== 13. Unauthorized users cannot change images or Gallery visibility   [REAL RLS]')
    target = imgs('event-b')[0][0]
    vt, nt = jwt_for('viewer'), jwt_for('stranger')
    s, body = http('PATCH', f'/event_images?id=eq.{target}', token=vt, body={'gallery_enabled': True}, extra={'Prefer': 'return=representation'})
    ok('13 a VIEWER cannot flip a star through the API (no row changes)', (s in (200, 204, 403)) and imgs('event-b')[0][2] is False, (s, body[:80]))
    s, body = http('PATCH', f'/event_images?id=eq.{target}', token=nt, body={'gallery_enabled': True}, extra={'Prefer': 'return=representation'})
    ok('13 a signed-in NON-admin cannot either', imgs('event-b')[0][2] is False, (s, body[:80]))
    s, body = http('PATCH', f'/event_images?id=eq.{target}', token=None, body={'gallery_enabled': True}, extra={'Prefer': 'return=representation'})
    ok('13 an anonymous caller is refused', s in (401, 403) and imgs('event-b')[0][2] is False, (s, body[:80]))
    s, body = http('GET', '/event_images?select=id', token=None); ok('13 anonymous callers cannot even READ event_images (public data comes only through site_content)', s in (401, 403) or json.loads(body) == [], (s, body[:80]))
    s, body = http('POST', '/rpc/set_event_images', token=vt, body={'p_event_id': 'event-b', 'p_images': []}); ok('13 a viewer cannot call set_event_images (refused, and event B keeps all 4 images)', s >= 400 and len(imgs('event-b')) == 4, (s, body[:100]))
    s, body = http('POST', '/rpc/set_event_images', token=nt, body={'p_event_id': 'event-b', 'p_images': []}); ok('13 a non-admin cannot either', s >= 400 and len(imgs('event-b')) == 4, (s, body[:100]))
    s, body = http('POST', '/rpc/set_event_images', token=None, body={'p_event_id': 'event-b', 'p_images': []}); ok('13 anonymous cannot call it', s in (401, 403) and len(imgs('event-b')) == 4, (s, body[:100]))
    s, body = http('POST', '/rpc/set_event_images', token=jwt_for('editor'), body={'p_event_id': 'image-fest', 'p_images': [{'id': imgs('event-b')[0][0], 'image': team_path(0)}]})
    ok('13 an editor cannot steal another event\'s image id (refused, nothing moved)', s >= 400 and imgs('event-b')[0][0] == target and len(imgs('event-b')) == 4, (s, body[:120]))
    s, body = http('POST', '/rpc/set_event_images', token=jwt_for('editor'), body={'p_event_id': 'image-fest', 'p_images': [{'image': 'javascript:alert(1)'}]}); ok('13 an unsafe image reference is refused by the database', s >= 400, (s, body[:100]))
    s, body = http('POST', '/rpc/set_event_images', token=jwt_for('editor'), body={'p_event_id': 'image-fest', 'p_images': [{'image': team_path(0)}] * 31}); ok('13 more than 30 images is refused', s >= 400 and len(imgs('image-fest')) == 3, (s, body[:100]))
    b, ctx = new_context(p); page = ctx.new_page(); login(page, 'viewer'); page.wait_for_selector('h1:has-text("Dashboard")')
    page.goto(f'{SITE}/prezi_panel/#/gallery'); page.wait_for_selector('.gal-card')
    ok('13 a viewer sees the Gallery with every star disabled', all(a == 'true' for a in page.locator('.gal-star').evaluate_all("els=>els.map(e=>e.getAttribute('aria-disabled'))")))
    page.locator('.gal-star').first.click(force=True); page.wait_for_timeout(500)   # force: aria-disabled is the intended viewer state, and Playwright would otherwise wait for it to enable
    ok('13 clicking a star as a viewer explains why and changes nothing', 'view only' in toast_text(page).lower() and not any(r[2] for r in imgs('event-b')))
    page.goto(f'{SITE}/prezi_panel/#/events/edit/image-fest'); page.wait_for_selector('.evimg')
    ok('13 a viewer cannot add, move or remove event images in the editor', page.locator('.evimg-remove:not([disabled])').count() == 0 and page.locator('.evimg-field > .repeat-row-actions button').first.is_disabled())
    b.close()

    print('\n== visuals')
    b, ctx = new_context(p, viewport=(390, 900), mobile=True); page = ctx.new_page(); login(page, 'editor'); page.wait_for_selector('h1:has-text("Dashboard")')
    page.goto(f'{SITE}/prezi_panel/#/gallery'); page.wait_for_selector('.gal-card'); page.wait_for_timeout(500); page.screenshot(path='/tmp/gallery-mobile.png')
    ok('mobile Gallery management: no horizontal overflow, star is a 44px target', not page.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth") and page.evaluate("document.querySelector('.gal-star').getBoundingClientRect().width>=44"))
    page.goto(f'{SITE}/prezi_panel/#/events/edit/image-fest'); page.wait_for_selector('.evimg'); page.wait_for_timeout(500); page.screenshot(path='/tmp/editor-mobile.png')
    ok('mobile event editor: no horizontal overflow', not page.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    b.close()
    shutil.rmtree(TMP, ignore_errors=True)

print(f"\n{sum(1 for g, _ in R if g)}/{len(R)} passed")
sys.exit(0 if all(g for g, _ in R) else 1)
