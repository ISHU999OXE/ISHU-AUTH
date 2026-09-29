#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================
 ISHU AUTH - Lite Backend Server (server.py)
 Author: ISHU
============================================
Run:      python server.py
Then:     http://localhost:3000

This server uses a SQLite database — your app/bot (or C#/APK panel)
verifies against it live. The panel's Users page also uses this
server in live DB mode when online.

Endpoints:
  GET  /api/ping
  POST /api/bootstrap            {key, appid, appname}
  GET  /api/licenses?appid=      header: x-api-key
  POST /api/license              {key, appid, username, password, type, duration, hwid}
  POST /api/license/resethwid    {key, appid, id}
  POST /api/license/renew        {key, appid, id, duration}
  POST /api/license/ban          {key, appid, id, banned}
  DELETE /api/license/<id>       body: {key, appid, id}
  POST /api/verify               {key, appid, user, pass, hwid}
"""

import json
import sqlite3
import hashlib
import hmac
import uuid
import os
import re
import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("ISHU_DB_PATH") or os.path.join(ROOT, "ishu_auth.db")
PORT = int(os.environ.get("PORT", "3000"))
# When DATABASE_URL is set (e.g. a free Neon/Supabase Postgres), all data is
# stored remotely and survives every render deploy/restart. Without it we fall
# back to the local SQLite file (dev / tests).
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USING_PG = bool(DATABASE_URL)

DUR_MS = {
    "permanent": 0,
    "1h": 3600 * 1000,
    "3h": 3 * 3600 * 1000,
    "6h": 6 * 3600 * 1000,
    "12h": 12 * 3600 * 1000,
    "24h": 24 * 3600 * 1000,
    "48h": 48 * 3600 * 1000,
    "1d": 1 * 24 * 3600 * 1000,
    "3d": 3 * 24 * 3600 * 1000,
    "7d": 7 * 24 * 3600 * 1000,
    "30d": 30 * 24 * 3600 * 1000,
    "90d": 90 * 24 * 3600 * 1000,
    "1y": 365 * 24 * 3600 * 1000,
}

SECRET_PEPPER = "ISHU-AUTH-2026"


def sha(s):
    return hashlib.sha256((s + SECRET_PEPPER).encode("utf-8")).hexdigest().upper()


def gen_key(prefix):
    toks = []
    for _ in range(8):
        toks.append(uuid.uuid4().hex[:4].upper())
    return prefix + "_" + "-".join(toks)


def new_id():
    return uuid.uuid4().hex[:16]


def _sign_token(token):
    return hmac.new(SECRET_PEPPER.encode("utf-8"),
                    ("vc:" + token).encode("utf-8"), hashlib.sha256).hexdigest()


def html_esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))


def _verify_html(token, sig, dest, state):
    """Self-contained countdown page. Only after the full countdown does it POST
    a signed confirm with the HMAC — so no code copy-paste can fake completion."""
    if state == "bad":
        return "<html><body><h3>Invalid link.</h3></body></html>"
    if state == "done":
        return "<html><body><h3>Task already verified successfully! You can now claim your key on Discord.</h3></body></html>"
    return """<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Verifying your completion…</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#0f1222;color:#fff;
      display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
 .box{max-width:420px;padding:32px;background:#1a1f3a;border-radius:16px;border:1px solid #2e3560}
 .num{font-size:64px;font-weight:800;color:#4c8dff;margin:12px 0}
 .bar{height:6px;background:#2e3560;border-radius:3px;overflow:hidden;margin:16px 0}
 .bar i{display:block;height:100%;width:0;background:#4c8dff;transition:width 1s linear}
 .ok{display:none;color:#34d399;font-size:18px;font-weight:700}
 .warn{color:#fbbf24;margin-top:12px;font-size:13px}
</style></head><body><div class="box">
 <div id="wait"><div style="font-size:15px;color:#aab">Verifying your task… please wait</div>
  <div class="num" id="n">8</div>
  <div class="bar"><i id="b"></i></div>
  <div class="warn" id="w">Do not close / go back — your key is being prepared.</div></div>
 <div class="ok" id="ok">&#10004;&#65039; Task verified successfully! You can now claim your key on Discord.</div>
</div>
<script>
var T={token:"__T__",sig:"__S__",dest:"__D__",left:8};
(function(){var n=document.getElementById('n'),b=document.getElementById('b'),
 ok=document.getElementById('ok'),w=document.getElementById('wait');
 b.style.width='12.5%';
 var iv=setInterval(function(){T.left--;n.textContent=T.left;b.style.width=(12.5*(8-T.left+1))+'%';
  if(T.left<=0){clearInterval(iv);w.textContent='Verifying…';
   fetch('/api/shortlink/confirm',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:T.token,sig:T.sig})})
    .then(function(r){return r.json()}).then(function(d){
     if(d.ok){wait.style.display='none';ok.style.display='block';
      if(T.dest){setTimeout(function(){location.href=T.dest},4000);}}
     else{w.textContent='Failed: '+(d.message||'error');}})
    .catch(function(){w.textContent='Network error — check connection.';});
  }},1000);
})();
</script></body></html>""".replace("__T__", html_esc(token)).replace("__S__", html_esc(sig)) \
    .replace("__D__", html_esc(dest))


class _Result:
    """dict-row result so one execute() API works for sqlite + Postgres."""
    __slots__ = ("_rows",)

    def __init__(self, rows):
        self._rows = rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class _Conn:
    """Connection wrapper: isolates the backend so handlers stay unchanged."""

    def __init__(self, raw, pg):
        self._raw = raw
        self._pg = pg

    def execute(self, sql, params=()):
        if self._pg:
            cur = self._raw.cursor()
            if isinstance(params, dict):
                sql2 = re.sub(r":(\w+)", r"%(\1)s", sql)
                cur.execute(sql2, params)
            else:
                cur.execute(sql.replace("?", "%s"), list(params) if params else params)
            rows = []
            if cur.description:
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            cur.close()
            return _Result(rows)
        cur = self._raw.execute(sql, params)
        rows = []
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        return _Result(rows)

    def executemany(self, sql, seq):
        if self._pg:
            cur = self._raw.cursor()
            cur.executemany(sql.replace("?", "%s"), [list(x) for x in seq])
            cur.close()
            return
        self._raw.executemany(sql, seq)

    def commit(self):
        self._raw.commit()

    def close(self):
        self._raw.close()


def _pg_clean_url(url):
    """Drop libpq options some drivers reject (e.g. channel_binding)."""
    parts = url.split("?", 1)
    if len(parts) == 1:
        return url
    allowed = ("sslmode", "sslrootcert", "connect_timeout", "application_name")
    kept = [kv for kv in parts[1].split("&") if kv.split("=", 1)[0] in allowed]
    return parts[0] + ("?" + "&".join(kept) if kept else "")


def _pg_connect():
    try:
        import psycopg
        return psycopg.connect(DATABASE_URL, connect_timeout=30)
    except Exception:
        pass
    try:
        import psycopg2
        return psycopg2.connect(DATABASE_URL, connect_timeout=30)
    except Exception:
        pass
    import psycopg
    return psycopg.connect(_pg_clean_url(DATABASE_URL), connect_timeout=30)


def db_init():
    if USING_PG:
        con = _pg_connect()
        cur = con.cursor()
        try:
            cur.execute("CREATE TABLE IF NOT EXISTS owners ("
                        "api_key TEXT, appid TEXT, appname TEXT, owner_label TEXT,"
                        " owner_id TEXT, secret TEXT, version TEXT,"
                        " PRIMARY KEY (api_key, appid))")
            for _col in ("owner_id", "secret", "version"):
                cur.execute("ALTER TABLE owners ADD COLUMN IF NOT EXISTS %s TEXT" % _col)
            cur.execute("CREATE TABLE IF NOT EXISTS licenses ("
                        "id TEXT PRIMARY KEY, appid TEXT, username TEXT, password_hash TEXT,"
                        " type TEXT, license_key TEXT, hwid TEXT,"
                        " hwid_locked INTEGER DEFAULT 1, duration TEXT, expires_at BIGINT,"
                        " created_at BIGINT, last_login BIGINT, banned INTEGER DEFAULT 0)")
            cur.execute("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS hwid_locked INTEGER DEFAULT 1")
            cur.execute("CREATE TABLE IF NOT EXISTS shortlink_tasks ("
                        "token TEXT PRIMARY KEY, user_id TEXT, ltype TEXT, destination TEXT,"
                        " created_at BIGINT, completed INTEGER DEFAULT 0, completed_at BIGINT, ip TEXT)")
            cur.execute("ALTER TABLE shortlink_tasks ADD COLUMN IF NOT EXISTS ip TEXT")
            con.commit()
        finally:
            con.close()
        return
    con = sqlite3.connect(DB_PATH)
    con.execute("""
        CREATE TABLE IF NOT EXISTS owners (
            api_key TEXT, appid TEXT, appname TEXT, owner_label TEXT,
            owner_id TEXT, secret TEXT, version TEXT,
            PRIMARY KEY (api_key, appid)
        )
    """)
    ocols = [r[1] for r in con.execute("PRAGMA table_info(owners)")]
    for _col in ("owner_id", "secret", "version"):
        if _col not in ocols:
            con.execute("ALTER TABLE owners ADD COLUMN %s TEXT" % _col)
    con.execute("""
        CREATE TABLE IF NOT EXISTS licenses (
            id TEXT PRIMARY KEY,
            appid TEXT,
            username TEXT,
            password_hash TEXT,
            type TEXT,
            license_key TEXT,
            hwid TEXT,
            hwid_locked INTEGER DEFAULT 1,
            duration TEXT,
            expires_at INTEGER,
            created_at INTEGER,
            last_login INTEGER,
            banned INTEGER DEFAULT 0
        )
    """)
    cols = [r[1] for r in con.execute("PRAGMA table_info(licenses)")]
    if "hwid_locked" not in cols:
        con.execute("ALTER TABLE licenses ADD COLUMN hwid_locked INTEGER DEFAULT 1")
    con.execute("""
        CREATE TABLE IF NOT EXISTS shortlink_tasks (
            token TEXT PRIMARY KEY,
            user_id TEXT,
            ltype TEXT,
            destination TEXT,
            created_at INTEGER,
            completed INTEGER DEFAULT 0,
            completed_at INTEGER,
            ip TEXT
        )
    """)
    tcols = [r[1] for r in con.execute("PRAGMA table_info(shortlink_tasks)")]
    if "ip" not in tcols:
        con.execute("ALTER TABLE shortlink_tasks ADD COLUMN ip TEXT")
    con.commit()
    con.close()


def db():
    if USING_PG:
        return _Conn(_pg_connect(), True)
    return _Conn(sqlite3.connect(DB_PATH), False)


def row2dict(r):
    return dict(r)


def ok(**data):
    data.setdefault("ok", True)
    return json.dumps(data).encode("utf-8")


def fail(msg, code=400):
    return (json.dumps({"ok": False, "message": msg}).encode("utf-8"), code)


def _flag(v, default=True):
    if v is None:
        return default
    return str(v).lower() not in ("0", "false", "no", "")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        pass

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not length:
                return {}
            raw = self.rfile.read(length).decode("utf-8")
            ctype = (self.headers.get("Content-Type") or "").lower()
            if "application/x-www-form-urlencoded" in ctype:
                from urllib.parse import parse_qs
                return {k: v[0] for k, v in parse_qs(raw).items()}
            return json.loads(raw)
        except Exception:
            return {}

    def _send_json(self, payload, code=200):
        if isinstance(payload, tuple):
            payload, code = payload
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-api-key")
        self.send_header("Access-Control-Expose-Headers", "Content-Length")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---------------- API ----------------
    def do_GET(self):
        p = urlparse(self.path)
        if p.path == "/api/ping":
            return self._send_json(ok(version="1.0", server="ishu-auth"))

        if p.path == "/api/licenses":
            api_key = self.headers.get("x-api-key")
            qs = parse_qs(p.query)
            appid = (qs.get("appid") or [""])[0]
            if not api_key or not appid:
                return self._send_json(fail("missing key or appid", 401))
            con = db()
            owner = con.execute("SELECT 1 FROM owners WHERE api_key=? AND appid=?",
                                (api_key, appid)).fetchone()
            if not owner:
                con.close()
                return self._send_json(fail("invalid key/appid", 401))
            rows = con.execute(
                "SELECT * FROM licenses WHERE appid=? ORDER BY created_at DESC", (appid,)
            ).fetchall()
            con.close()
            return self._send_json(ok(list=[row2dict(r) for r in rows]))

        if p.path == "/api/stats":
            return self._send_json(fail("removed"))

        if p.path == "/api/shortlink/c":
            qs = parse_qs(p.query)
            token = (qs.get("token") or [""])[0]
            dest = None
            if token:
                con = db()
                row = con.execute(
                    "SELECT destination, completed FROM shortlink_tasks WHERE token=?",
                    (token,)).fetchone()
                if row:
                    dest = row["destination"]
                    if not row["completed"]:
                        addr = self.client_address[0] if self.client_address else ""
                        con.execute(
                            "UPDATE shortlink_tasks SET completed=1, completed_at=?, ip=? WHERE token=?",
                            (int(datetime.datetime.now().timestamp() * 1000), addr, token))
                        con.commit()
                con.close()
            if dest:
                self.send_response(302)
                self.send_header("Location", dest)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            html = "<html><body><h3>Link verified.</h3></body></html>".encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        if p.path == "/api/shortlink/v":
            # Signed verification page: the user MUST stay on this page for the
            # full countdown; only then the page issues a signed confirm request.
            # Landing here alone does NOT complete the task (no key without
            # the HMAC confirm) — so opening the link and backing out gains nothing.
            qs = parse_qs(p.query)
            token = (qs.get("token") or [""])[0]
            tk, dest, state = "--invalid--", "", "bad"
            if token:
                con = db()
                row = con.execute(
                    "SELECT destination, completed FROM shortlink_tasks WHERE token=?",
                    (token,)).fetchone()
                con.close()
                if row:
                    tk = token
                    dest = html_esc(row["destination"]) if row["destination"] else ""
                    state = "done" if row["completed"] else "wait"
            sig = _sign_token(tk)
            html = _verify_html(tk, sig, dest, state)
            data = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            self.wfile.write(data)
            return

        # static files
        return super().do_GET()

    def do_POST(self):
        p = urlparse(self.path)
        body = self._read_json()

        if p.path == "/api/bootstrap":
            key = body.get("key"); appid = body.get("appid"); appname = body.get("appname")
            if not key or not appid:
                return self._send_json(fail("key and appid required"))
            ownerid = body.get("ownerid"); secret = body.get("secret"); version = body.get("version")
            con = db()
            # Registry rule:
            #  - App is already bound to a DIFFERENT owner identity -> keep that
            #    canonical owner + secret (prevents hijacking).
            #  - SAME owner re-registering -> adopt their current secret/version
            #    so dashboard "Your Values" and the app detail always match
            #    (self-heals stale randomly-generated app secrets).
            existing = con.execute(
                "SELECT owner_id, secret FROM owners WHERE api_key=? AND appid=?",
                (key, appid)).fetchone()
            if existing and existing["owner_id"] and existing["owner_id"] != ownerid:
                if existing["secret"]:
                    secret = existing["secret"]
                ownerid = existing["owner_id"]
            elif not secret and existing and existing["secret"]:
                secret = existing["secret"]
            if USING_PG:
                con.execute(
                    "INSERT INTO owners (api_key, appid, appname, owner_label, owner_id, secret, version)"
                    " VALUES (?,?,?,?,?,?,?)"
                    " ON CONFLICT (api_key, appid) DO UPDATE SET"
                    " owner_label=EXCLUDED.owner_label, owner_id=EXCLUDED.owner_id,"
                    " secret=EXCLUDED.secret, version=EXCLUDED.version",
                    (key, appid, appname or "", key[:12], ownerid, secret, version))
            else:
                con.execute(
                    "INSERT OR REPLACE INTO owners (api_key, appid, appname, owner_label, owner_id, secret, version)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (key, appid, appname or "", key[:12], ownerid, secret, version))
            con.commit(); con.close()
            return self._send_json(ok(appid=appid, owner_id=ownerid, secret=secret, version=version, appname=appname))

        if p.path == "/api/init":
            return self._send_json(self._init(body))

        if p.path == "/api/license":
            return self._send_json(self._create_license(body))

        if p.path == "/api/generate":
            return self._send_json(self._create_license(body))

        if p.path == "/api/botkey":
            return self._send_json(self._bot_key(body))

        if p.path == "/api/shortlink/new":
            return self._send_json(self._shortlink_new(body))

        if p.path == "/api/shortlink/check":
            return self._send_json(self._shortlink_check(body))

        if p.path == "/api/shortlink/confirm":
            return self._send_json(self._shortlink_confirm(body))

        if p.path == "/api/license/resethwid":
            return self._send_json(self._mutate(body, action="hwid"))

        if p.path == "/api/license/renew":
            return self._send_json(self._mutate(body, action="renew"))

        if p.path == "/api/license/ban":
            return self._send_json(self._mutate(body, action="ban"))

        if p.path == "/api/verify":
            return self._send_json(self._verify(body))

        return self._send_json(fail("unknown api", 404))

    def do_DELETE(self):
        p = urlparse(self.path)
        m = re.match(r"^/api/license/([^/]+)$", p.path)
        if not m:
            return self._send_json(fail("unknown api", 404))
        body = self._read_json()
        return self._send_json(self._mutate(body, action="delete", lic_id=m.group(1)))

    # ---------------- helpers ----------------
    def _authorize(self, key, appid):
        con = db()
        owner = con.execute("SELECT 1 FROM owners WHERE api_key=? AND appid=?", (key, appid)).fetchone()
        con.close()
        return bool(owner)

    # ISHU AUTH: {ownerid, secret, name} instead of {key, appid}
    def _resolve_auth(self, body):
        key = body.get("key"); appid = body.get("appid")
        ownerid = body.get("ownerid"); secret = body.get("secret")
        if ownerid and secret:
            name = body.get("name") or ""
            con = db()
            # Match the canonical owner row by owner_id + secret first. The name
            # is just the app display label, so a name mismatch must never reject
            # a valid owner (this is what caused the bot's "API error" / 401).
            owner = con.execute(
                "SELECT api_key, appid FROM owners WHERE owner_id=? AND secret=?",
                (ownerid, secret)).fetchone()
            if owner is None and name:
                owner = con.execute(
                    "SELECT api_key, appid FROM owners WHERE owner_id=? AND secret=?"
                    " AND (appname=? OR appid=?)",
                    (ownerid, secret, name, name)).fetchone()
            con.close()
            if not owner:
                return (None, None, "invalid ownerid/secret", 401)
            key, appid = owner["api_key"], owner["appid"]
        if not key or not appid:
            return (None, None, "missing key/appid (or ownerid/secret)", 401)
        if not self._authorize(key, appid):
            return (None, None, "invalid key/appid", 401)
        return (key, appid, None, None)

    def _owner_name(self, key, appid):
        con = db()
        o = con.execute("SELECT appname FROM owners WHERE api_key=? AND appid=?",
                        (key, appid)).fetchone()
        con.close()
        return o["appname"] if o and o["appname"] else ""

    # --- /api/shortlink: verified VPLINK task system ---
    # The VPLINK short link wraps our callback URL. Completion is recorded on
    # the server only when the user's browser actually lands on the callback
    # (after the VPLINK ad/countdown). The bot just polls /check — there is no
    # client-side "I completed" button, so fake clicks can never mint a key.
    def _shortlink_new(self, body):
        key, appid, err, code = self._resolve_auth(body)
        if err:
            return fail(err, code)
        user_id = (body.get("user_id") or "").strip()
        ltype = body.get("ltype") or "license"
        destination = (body.get("destination") or "").strip()
        if not user_id:
            return fail("user_id required")
        if not destination:
            return fail("destination required")
        token = uuid.uuid4().hex
        now = int(datetime.datetime.now().timestamp() * 1000)
        con = db()
        con.execute("DELETE FROM shortlink_tasks WHERE user_id=?", (user_id,))
        con.execute(
            "INSERT INTO shortlink_tasks"
            " (token,user_id,ltype,destination,created_at,completed,completed_at,ip)"
            " VALUES (?,?,?,?,?,0,NULL,NULL)",
            (token, user_id, ltype, destination, now))
        con.commit(); con.close()
        return ok(token=token, user_id=user_id, ltype=ltype, completed=False)

    def _shortlink_check(self, body):
        key, appid, err, code = self._resolve_auth(body)
        if err:
            return fail(err, code)
        token = (body.get("token") or "").strip()
        if not token:
            return fail("token required")
        con = db()
        row = con.execute(
            "SELECT completed, ltype FROM shortlink_tasks WHERE token=?",
            (token,)).fetchone()
        con.close()
        if not row:
            return fail("task not found", 404)
        return ok(token=token, completed=bool(row["completed"]),
                  ltype=row["ltype"] or "license")

    def _shortlink_confirm(self, body):
        # Called ONLY by the signed verification page (with the HMAC sig).
        # Without a valid sig no one can mark a task complete — so copying the
        # link, backing out, or hitting the URL directly gives nothing.
        token = (body.get("token") or "").strip()
        sig = (body.get("sig") or "").strip()
        if not token:
            return fail("token required")
        if not sig:
            return fail("missing signature")
        ok_sig = hmac.compare_digest(sig, _sign_token(token))
        if not ok_sig:
            return fail("invalid signature", 403)
        con = db()
        row = con.execute(
            "SELECT completed FROM shortlink_tasks WHERE token=?", (token,)).fetchone()
        if not row:
            con.close()
            return fail("task not found", 404)
        addr = self.client_address[0] if self.client_address else ""
        con.execute(
            "UPDATE shortlink_tasks SET completed=1, completed_at=?, ip=? WHERE token=?",
            (int(datetime.datetime.now().timestamp() * 1000), addr, token))
        con.commit(); con.close()
        return ok(token=token, completed=True)

    def _init(self, body):
        key, appid, err, code = self._resolve_auth(body)
        if err:
            return fail(err, code)
        version = (body.get("version") or "").strip()
        return ok(success=True, message="app initialized", appid=appid,
                  appname=self._owner_name(key, appid), version=version)

    def _create_license(self, body):
        key, appid, err, code = self._resolve_auth(body)
        if err:
            return fail(err, code)
        username = (body.get("username") or "").strip()
        if not username:
            return fail("username required")
        con = db()
        dup = con.execute(
            "SELECT 1 FROM licenses WHERE appid=? AND username=?", (appid, username)).fetchone()
        if dup:
            con.close()
            return fail("user already exists")
        ltype = body.get("type") or "user"
        duration = body.get("duration") or "permanent"
        now = int(datetime.datetime.now().timestamp() * 1000)
        until = body.get("until")
        if until is not None:
            try:
                expires = int(until)
                duration = "until-date"
            except (TypeError, ValueError):
                expires = None
        else:
            ms = DUR_MS.get(duration, 0)
            expires = now + ms if ms else None
        lic = {
            "id": new_id(),
            "appid": appid,
            "username": username,
            "password_hash": sha(body.get("password") or "") if ltype == "user" else None,
            "type": ltype,
            "license_key": body.get("license_key") or gen_key("LIC"),
            "hwid": body.get("hwid") or None,
            "hwid_locked": 1 if _flag(body.get("lock")) else 0,
            "duration": duration,
            "expires_at": expires,
            "created_at": now,
            "last_login": None,
            "banned": 0,
        }
        con.execute(
            "INSERT INTO licenses (id,appid,username,password_hash,type,license_key,hwid,hwid_locked,duration,expires_at,created_at,last_login,banned)"
            " VALUES (:id,:appid,:username,:password_hash,:type,:license_key,:hwid,:hwid_locked,:duration,:expires_at,:created_at,:last_login,:banned)",
            lic)
        con.commit(); con.close()
        return ok(id=lic["id"], license_key=lic["license_key"], username=username,
                  expires=str(datetime.datetime.fromtimestamp(expires / 1000)) if expires else "permanent",
                  expires_at=expires)

    # --- /api/botkey: upsert key for a named user (for Discord / Telegram bots) ---
    def _bot_key(self, body):
        key, appid, err, code = self._resolve_auth(body)
        if err:
            return fail(err, code)
        username = body.get("username")
        if not username:
            return fail("username is required")
        duration = body.get("duration") or "48h"
        now = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
        until = body.get("until")
        if until is not None:
            try:
                expires = int(until)
            except (TypeError, ValueError):
                expires = None
        else:
            ms = DUR_MS.get(duration, 0)
            expires = now + ms if ms else None
        con = db()
        existing = con.execute(
            "SELECT * FROM licenses WHERE appid=? AND username=?", (appid, username)).fetchone()
        if existing:
            if existing["banned"]:
                con.close()
                return fail("user is banned")
            new_key = gen_key("LIC")
            hwlocked = 1 if _flag(body.get("lock"), True) else 0
            password = body.get("password") or ""
            con.execute(
                "UPDATE licenses SET license_key=?, duration=?, expires_at=?, hwid=NULL,"
                " hwid_locked=?, last_login=NULL, created_at=?,"
                " type=?, password_hash=? WHERE id=?",
                (new_key, "until-date" if until else duration, expires, hwlocked, now,
                 body.get("type") or existing["type"],
                 sha(password) if (body.get("type") or existing["type"]) == "user" else None,
                 existing["id"]))
            con.commit(); con.close()
            return ok(id=existing["id"], license_key=new_key, username=username,
                      password=password if (body.get("type") or existing["type"]) == "user" else None,
                      type=body.get("type") or existing["type"],
                      expires=str(datetime.datetime.fromtimestamp(expires / 1000)) if expires else "permanent",
                      expires_at=expires, renewed=True)
        ltype = body.get("type") or "license"
        password = body.get("password") or ""
        lic = {
            "id": new_id(),
            "appid": appid,
            "username": username,
            "password_hash": sha(password) if ltype == "user" else None,
            "type": ltype,
            "license_key": gen_key("LIC"),
            "hwid": None,
            "hwid_locked": 1 if _flag(body.get("lock"), True) else 0,
            "duration": "until-date" if until else duration,
            "expires_at": expires,
            "created_at": now,
            "last_login": None,
            "banned": 0,
        }
        con.execute(
            "INSERT INTO licenses (id,appid,username,password_hash,type,license_key,hwid,hwid_locked,duration,expires_at,created_at,last_login,banned)"
            " VALUES (:id,:appid,:username,:password_hash,:type,:license_key,:hwid,:hwid_locked,:duration,:expires_at,:created_at,:last_login,:banned)",
            lic)
        con.commit(); con.close()
        return ok(id=lic["id"], license_key=lic["license_key"], username=username,
                  password=password if ltype == "user" else None,
                  type=ltype,
                  expires=str(datetime.datetime.fromtimestamp(expires / 1000)) if expires else "permanent",
                  expires_at=expires, renewed=False)

    def _mutate(self, body, action, lic_id=None):
        key, appid, err, code = self._resolve_auth(body)
        if err:
            return fail(err, code)
        lid = lic_id or body.get("id")
        if not lid:
            return fail("id required")
        con = db()
        row = con.execute("SELECT * FROM licenses WHERE id=? AND appid=?", (lid, appid)).fetchone()
        if not row:
            con.close()
            return fail("license not found", 404)
        if action == "hwid":
            con.execute("UPDATE licenses SET hwid=NULL WHERE id=?", (lid,))
            msg = "hwid reset"
        elif action == "renew":
            duration = body.get("duration") or "permanent"
            now = int(datetime.datetime.now().timestamp() * 1000)
            until = body.get("until")
            if until is not None:
                try:
                    expires = int(until)
                    duration = "until-date"
                except (TypeError, ValueError):
                    expires = None
            else:
                ms = DUR_MS.get(duration, 0)
                expires = now + ms if ms else None
            con.execute("UPDATE licenses SET duration=?, expires_at=? WHERE id=?", (duration, expires, lid))
            msg = "renewed"
        elif action == "ban":
            banned = 1 if _flag(body.get("banned"), True) else 0
            con.execute("UPDATE licenses SET banned=? WHERE id=?", (banned, lid))
            msg = "banned" if banned else "unbanned"
        else:  # delete
            con.execute("DELETE FROM licenses WHERE id=?", (lid,))
            con.commit(); con.close()
            return ok(message="deleted")
        con.commit(); con.close()
        return ok(message=msg)

    def _verify(self, body):
        key, appid, err, code = self._resolve_auth(body)
        if err:
            return fail(err, code)
        user = (body.get("user") or "").strip()
        password = body.get("pass") or ""
        hwid = body.get("hwid") or None
        con = db()
        row = con.execute(
            "SELECT * FROM licenses WHERE appid=? AND (username=? OR license_key=?)",
            (appid, user, user)).fetchone()
        if not row:
            con.close()
            return fail("invalid username or license key")
        ltype = row["type"]
        if ltype == "user":
            if sha(password) != row["password_hash"]:
                con.close()
                return fail("invalid password")
        else:
            if password != row["license_key"]:
                con.close()
                return fail("invalid license key")
        if row["banned"]:
            con.close()
            return fail("user banned")
        if row["expires_at"] and int(datetime.datetime.now().timestamp() * 1000) > row["expires_at"]:
            con.close()
            return fail("subscription expired")
        locked = bool(row["hwid_locked"])
        if locked:
            if hwid and row["hwid"] and row["hwid"].lower() != hwid.lower():
                con.close()
                return fail("hwid mismatch")
            new_hwid = row["hwid"] or hwid
        else:
            new_hwid = row["hwid"]
        now = int(datetime.datetime.now().timestamp() * 1000)
        con.execute("UPDATE licenses SET last_login=?, hwid=? WHERE id=?", (now, new_hwid, row["id"]))
        con.commit()
        expires = row["expires_at"]
        con.close()
        return ok(success=True, message="valid",
                  expires=str(datetime.datetime.fromtimestamp(expires / 1000)) if expires else "permanent",
                  username=row["username"], type=ltype)


if __name__ == "__main__":
    db_init()
    print(f"  ISHU AUTH server running -> http://localhost:{PORT}")
    print(f"  Storage: {'Postgres (persistent) via DATABASE_URL' if USING_PG else 'SQLite: ' + DB_PATH}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()