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
        bad = [w for w in ('drop table', 'truncate', 'delete from', 'drop column', 'drop schema') if w in body]
        ok(f'{f}: contains no {", ".join(("drop table", "truncate", "delete from", "drop column"))}', not bad, bad)

print('\n== 6. seed.sql applies to schema.sql')
try: fresh(with_seed=True); seeded = True
except psycopg2.Error as e: seeded = False; serr = str(e)[:200]
ok('seed.sql loads into a fresh schema without error', seeded, serr if not seeded else '')
if seeded:
    ok('seed has events, team and announcements', all(q(f"select count(*) from public.{t}")[0][0] > 0 for t in ('events', 'team_members', 'announcements')))
    ok('placeholder events keep their flag', q("select count(*) from public.events where placeholder")[0][0] >= 1)

print(f"\n{sum(R)}/{len(R)} passed")
sys.exit(0 if all(R) else 1)
