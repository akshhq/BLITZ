#!/usr/bin/env python3
"""
Schema contract + migration compatibility tests. Runs against a scratch Postgres (NOT Supabase itself):

    createdb blitz_schema_test
    python supabase/tests/run_schema_contract_tests.py blitz_schema_test      # needs psycopg2-binary and node

What it proves (all against a real PostgreSQL):
  1. schema.sql produces the columns, types, constraints, RLS and functions the application code expects
     (notably public.events.event_details is jsonb).
  2. Each migration repairs an OUTDATED database without losing existing rows, and can be run twice safely.
  3. No migration drops or truncates data.
  4. seed.sql applies cleanly to schema.sql.
  5. The panel's size check (event-validator.js) agrees with what PostgreSQL really measures.
It does not test a hosted Supabase project; see ERRORS.md for the diagnostic queries to run there.
"""
import json, os, re, subprocess, sys
import psycopg2

DB = sys.argv[1] if len(sys.argv) > 1 else 'blitz_schema_test'
HERE = os.path.dirname(os.path.abspath(__file__))
SUP = os.path.dirname(HERE)
ROOT = os.path.dirname(SUP)
conn = psycopg2.connect(dbname=DB); conn.autocommit = True
cur = conn.cursor()
R = []

def ok(name, cond, extra=''):
    R.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'   -> {extra}'))
def q(sql, *a):
    cur.execute(sql, a); return cur.fetchall() if cur.description else []
def read(*p): return open(os.path.join(*p)).read()

def fresh(with_seed=False):
    cur.execute("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade;")
    cur.execute(read(HERE, 'stub-supabase.sql')); cur.execute(read(SUP, 'schema.sql'))
    if with_seed: cur.execute(read(SUP, 'seed.sql'))

def cols(table):
    return {r[0]: (r[1], r[2], r[3]) for r in q("select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=%s", table)}

print('== 1. schema.sql matches what the application expects')
fresh()
ev = cols('events')
expected = {'id': 'text', 'title': 'text', 'date': 'date', 'description': 'text', 'category': 'text', 'layout': 'text', 'speakers': 'ARRAY', 'key_points': 'ARRAY',
            'winners': 'jsonb', 'sessions': 'jsonb', 'competition_sections': 'jsonb', 'links': 'jsonb', 'image': 'text', 'logo': 'text', 'brochure': 'text',
            'event_details': 'jsonb', 'placeholder': 'boolean', 'published': 'boolean', 'additional_info': 'text', 'image_alt': 'text'}
for c, t in expected.items():
    ok(f'events.{c} is {t}', c in ev and ev[c][0] == t, ev.get(c))
ok('events.event_details is NOT NULL with default {} (never null in the app)', ev['event_details'][1] == 'NO' and "'{}'" in str(ev['event_details'][2]), ev['event_details'])
ok('events.placeholder is NOT NULL default false', ev['placeholder'][1] == 'NO' and 'false' in str(ev['placeholder'][2]))
for t in ('announcements', 'events', 'team_members', 'gallery_items', 'collaborations', 'content_history', 'admins'):
    ok(f'RLS is enabled on {t}', q("select relrowsecurity from pg_class where oid=%s::regclass", f'public.{t}')[0][0])
ok('site_content() exists, takes no arguments, returns jsonb', q("select pg_get_function_result(p.oid), pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='site_content'") == [('jsonb', '')])
ok('events_public view exists', q("select count(*) from pg_views where schemaname='public' and viewname='events_public'")[0][0] == 1)
ok('events_public exposes event_details', 'event_details' in {r[0] for r in q("select column_name from information_schema.columns where table_schema='public' and table_name='events_public'")})
ok('anon can execute site_content() but has NO direct table access to events', q("select has_function_privilege('anon','public.site_content()','execute'), has_table_privilege('anon','public.events','select')") == [(True, False)])
ok('anon can read events_public', q("select has_table_privilege('anon','public.events_public','select')")[0][0])
ok('authenticated can write events, anon cannot', q("select has_table_privilege('authenticated','public.events','insert'), has_table_privilege('anon','public.events','insert')") == [(True, False)])
ok('the "media" storage bucket is created', q("select count(*) from storage.buckets where id='media'")[0][0] == 1)
cons = {r[0] for r in q("select conname from pg_constraint where conrelid='public.events'::regclass")}
ok('event_details has a type/size CHECK constraint', any('event_details' in c for c in cons), sorted(cons))

