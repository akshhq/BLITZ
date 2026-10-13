#!/usr/bin/env python3
"""
Tests supabase/schema.sql on a scratch Postgres (not Supabase itself).

    pip install psycopg2-binary
    createdb blitz_test            # any empty database you may write to
    python supabase/tests/run_rls_tests.py blitz_test

Each case runs in its own transaction that is rolled back, impersonating a role the same way
PostgREST does (SET ROLE + request.jwt.claims).
"""
import json, os, sys, uuid
import psycopg2

DB = sys.argv[1] if len(sys.argv) > 1 else 'blitz_test'
HERE = os.path.dirname(os.path.abspath(__file__))
conn = psycopg2.connect(dbname=DB); conn.autocommit = True
cur = conn.cursor()
cur.execute("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade;")
for f in ('stub-supabase.sql', '../schema.sql'):
    cur.execute(open(os.path.join(HERE, f)).read())

U = {k: str(uuid.uuid4()) for k in ('owner', 'editor', 'viewer', 'stranger')}
for k, v in U.items():
    cur.execute("insert into auth.users (id, email) values (%s, %s)", (v, k + '@t.test'))
for k in ('owner', 'editor', 'viewer'):
    cur.execute("insert into public.admins (user_id, email, role) values (%s, %s, %s)", (U[k], k + '@t.test', k))
cur.execute("""insert into public.events (id,title,description,category,published,date) values
  ('pub-event','Public','d','c',true,'2026-01-01'), ('draft-event','Draft','d','c',false,'2026-02-02');
  insert into public.team_members (name,position,tier,published) values ('Visible','P','core',true), ('Hidden','P','core',false);
  insert into public.announcements (id,title,date,published) values ('a-one','A','2026-01-01',true);""")

results = []
def case(name, who, sql, expect, params=None, check=None):
    """expect: 'ok' | 'fail'. who: anon | owner | editor | viewer | stranger | None(superuser)"""
    cur.execute("begin")
    try:
        if who:
            role = 'anon' if who == 'anon' else 'authenticated'
            claims = {} if who == 'anon' else {'sub': U[who], 'role': 'authenticated'}
            cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))
            cur.execute(f"set local role {role}")
        outcome, detail = 'ok', None
        cur.execute("savepoint s")
        try:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else []
            detail = rows
            if expect == 'ok' and check is not None and not check(rows):
                outcome = 'bad-result'
        except psycopg2.Error as e:
            cur.execute("rollback to savepoint s")
            outcome, detail = 'fail', str(e).strip().splitlines()[0]
        good = (outcome == 'ok' and expect == 'ok') or (outcome == 'fail' and expect == 'fail')
        if expect == 'fail' and outcome == 'ok' and cur.rowcount == 0 and sql.lstrip().lower().startswith(('update', 'delete')):
            good, outcome = True, 'fail(0 rows)'
        results.append((good, name, outcome, detail))
    finally:
        cur.execute("rollback")

ins_event = "insert into public.events (id,title,description,category,{col}) values ('x-1','T','D','C',{val})"
case('anon: cannot read events table', 'anon', "select * from public.events", 'fail')
case('anon: cannot read team table', 'anon', "select * from public.team_members", 'fail')
case('anon: cannot read admins', 'anon', "select * from public.admins", 'fail')
case('anon: cannot read history', 'anon', "select * from public.content_history", 'fail')
case('anon: cannot insert', 'anon', "insert into public.announcements (id,title,date) values ('hax','x','2026-01-01')", 'fail')
case('anon: cannot update', 'anon', "update public.events set title='hax'", 'fail')
case('anon: cannot delete', 'anon', "delete from public.events", 'fail')
case('anon: site_content returns published only', 'anon', "select public.site_content()", 'ok',
     check=lambda r: [e['id'] for e in r[0][0]['events']] == ['pub-event'] and [t['name'] for t in r[0][0]['team']] == ['Visible'])
case('anon: site_content exposes no user ids/timestamps', 'anon', "select public.site_content()", 'ok',
     check=lambda r: 'updated_by' not in json.dumps(r[0][0]) and 'created_at' not in json.dumps(r[0][0]))
