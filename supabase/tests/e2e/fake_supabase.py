#!/usr/bin/env python3
"""
Local stand-in for the parts of Supabase that cannot be run offline, for TESTING ONLY.

  /rest/v1/*     -> proxied to a real PostgREST (same REST layer Supabase uses; RLS is real)
  /auth/v1/*     -> minimal GoTrue: password login, refresh, user, recover (emails a code), verify, update password
  /storage/v1/*  -> minimal Storage: upload (admins only) and public download

JWTs are real HS256 tokens signed with the same secret PostgREST verifies.
"""
import base64, email.parser, email.policy, hashlib, hmac, json, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = 'test-secret-test-secret-test-secret-123456'
POSTGREST = 'http://127.0.0.1:3000'

def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def unb64(s): return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))

def mint(claims):
    head = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    body = b64(json.dumps(claims).encode())
    sig = b64(hmac.new(SECRET.encode(), f'{head}.{body}'.encode(), hashlib.sha256).digest())
    return f'{head}.{body}.{sig}'

def verify(token):
    try:
        h, b, s = token.split('.')
        good = b64(hmac.new(SECRET.encode(), f'{h}.{b}'.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(good, s): return None
        claims = json.loads(unb64(b))
        return claims if claims.get('exp', 0) > time.time() else None
    except Exception:
        return None

ANON_KEY = mint({'role': 'anon', 'iss': 'supabase', 'exp': 4102444800})

ROOT = None  # folder of static site files to serve (same origin as the API, so the test needs no CORS)

class State:
    users = {}        # email -> {id, password}
    refresh = {}      # token -> email
    codes = {}        # email -> code
    sent_emails = []  # (email, code) "sent" by /recover
    files = {}        # path -> (content_type, bytes)
    editors = set()   # user ids allowed to upload
    reset_log = []
    lock = threading.Lock()

def session_for(email):
    u = State.users[email]
    now = int(time.time())
    access = mint({'sub': u['id'], 'email': email, 'role': 'authenticated', 'aud': 'authenticated', 'iat': now, 'exp': now + 3600})
    rt = hashlib.sha256(f'{email}{now}{len(State.refresh)}'.encode()).hexdigest()[:22]
    State.refresh[rt] = email
    return {'access_token': access, 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': now + 3600, 'refresh_token': rt,
            'user': user_json(email)}

def user_json(email):
    u = State.users[email]
    return {'id': u['id'], 'aud': 'authenticated', 'role': 'authenticated', 'email': email, 'email_confirmed_at': '2026-01-01T00:00:00Z',
            'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')  # Chrome's local-network preflight (test rig only)
        self.send_header('Access-Control-Allow-Headers', '*, authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile, x-upsert, cache-control')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Type')

    def reply(self, code, body=b'', ctype='application/json'):
        if isinstance(body, (dict, list)): body = json.dumps(body).encode()
        self.send_response(code); self.cors()
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers()
        if self.command != 'HEAD': self.wfile.write(body)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''

    def claims(self):
        auth = self.headers.get('Authorization', '')
        return verify(auth[7:]) if auth.startswith('Bearer ') else None

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header('Content-Length', '0'); self.end_headers()

    def handle_any(self):
        path = self.path
        if path.startswith('/rest/v1/'): return self.proxy()
        if path.startswith('/auth/v1/'): return self.auth()
        if path.startswith('/storage/v1/'): return self.storage()
        if ROOT and self.command in ('GET', 'HEAD'):
            import mimetypes, os
            rel = path.split('?')[0].split('#')[0].lstrip('/')
            full = os.path.normpath(os.path.join(ROOT, rel))
            if os.path.isdir(full): full = os.path.join(full, 'index.html')
            if full.startswith(os.path.normpath(ROOT)) and os.path.isfile(full):
                with open(full, 'rb') as fh: data = fh.read()
                return self.reply(200, data, mimetypes.guess_type(full)[0] or 'application/octet-stream')
        self.reply(404, {'error': 'not found'})

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = handle_any
    def proxy(self):
        data = self.body()
        req = urllib.request.Request(POSTGREST + self.path[len('/rest/v1'):], data=data or None, method=self.command)
        for h in ('Authorization', 'Content-Type', 'Prefer', 'Accept', 'Range', 'Accept-Profile', 'Content-Profile'):
            if self.headers.get(h): req.add_header(h, self.headers[h])
        try:
            resp = urllib.request.urlopen(req, timeout=20); code = resp.status
        except urllib.error.HTTPError as e:
            resp = e; code = e.code
        payload = resp.read()
        self.send_response(code); self.cors()
        for h in ('Content-Type', 'Content-Range', 'Location'):
            if resp.headers.get(h): self.send_header(h, resp.headers[h])
        self.send_header('Content-Length', str(len(payload))); self.end_headers()
        if self.command != 'HEAD': self.wfile.write(payload)
    def auth(self):
        route = self.path.split('?')[0][len('/auth/v1'):]
        q = self.path.split('?')[1] if '?' in self.path else ''
        raw = self.body(); data = json.loads(raw) if raw else {}
        with State.lock:
            if route == '/token' and 'grant_type=password' in q:
                u = State.users.get((data.get('email') or '').lower())
                if not u or u['password'] != data.get('password'):
                    return self.reply(400, {'code': 400, 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
                return self.reply(200, session_for(data['email'].lower()))
            if route == '/token' and 'grant_type=refresh_token' in q:
                email = State.refresh.get(data.get('refresh_token'))
                if not email: return self.reply(400, {'error_code': 'refresh_token_not_found', 'msg': 'Invalid Refresh Token'})
                return self.reply(200, session_for(email))
            if route == '/user' and self.command == 'GET':
                c = self.claims()
                if not c or c.get('role') != 'authenticated': return self.reply(401, {'msg': 'invalid JWT'})
                return self.reply(200, user_json(c['email']))
            if route == '/user' and self.command == 'PUT':
                c = self.claims()
                if not c or c.get('role') != 'authenticated': return self.reply(401, {'msg': 'invalid JWT'})
                if data.get('password'):
                    if len(data['password']) < 6: return self.reply(422, {'msg': 'Password should be at least 6 characters.'})
                    State.users[c['email']]['password'] = data['password']
                return self.reply(200, user_json(c['email']))
            if route == '/recover':
                email = (data.get('email') or '').lower()
                State.reset_log.append(email)
                if email in State.users:        # like Supabase: same 200 answer either way
                    State.codes[email] = '482913'; State.sent_emails.append((email, '482913'))
                return self.reply(200, {})
            if route == '/verify':
                email = (data.get('email') or '').lower()
                if data.get('type') == 'recovery' and State.codes.get(email) and State.codes[email] == data.get('token'):
                    del State.codes[email]
                    return self.reply(200, session_for(email))
                return self.reply(403, {'code': 403, 'error_code': 'otp_expired', 'msg': 'Token has expired or is invalid'})
            if route == '/logout':
                return self.reply(204)
        self.reply(404, {'msg': 'unknown auth route ' + route})
    def storage(self):
        route = self.path.split('?')[0][len('/storage/v1'):]
        if route.startswith('/object/public/media/') and self.command == 'GET':
            f = State.files.get(route[len('/object/public/media/'):])
            return self.reply(200, f[1], f[0]) if f else self.reply(404, {'error': 'Object not found'})
        if route.startswith('/object/media/') and self.command == 'POST':
            c = self.claims(); raw = self.body()
            if not c or c.get('sub') not in State.editors:
                return self.reply(403, {'statusCode': '403', 'error': 'Unauthorized', 'message': 'new row violates row-level security policy'})
            ctype = self.headers.get('Content-Type', '')
            msg = email.parser.BytesParser(policy=email.policy.default).parsebytes(f'Content-Type: {ctype}\r\n\r\n'.encode() + raw)
            blob = None
            for part in msg.iter_parts():
                if part.get_filename() is not None or part.get_content_type().startswith('image/'):
                    blob = (part.get_content_type(), part.get_payload(decode=True))
            if not blob: return self.reply(400, {'error': 'no file'})
            if len(blob[1]) > 2 * 1024 * 1024 or blob[0] not in ('image/webp', 'image/jpeg', 'image/png'):
                return self.reply(413, {'error': 'file too large or wrong type'})
            State.files[route[len('/object/media/'):]] = blob
            return self.reply(200, {'Id': 'x', 'Key': 'media/' + route[len('/object/media/'):]})
        self.reply(404, {'error': 'unknown storage route'})

class QuietServer(ThreadingHTTPServer):
    daemon_threads = True
    def handle_error(self, request, client_address):  # browsers abort connections; that is not a test failure
        pass

def start(port=54321):
    srv = QuietServer(('127.0.0.1', port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