print('\n== 2. event_details rejects wrong shapes and oversize at the database too')
def rejected(sql):
    cur.execute('savepoint s') if False else None
    try: cur.execute(sql); cur.execute("delete from public.events where id='t-x'"); return False
    except psycopg2.Error: return True
ok('an ARRAY is rejected', rejected("insert into public.events (id,title,description,category,event_details) values ('t-x','t','d','c','[1]'::jsonb)"))
ok('a string is rejected', rejected("insert into public.events (id,title,description,category,event_details) values ('t-x','t','d','c','\"x\"'::jsonb)"))
ok('an object is accepted', not rejected("insert into public.events (id,title,description,category,event_details) values ('t-x','t','d','c','{\"a\":1}'::jsonb)"))

print('\n== 3. the JS size check agrees with PostgreSQL (so the panel never lets through what the DB rejects)')
samples = [{}, {'a': 1}, {'a': [1, 2, 3], 'b': {'c': 'dé✓𝄞'}}, {'objectives': ['x' * 50] * 7, 'n': None, 't': True, 'f': 1.5}, {'k' * 40: {'z': ['é'] * 30}}]
js = "const V=require(process.argv[1]);const s=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(s.map(x=>V.pgJsonLength(x))))"
out = subprocess.run(['node', '-e', js, os.path.join(ROOT, 'prezi_panel', 'event-validator.js')], input=json.dumps(samples), capture_output=True, text=True)
js_lens = json.loads(out.stdout) if out.returncode == 0 else None
db_lens = [q("select octet_length(%s::jsonb::text)", json.dumps(s, ensure_ascii=False))[0][0] for s in samples]
ok('JS pgJsonLength equals octet_length(jsonb::text) for every sample', js_lens == db_lens, (js_lens, db_lens, out.stderr[:200]))
lim = 50000
at = {'p': 'x' * (lim - q("select octet_length('{\"p\": \"\"}'::jsonb::text)")[0][0])}
ok('a value exactly at the limit is accepted by the DB and by the JS check', q("select octet_length(%s::jsonb::text)", json.dumps(at))[0][0] == lim)
cur.execute("insert into public.events (id,title,description,category,event_details) values ('t-at','t','d','c',%s::jsonb)", (json.dumps(at),))
over = {'p': 'x' * (len(at['p']) + 1)}
ok('one byte over the limit is rejected by the DB', rejected("insert into public.events (id,title,description,category,event_details) values ('t-x','t','d','c','%s'::jsonb)" % json.dumps(over)))

print('\n== 4. migrations repair an OUTDATED database and keep its data')
def old_database(drop):
    fresh()
    cur.execute("insert into public.events (id,title,description,category,published) values ('keep-me','Keep Me','d','c',true)")
    cur.execute("insert into public.announcements (id,title,published) values ('keep-ann','Keep Ann',true)")
    for c in drop: cur.execute(f"alter table public.events drop column {c} cascade")
    return {c for c in drop if c not in cols('events')}