case('anon: cannot upload to storage', 'anon', "insert into storage.objects (bucket_id,name) values ('media','x.webp')", 'fail')
case('stranger: reads nothing', 'stranger', "select count(*) from public.events", 'ok', check=lambda r: r[0][0] == 0)
case('stranger: cannot insert', 'stranger', "insert into public.announcements (id,title,date) values ('hax','x','2026-01-01')", 'fail')
case('stranger: cannot update', 'stranger', "update public.events set title='hax'", 'fail')
case('stranger: cannot read admins', 'stranger', "select count(*) from public.admins", 'ok', check=lambda r: r[0][0] == 0)
case('stranger: cannot upload', 'stranger', "insert into storage.objects (bucket_id,name) values ('media','x.webp')", 'fail')
case('viewer: sees drafts', 'viewer', "select count(*) from public.events", 'ok', check=lambda r: r[0][0] == 2)
case('viewer: sees history', 'viewer', "select count(*) from public.content_history", 'ok', check=lambda r: r[0][0] >= 1)
case('viewer: cannot insert', 'viewer', "insert into public.announcements (id,title,date) values ('v-1','x','2026-01-01')", 'fail')
case('viewer: cannot update', 'viewer', "update public.events set title='hax'", 'fail')
case('viewer: cannot delete', 'viewer', "delete from public.events", 'fail')
case('viewer: cannot upload', 'viewer', "insert into storage.objects (bucket_id,name) values ('media','x.webp')", 'fail')
case('viewer: sees only own admin row', 'viewer', "select count(*) from public.admins", 'ok', check=lambda r: r[0][0] == 1)
case('editor: can insert', 'editor', "insert into public.announcements (id,title,date) values ('e-1','x','2026-01-01')", 'ok')
case('editor: can update', 'editor', "update public.events set title='New' where id='pub-event'", 'ok')
case('editor: can delete', 'editor', "delete from public.events where id='draft-event'", 'ok')
case('editor: can upload', 'editor', "insert into storage.objects (bucket_id,name) values ('media','team/x.webp')", 'ok')
case('editor: cannot write admins (promote self)', 'editor', "update public.admins set role='owner'", 'fail')
case('editor: cannot add admin', 'editor', "insert into public.admins (user_id,email,role) select id,'x','owner' from auth.users limit 1", 'fail')
case('editor: cannot write history', 'editor', "insert into public.content_history (table_name,row_pk,op) values ('events','x','INSERT')", 'fail')
case('editor: cannot change id (slug)', 'editor', "update public.events set id='renamed' where id='pub-event'", 'fail')
case('editor: only sees own admin row', 'editor', "select count(*) from public.admins", 'ok', check=lambda r: r[0][0] == 1)
case('owner: sees all admins', 'owner', "select count(*) from public.admins", 'ok', check=lambda r: r[0][0] == 3)
bad = [
  ('javascript: link rejected', "insert into public.announcements (id,title,date,link) values ('b1','x','2026-01-01','javascript:alert(1)')"),
  ('http (not https) link rejected', "insert into public.announcements (id,title,date,link) values ('b2','x','2026-01-01','http://x.org')"),
  ('data: link rejected', "insert into public.collaborations (name,type,url) values ('n','t','data:text/html,x')"),
  ('bad slug rejected', "insert into public.announcements (id,title,date) values ('Bad Slug!','x','2026-01-01')"),
  ('image with .. rejected', "insert into public.team_members (name,position,tier,photo) values ('n','p','core','assets/../../etc/passwd')"),
  ('image as external URL rejected', "insert into public.team_members (name,position,tier,photo) values ('n','p','core','https://evil.test/x.png')"),
  ('image javascript: rejected', "insert into public.gallery_items (title,image) values ('t','javascript:alert(1)')"),
  ('unknown tier rejected', "insert into public.team_members (name,position,tier) values ('n','p','boss')"),
  ('unknown layout rejected', "insert into public.events (id,title,description,category,layout) values ('l1','t','d','c','hax')"),
  ('overlong title rejected', "insert into public.announcements (id,title,date) values ('b3',repeat('x',201),'2026-01-01')"),
  ('event link with javascript: rejected', """insert into public.events (id,title,description,category,links) values ('b4','t','d','c','[{"label":"x","url":"javascript:alert(1)"}]')"""),
  ('event links must be an array', """insert into public.events (id,title,description,category,links) values ('b5','t','d','c','{"a":1}')"""),
  ('empty title rejected', "insert into public.announcements (id,title,date) values ('b6','','2026-01-01')"),
]
for name, sql in bad:
    case('editor: ' + name, 'editor', sql, 'fail')
good = [
  ('valid https link accepted', "insert into public.announcements (id,title,date,link) values ('g1','x','2026-01-01','https://example.org/a?b=1')"),
  ('uploaded image path accepted', "insert into public.team_members (name,position,tier,photo) values ('n','p','core','storage:team/0b9c.webp')"),
  ('repo image path accepted', "insert into public.team_members (name,position,tier,photo) values ('n','p','core','assets/images/team/x.webp')"),
  ('faculty tier accepted', "insert into public.team_members (name,position,tier) values ('n','Convenor','faculty')"),
  ('undated announcement accepted', "insert into public.announcements (id,title,date) values ('g0','t',null)"),
  ('undated event accepted', "insert into public.events (id,title,description,category,date) values ('g2','t','d','c',null)"),
  ('rich event accepted', """insert into public.events (id,title,description,category,layout,speakers,winners,sessions,links) values ('g3','t','d','c','competition',array['A','B'],'[{"position":"First","names":["X"]}]','[{"title":"S"}]','[{"label":"Site","url":"https://x.org"}]')"""),
]
for name, sql in good:
    case('editor: ' + name, 'editor', sql, 'ok')
def audit():
    cur.execute("begin")
    cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': U['editor']}),))
    cur.execute("set local role authenticated")
    cur.execute("update public.events set title='Changed' where id='pub-event'")
    cur.execute("delete from public.team_members where name='Hidden'")
    cur.execute("reset role")
    cur.execute("select op, changed_by::text, old_row->>'title', new_row->>'title' from public.content_history where table_name='events' and op='UPDATE'")
    upd = cur.fetchall()
    cur.execute("select count(*), min(old_row->>'name') from public.content_history where table_name='team_members' and op='DELETE'")
    dele = cur.fetchone()
    cur.execute("select updated_by::text from public.events where id='pub-event'")
    ub = cur.fetchone()[0]
    cur.execute("rollback")
    ok1 = upd and upd[0][1] == U['editor'] and upd[0][2] == 'Public' and upd[0][3] == 'Changed'
    results.append((bool(ok1), 'history: update records who, old and new values', 'ok' if ok1 else 'bad', upd))
    results.append((dele == (1, 'Hidden'), 'history: delete keeps the deleted row (undo possible)', 'ok', dele))
    results.append((ub == U['editor'], 'updated_by is set by the database, not the client', 'ok', ub))
audit()

width = max(len(n) for _, n, *_ in results)
fails = 0
for good, name, outcome, detail in results:
    print(('PASS ' if good else 'FAIL ') + name.ljust(width) + ('' if good else f'   -> {outcome}: {detail}'))
    fails += (not good)
print(f"\n{len(results) - fails}/{len(results)} passed")
sys.exit(1 if fails else 0)