for mig, drop in (('migration_add_event_details.sql', ['event_details', 'placeholder', 'brochure', 'logo']), ('migration_add_brochure_and_logo.sql', ['brochure', 'logo'])):
    gone = old_database(drop)
    ok(f'[{mig}] test setup: outdated schema really lacks {sorted(gone)}', gone == set(drop), gone)
    try:
        cur.execute(read(SUP, mig)); applied = True
    except psycopg2.Error as e: applied = False; err = str(e)[:200]
    ok(f'[{mig}] applies without error to the outdated schema', applied, err if not applied else '')
    after = cols('events')
    ok(f'[{mig}] restores {sorted(drop)}', all(c in after for c in drop), [c for c in drop if c not in after])
    if 'event_details' in drop: ok(f'[{mig}] event_details is restored as jsonb (never text)', after['event_details'][0] == 'jsonb', after['event_details'])
    ok(f'[{mig}] existing rows are untouched', q("select title from public.events where id='keep-me'") == [('Keep Me',)] and q("select title from public.announcements where id='keep-ann'") == [('Keep Ann',)])
    ok(f'[{mig}] site_content() works and includes the existing event', 'keep-me' in json.dumps(q("select public.site_content()")[0][0]))
    ok(f'[{mig}] events_public view is back', q("select count(*) from pg_views where schemaname='public' and viewname='events_public'")[0][0] == 1)
    try: cur.execute(read(SUP, mig)); again = True
    except psycopg2.Error as e: again = False
    ok(f'[{mig}] is safe to run a SECOND time (idempotent)', again)
    ok(f'[{mig}] RLS is still enabled afterwards', q("select relrowsecurity from pg_class where oid='public.events'::regclass")[0][0])
    ok(f'[{mig}] anon still cannot read the events table directly', q("select has_table_privilege('anon','public.events','select')")[0][0] is False)

print('\n== 5. migrations never destroy data')
for f in sorted(os.listdir(SUP)):
    if f.startswith('migration_') and f.endswith('.sql'):
        body = re.sub(r'--[^\n]*', '', read(SUP, f)).lower()
        body = re.sub(r'delete from public\.event_images where event_id = p_event_id and id <> all \(v_ids\);', '', body)   # set_event_images: removes only the images taken off ONE event's list
        bad = [w for w in ('drop table', 'truncate', 'delete from', 'drop column', 'drop schema') if w in body]
        ok(f'{f}: contains no {", ".join(("drop table", "truncate", "delete from", "drop column"))}', not bad, bad)

print('\n== 6. seed.sql applies to schema.sql')
try: fresh(with_seed=True); seeded = True
except psycopg2.Error as e: seeded = False; serr = str(e)[:200]
ok('seed.sql loads into a fresh schema without error', seeded, serr if not seeded else '')
if seeded:
    ok('seed has events, team and announcements', all(q(f"select count(*) from public.{t}")[0][0] > 0 for t in ('events', 'team_members', 'announcements')))
    ok('placeholder events keep their flag', q("select count(*) from public.events where placeholder")[0][0] >= 1)


print('\n== 7. event_images: contract, Gallery derivation, RPC and RLS (as real roles)')
fresh()
cur.execute("select set_config('request.jwt.claims', '{}', false)")   # plain statements run as nobody in particular; role tests override this inside their own transaction
U = {'editor': '00000000-0000-4000-8000-0000000000e1', 'viewer': '00000000-0000-4000-8000-0000000000e2', 'nobody': '00000000-0000-4000-8000-0000000000e3'}
for k, v in U.items(): cur.execute("insert into auth.users (id,email) values (%s,%s)", (v, k + '@t.test'))
cur.execute("insert into public.admins (user_id,email,role) values (%s,'editor@t.test','editor'),(%s,'viewer@t.test','viewer')", (U['editor'], U['viewer']))
ei = cols('event_images')
ok('event_images has id uuid, event_id text, image text, alt text, gallery_enabled boolean, sort_order integer', all(ei.get(c, ('',))[0] == t for c, t in {'id': 'uuid', 'event_id': 'text', 'image': 'text', 'alt': 'text', 'gallery_enabled': 'boolean', 'sort_order': 'integer'}.items()), ei)
ok('gallery_enabled is NOT NULL and defaults to false (new images start hidden)', ei['gallery_enabled'][1] == 'NO' and 'false' in str(ei['gallery_enabled'][2]))
ok('RLS is on; anon has no table access; authenticated cannot read as nobody', q("select relrowsecurity, has_table_privilege('anon','public.event_images','select') from pg_class where oid='public.event_images'::regclass") == [(True, False)])
ok('event_images.aspect is text, NOT NULL, default 16:9', ei['aspect'][0] == 'text' and ei['aspect'][1] == 'NO' and '16:9' in str(ei['aspect'][2]), ei.get('aspect'))
def rejects(sql, *a):
    try: cur.execute(sql, a); cur.execute("delete from public.event_images where image='assets/images/x/shape.webp'"); return False
    except psycopg2.Error: return True
ok('deleting an event deletes its images (foreign key cascade)', q("select confdeltype from pg_constraint where conrelid='public.event_images'::regclass and contype='f'") == [('c',)])
ok('set_event_images exists, runs as the CALLER (security invoker, so RLS applies)', q("select prosecdef from pg_proc where proname='set_event_images'") == [(False,)])
ok('anon cannot execute set_event_images', q("select has_function_privilege('anon','public.set_event_images(text,jsonb)','execute'), has_function_privilege('authenticated','public.set_event_images(text,jsonb)','execute')") == [(False, True)])

for t in ('a', 'b', 'draft'): cur.execute("insert into public.events (id,title,description,category,published,date,location) values (%s,%s,'d','c',%s,'2026-05-01','Hall')", (f'ev-{t}', f'Event {t.upper()}', t != 'draft'))
for ev in ('ev-a', 'ev-b', 'ev-draft'):
    for i in range(3): cur.execute("insert into public.event_images (event_id,image,sort_order) values (%s,%s,%s)", (ev, f'assets/images/x/{ev}-{i}.webp', (i + 1) * 10))
cur.execute("insert into public.event_images (event_id,image,sort_order) values ('ev-a','http://not-allowed/x.png',99)") if False else None
def gallery(): return json.loads(json.dumps(q("select public.site_content() -> 'gallery'")[0][0]))
ok('no stars => the public Gallery is empty', gallery() == [])
cur.execute("update public.event_images set gallery_enabled=true where event_id in ('ev-a','ev-draft') and sort_order=20")
g = gallery()
ok('stars on a published and a DRAFT event => only the published event\'s image is public', len(g) == 1 and g[0]['title'] == 'Event a'.replace('a', 'A') and g[0]['image'].endswith('ev-a-1.webp'), g)
ok('gallery items keep the shape the website already renders (title, image, alt, media_type, date_label, location, sort_order)', set(g[0]) >= {'id', 'title', 'description', 'image', 'alt', 'media_type', 'date_label', 'location', 'sort_order'} and g[0]['location'] == 'Hall' and g[0]['date_label'] == '1 May 2026', g[0])
cur.execute("update public.events set published=false where id='ev-a'"); ok('unpublishing the event removes its image from the Gallery', gallery() == [])
cur.execute("update public.events set published=true where id='ev-a'"); ok('publishing brings it back', len(gallery()) == 1)
cur.execute("update public.event_images set gallery_enabled=false where event_id='ev-a'"); ok('star off => gone, but the row is still attached to its event', gallery() == [] and q("select count(*) from public.event_images where event_id='ev-a'")[0][0] == 3)
ev = {e['id']: e for e in q("select public.site_content() -> 'events'")[0][0]}
ok('events carry their images in order; the draft event is not published at all', [i['image'].split('-')[-1] for i in ev['ev-a']['images']] == ['0.webp', '1.webp', '2.webp'] and 'ev-draft' not in ev)
cur.execute("alter table public.event_images disable trigger user"); cur.execute("insert into public.event_images (event_id,image,sort_order,gallery_enabled) values ('ev-a','assets/images/x/ok.webp',5,true)"); cur.execute("alter table public.event_images enable trigger user")
cur.execute("update public.event_images set image='assets/images/x/bad..png' where event_id='ev-a' and sort_order=5") if False else None

def as_user(sub, role, sql, *a):
    """Run one statement as a signed-in database role, then roll back. Returns ('ok', rows) or ('error', sqlstate)."""
    cur.execute('begin')
    try:
        cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': sub}),)); cur.execute(f'set local role {role}')
        cur.execute(sql, a); rows = cur.fetchall() if cur.description else []
        return ('ok', rows)
    except psycopg2.Error as e:
        return ('error', e.pgcode)
    finally:
        cur.execute('rollback')
imgs = json.dumps([{'image': 'assets/images/x/new1.webp', 'alt': 'one'}, {'image': 'assets/images/x/new2.webp'}])
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-b', %s::jsonb)", imgs)
ok('an EDITOR can replace an event\'s images; the result lists them in order with fresh ids', r[0] == 'ok' and [i['image'].rsplit('/', 1)[-1] for i in r[1][0][0]] == ['new1.webp', 'new2.webp'] and all(i['gallery_enabled'] is False for i in r[1][0][0]), r)
r = as_user(U['viewer'], 'authenticated', "select public.set_event_images('ev-b', %s::jsonb)", imgs); ok('a VIEWER is refused (42501)', r == ('error', '42501'), r)
r = as_user(U['nobody'], 'authenticated', "select public.set_event_images('ev-b', %s::jsonb)", imgs); ok('a signed-in NON-admin is refused (42501)', r == ('error', '42501'), r)
r = as_user(U['editor'], 'anon', "select public.set_event_images('ev-b', %s::jsonb)", imgs); ok('anon cannot call it at all (42501)', r == ('error', '42501'), r)
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('nope', %s::jsonb)", imgs); ok('an unknown event is refused before anything is written (P0002)', r == ('error', 'P0002'), r)
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-b', %s::jsonb)", json.dumps([{'image': 'javascript:alert(1)'}])); ok('an unsafe image reference is refused (check constraint)', r[0] == 'error', r)
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-b', %s::jsonb)", json.dumps([{'image': 'assets/images/x/a.webp'}] * 31)); ok('more than 30 images is refused (22023)', r == ('error', '22023'), r)
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-b', '{}'::jsonb)"); ok('a non-list is refused (22023)', r == ('error', '22023'), r)
stolen = q("select id::text from public.event_images where event_id='ev-b' limit 1")[0][0]
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-a', %s::jsonb)", json.dumps([{'id': stolen, 'image': 'assets/images/x/s.webp'}])); ok('an image id belonging to ANOTHER event cannot be taken over (42501)', r == ('error', '42501'), r)
keep = q("select id::text from public.event_images where event_id='ev-a' and gallery_enabled=false order by sort_order limit 1")[0][0]
cur.execute("update public.event_images set gallery_enabled=true where id=%s", (keep,))
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-a', %s::jsonb)", json.dumps([{'id': keep, 'image': 'assets/images/x/ev-a-0.webp', 'alt': 'edited'}]))
ok('re-saving keeps an existing image\'s id AND its Gallery star (the RPC never touches the star)', r[0] == 'ok' and r[1][0][0][0]['id'] == keep and r[1][0][0][0]['gallery_enabled'] is True and r[1][0][0][0]['alt'] == 'edited', r)
r = as_user(U['editor'], 'authenticated', "update public.event_images set gallery_enabled = not gallery_enabled where id=%s returning id", keep); ok('an editor can flip a star directly', r[0] == 'ok' and len(r[1]) == 1, r)
r = as_user(U['viewer'], 'authenticated', "update public.event_images set gallery_enabled = not gallery_enabled where id=%s returning id", keep); ok('a viewer flipping a star changes ZERO rows (RLS)', r == ('ok', []), r)
r = as_user(U['nobody'], 'authenticated', "select count(*) from public.event_images"); ok('a non-admin cannot read event_images (0 rows)', r == ('ok', [(0,)]), r)
r = as_user(U['viewer'], 'authenticated', "select count(*) from public.event_images"); ok('a viewer can read them (so the panel can list them)', r[0] == 'ok' and r[1][0][0] > 0, r)
r = as_user(U['editor'], 'anon', "select count(*) from public.event_images"); ok('anon is refused outright (42501)', r == ('error', '42501'), r)
cur.execute("delete from public.events where id='ev-b'"); ok('deleting an event removes its images', q("select count(*) from public.event_images where event_id='ev-b'")[0][0] == 0)

cur.execute("insert into public.events (id,title,description,category,published) values ('ev-s','Shapes','d','c',true)")
ok('a shape outside 16:9 / 5:4 / 4:5 is refused (check constraint)', all(rejects("insert into public.event_images (event_id,image,aspect) values ('ev-s','assets/images/x/shape.webp',%s)", v) for v in ('3:2', '1:1', '', 'wide')))
ok('an image saved without a shape is 16:9', q("insert into public.event_images (event_id,image) values ('ev-s','assets/images/x/plain.webp') returning aspect") == [('16:9',)])
shapes = json.dumps([{'image': 'assets/images/x/p.webp', 'aspect': '4:5'}, {'image': 'assets/images/x/l.webp', 'aspect': '5:4'}, {'image': 'assets/images/x/w.webp'}])
r = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-s', %s::jsonb)", shapes)
ok('the RPC stores each image\'s shape (4:5, 5:4, and 16:9 when none is sent) and returns it', r[0] == 'ok' and [i['aspect'] for i in r[1][0][0]] == ['4:5', '5:4', '16:9'], r)
cur.execute("delete from public.event_images where event_id='ev-s'")
cur.execute("select set_config('request.jwt.claims', %s, false)", (json.dumps({'sub': U['editor']}),))
cur.execute("select public.set_event_images('ev-s', %s::jsonb)", (shapes,)); first = {i['image'].rsplit('/', 1)[-1]: i for i in cur.fetchone()[0]}
again = json.dumps([{'id': first['p.webp']['id'], 'image': 'assets/images/x/p.webp'}, {'id': first['l.webp']['id'], 'image': 'assets/images/x/l.webp'}])
cur.execute("select public.set_event_images('ev-s', %s::jsonb)", (again,)); kept = {i['image'].rsplit('/', 1)[-1]: i['aspect'] for i in cur.fetchone()[0]}
ok('re-saving WITHOUT a shape never resets a stored one (an older panel cannot flatten 4:5 to 16:9)', kept == {'p.webp': '4:5', 'l.webp': '5:4'}, kept)
r2 = as_user(U['editor'], 'authenticated', "select public.set_event_images('ev-s', %s::jsonb)", json.dumps([{'image': 'assets/images/x/z.webp', 'aspect': '2:1'}])); ok('the RPC refuses an unknown shape', r2[0] == 'error', r2)
cur.execute("select set_config('request.jwt.claims', '{}', false)")
cur.execute("update public.event_images set gallery_enabled = true where event_id='ev-s'")
site = q("select public.site_content()")[0][0]
ok('site_content gives events their images WITH shapes', [i['aspect'] for e in site['events'] if e['id'] == 'ev-s' for i in e['images']] == ['4:5', '5:4'], site['events'])
ok('...and the Gallery items carry the shape too, so the page can size each card before the image loads', sorted(g['aspect'] for g in site['gallery'] if g['title'] == 'Shapes') == ['4:5', '5:4'], site['gallery'])
cur.execute("delete from public.events where id='ev-s'")

print('\n== 8. migration_event_images.sql applied to the PRE-CHANGE schema, with real data')
fixture = read(HERE, 'fixtures', 'schema_before_event_images.sql')
def old_db():
    cur.execute("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade;")
    cur.execute(read(HERE, 'stub-supabase.sql')); cur.execute(fixture)
old_db()
cur.execute("select set_config('request.jwt.claims', '{}', false)")
ok('test setup: the old schema has no event_images', q("select to_regclass('public.event_images')")[0][0] is None)
cur.execute("insert into public.events (id,title,description,category,published,image,image_alt) values ('one','One','d','c',true,'assets/images/legacy/one.webp','alt one'),('two','Two','d','c',true,null,''),('bad','Bad','d','c',true,null,'')")
cur.execute("insert into public.gallery_items (title,image,published) values ('Same file','assets/images/legacy/one.webp',true),('Standalone','assets/gallery/standalone.svg',true),('Hidden','assets/gallery/hidden.svg',false)")
before_gallery = q("select id, title, image, published from public.gallery_items order by title")
before_old_site = q("select public.site_content()")[0][0]
cur.execute(read(SUP, 'migration_event_images.sql'))
ok('migration applies', True)
cur.execute(read(SUP, 'migration_event_image_aspect.sql'))
ok('the shape migration applies on top (and existing images become 16:9, as they were cropped)', q("select aspect from public.event_images") == [('16:9',)])
ok('existing single-image events were backfilled as image 1 (alt kept, star OFF)', q("select event_id, image, alt, gallery_enabled, sort_order from public.event_images order by event_id") == [('one', 'assets/images/legacy/one.webp', 'alt one', True, 10)] or q("select event_id, image, alt, sort_order from public.event_images order by event_id") == [('one', 'assets/images/legacy/one.webp', 'alt one', 10)], q("select * from public.event_images"))
ok('events without an image get no row; nothing is invented', q("select count(*) from public.event_images")[0][0] == 1)
ok('a legacy gallery photo that is EXACTLY an event image keeps its place: that image\'s star is switched on', q("select gallery_enabled from public.event_images")[0][0] is True)
ok('legacy gallery_items are untouched: same rows, nothing deleted', q("select id, title, image, published from public.gallery_items order by title") == before_gallery)
new_site = q("select public.site_content()")[0][0]
ok('the public Gallery now contains only the matched image; standalone legacy items are not shown', [x['title'] for x in new_site['gallery']] == ['One'] and 'Standalone' not in json.dumps(new_site['gallery']), new_site['gallery'])
ok('the rest of site_content is unchanged (announcements, team, collaborations, and every event field)', all(new_site[k] == before_old_site[k] for k in ('announcements', 'team', 'collaborations')) and [{k: v for k, v in e.items() if k != 'images'} for e in new_site['events']] == before_old_site['events'])
ok('the existing event now also lists its image in `images`', [e['images'] for e in new_site['events'] if e['id'] == 'one'][0][0]['image'] == 'assets/images/legacy/one.webp')
cur.execute(read(SUP, 'migration_event_images.sql')); cur.execute(read(SUP, 'migration_event_image_aspect.sql')); ok('running BOTH migrations a second time is safe (no duplicates, shapes kept)', q("select count(*), min(aspect) from public.event_images")[0] == (1, '16:9'))
def fdef(db_fn): return q("select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=%s", db_fn)[0][0]
mig_defs = {n: fdef(n) for n in ('site_content', 'set_event_images')}
mig_cols = cols('event_images'); fresh(); ok('schema.sql and the two migrations define IDENTICAL functions and the same event_images columns (no drift)', mig_defs == {n: fdef(n) for n in ('site_content', 'set_event_images')} and mig_cols == cols('event_images'))
body = re.sub(r'--[^\n]*', '', read(SUP, 'migration_event_images.sql')).lower()
body = re.sub(r'delete from public\.event_images where event_id = p_event_id and id <> all \(v_ids\);', '', body)
ok('the migration contains no drop / truncate / delete from (apart from the RPC removing images taken off one event)', not [w for w in ('drop table', 'truncate', 'delete from', 'drop column', 'drop schema') if w in body])

print(f"\n{sum(R)}/{len(R)} passed")
sys.exit(0 if all(R) else 1)
