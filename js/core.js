/* ============================================
   ISHU AUTH - Core Engine
   Author: ISHU
   ============================================ */

const DB_KEY = 'ishu_auth_db_v1';
const SESSION_KEY = 'ishu_auth_session_v1';

const DB = {
  load() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || { users: [], apps: [], keys: [] }; }
    catch (e) { return { users: [], apps: [], keys: [] }; }
  },
  save(data) { localStorage.setItem(DB_KEY, JSON.stringify(data)); },
  nextId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
};

/* ---------- Session ---------- */
const Session = {
  get() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },
  set(userId, username) { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, username, ts: Date.now() })); },
  clear() { localStorage.removeItem(SESSION_KEY); },
  userId() { const s = Session.get(); return s ? s.userId : null; }
};

/* ---------- Google Sign-In ---------- */
function _b64Decode(str) {
  const b = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b.length % 4 ? '='.repeat(4 - (b.length % 4)) : '';
  const raw = atob(b + pad);
  return decodeURIComponent(Array.prototype.map.call(raw, c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}
const GoogleAuth = {
  TOKEN_KEY: 'ishu_google_token_v1',
  token() { return localStorage.getItem(this.TOKEN_KEY) || null; },
  setToken(t) {
    if (t) localStorage.setItem(this.TOKEN_KEY, t);
    else localStorage.removeItem(this.TOKEN_KEY);
  },
  profileFromJwt(jwt) {
    try {
      const p = jwt.split('.')[1];
      const d = JSON.parse(_b64Decode(p));
      return {
        sub: d.sub,
        name: d.name || d.email,
        email: d.email,
        picture: d.picture || '',
        aud: d.aud,
        exp: d.exp
      };
    } catch (e) { return null; }
  },
  upsert(profile) {
    if (!profile || !profile.sub) return { ok: false, msg: 'Invalid Google profile.' };
    const db = DB.load();
    let user = db.users.find(u => u.googleId === profile.sub);
    if (!user) {
      user = {
        id: DB.nextId(),
        username: profile.name || profile.email || 'google-user',
        password: Crypto.hash('google-' + profile.sub + '-' + Date.now()),
        ownerId: Owner.generate(profile.email || profile.name || 'google'),
        secretId: Crypto.keyString('SEC'),
        apiKey: Crypto.keyString('ISHU'),
        version: randVersion(),
        googleId: profile.sub,
        googleEmail: profile.email,
        googlePicture: profile.picture,
        provider: 'google',
        createdAt: Date.now()
      };
      const app = buildApp(user);
      app.name = user.username;
      db.users.push(user);
      db.apps.push(app);
      DB.save(db);
    }
    Session.set(user.id, user.username);
    return { ok: true, user };
  },
  signOut() {
    try {
      const g = window.google;
      if (g && g.accounts && g.accounts.id) {
        g.accounts.id.disableAutoSelect();
        const tk = this.token();
        if (tk) g.accounts.id.revoke(tk, function () {});
      }
    } catch (e) { /* ignore */ }
    this.setToken(null);
    Session.clear();
  }
};

/* ---------- Crypto helpers ---------- */
const Crypto = {
  hash(str) {
    let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  },
  token(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    const rnd = new Uint32Array(len);
    crypto.getRandomValues(rnd);
    for (let i = 0; i < len; i++) out += chars[rnd[i] % chars.length];
    return out;
  },
  keyString(prefix) {
    let s = '';
    for (let i = 0; i < 8; i++) s += Crypto.token(4) + (i < 7 ? '-' : '');
    return prefix ? prefix.toUpperCase() + '_' + s : s;
  }
};

/* ---------- SWID (Space/World/ID style fingerprint) ---------- */
const SWID = {
  generate(ownerId, appId, version) {
    const seed = `${ownerId}|${appId}|${version}|${Crypto.token(6)}`;
    const h = Crypto.hash(seed);
    const liveKey = `LK-${Crypto.token(4)}-${Crypto.token(4)}-${h.substring(0, 8)}`;
    return {
      world: `${Crypto.token(4)}-${Crypto.token(4)}`,
      id: Crypto.keyString('SW'),
      liveKey,
      hash: h,
      fingerprint: `SWID:${h.substring(0, 8)}:${ownerId.slice(-6)}:${version}`
    };
  }
};

/* ---------- Owner ID ---------- */
const Owner = {
  generate(username) {
    const base = username.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'ISHU';
    return `${base}-${Crypto.token(5).toUpperCase()}`;
  }
};

/* rarest ka version 1.2/2.0/5.0, baaki sab 1.0 */
function randVersion() {
  const rare = ['1.2', '2.0', '2.5', '5.0'];
  return Math.random() < 0.88 ? '1.0' : rare[Math.floor(Math.random() * rare.length)];
}

function buildApp(user) {
  const app = {
    id: DB.nextId(),
    appId: `APP-${Crypto.token(6).toUpperCase()}`,
    ownerId: user.id,
    ownerName: user.username,
    ownerTag: user.ownerId,
    name: user.username,
    version: user.version || '1.0',
    secretId: user.secretId,
    apiKey: user.apiKey,
    swid: null,
    createdAt: Date.now()
  };
  app.swid = SWID.generate(user.ownerId, app.appId, app.version);
  return app;
}

/* ---------- Auth ---------- */
const Auth = {
  register(username, password) {
    username = username.trim();
    if (username.length < 3) return { ok: false, msg: 'Username must be at least 3 characters.' };
    if (password.length < 4) return { ok: false, msg: 'Password must be at least 4 characters.' };

    const db = DB.load();
    const lower = username.toLowerCase();
    if (db.users.some(u => u.username.toLowerCase() === lower)) {
      return { ok: false, msg: 'Username already exists.' };
    }

    const userId = DB.nextId();
    const user = {
      id: userId,
      username,
      password: Crypto.hash(password),
      ownerId: Owner.generate(username),
      secretId: Crypto.keyString('SEC'),
      apiKey: Crypto.keyString('ISHU'),
      version: randVersion(),
      createdAt: Date.now()
    };
    const app = buildApp(user);
    app.name = username;
    db.users.push(user);
    db.apps.push(app);
    DB.save(db);
    Session.set(userId, username);
    return { ok: true, user, app };
  },

  login(username, password) {
    const db = DB.load();
    const lower = username.trim().toLowerCase();
    const user = db.users.find(u => u.username.toLowerCase() === lower);
    if (!user) return { ok: false, msg: 'User not found.' };
    if (user.password !== Crypto.hash(password)) return { ok: false, msg: 'Incorrect password.' };
    Session.set(user.id, user.username);
    return { ok: true, user };
  },

  current() {
    const id = Session.userId();
    if (!id) return null;
    const db = DB.load();
    return db.users.find(u => u.id === id) || null;
  }
};

/* ---------- Apps ---------- */
const Apps = {
  all() {
    const db = DB.load();
    const uid = Session.userId();
    const list = db.apps.filter(a => a.ownerId === uid);
    const me = db.users.find(u => u.id === uid);
    if (me) {
      let dirty = false;
      list.forEach(a => {
        if (a.secretId !== me.secretId || a.apiKey !== me.apiKey) {
          a.secretId = me.secretId;
          a.apiKey = me.apiKey;
          dirty = true;
        }
      });
      if (dirty) DB.save(db);
    }
    return list;
  },
  ensureDefault() {
    const user = Auth.current();
    if (!user) return null;
    const db = DB.load();
    let app = db.apps.find(a => a.ownerId === user.id);
    if (!app) {
      app = buildApp(user);
      db.apps.push(app);
      DB.save(db);
    }
    return app;
  },
  create(name, version) {
    const user = Auth.current();
    if (!user) return { ok: false, msg: 'Not logged in.' };
    if (!name || !name.trim()) return { ok: false, msg: 'Application name is required.' };

    const db = DB.load();
    const app = {
      id: DB.nextId(),
      appId: `APP-${Crypto.token(6).toUpperCase()}`,
      ownerId: user.id,
      ownerName: user.username,
      ownerTag: user.ownerId,
      name: name.trim(),
      version: version || '1.0',
      secretId: user.secretId,
      apiKey: user.apiKey,
      swid: null,
      createdAt: Date.now()
    };
    app.swid = SWID.generate(user.ownerId, app.appId, app.version);
    db.apps.push(app);
    DB.save(db);
    return { ok: true, app };
  },
  get(appId) {
    const db = DB.load();
    const uid = Session.userId();
    return db.apps.find(a => a.id === appId && a.ownerId === uid) || null;
  },
  remove(appId) {
    const db = DB.load();
    const uid = Session.userId();
    db.apps = db.apps.filter(a => !(a.id === appId && a.ownerId === uid));
    db.keys = db.keys.filter(k => !(k.appId === appId && k.ownerId === uid));
    DB.save(db);
  },
  updateFields(appId, patch) {
    const db = DB.load();
    const idx = db.apps.findIndex(a => a.id === appId && a.ownerId === Session.userId());
    if (idx === -1) return null;
    Object.assign(db.apps[idx], patch);
    DB.save(db);
    return db.apps[idx];
  },
  refreshSWID(appId) {
    const app = Apps.get(appId);
    if (!app) return null;
    const user = Auth.current();
    app.swid = SWID.generate(user.ownerId, app.appId, app.version);
    Apps.updateFields(appId, { swid: app.swid });
    return app.swid;
  }
};

/* ---------- Keys ---------- */
const Keys = {
  all() {
    const db = DB.load();
    const uid = Session.userId();
    return db.keys.filter(k => k.ownerId === uid).sort((a, b) => b.createdAt - a.createdAt);
  },
  generate(kind, appId, duration) {
    const user = Auth.current();
    if (!user) return { ok: false, msg: 'Not logged in.' };

    const db = DB.load();
    const now = Date.now();
    const durMs = Licenses.durMs(duration);
    const keyObj = {
      id: DB.nextId(),
      ownerId: user.id,
      appId: appId || null,
      kind: kind || 'basic',
      value: Crypto.keyString(kind === 'owner' ? 'OWN' : kind === 'live' ? 'LIVE' : 'KEY'),
      swid: SWID.generate(user.ownerId, appId || 'GLOBAL', user.version),
      status: 'active',
      createdAt: now,
      lastRotated: now,
      duration: duration || 'forever',
      expiresAt: durMs ? now + durMs : null
    };
    db.keys.push(keyObj);
    DB.save(db);
    return { ok: true, key: keyObj };
  },
  rotate(keyId) {
    const db = DB.load();
    const uid = Session.userId();
    const k = db.keys.find(x => x.id === keyId && x.ownerId === uid);
    if (!k) return null;
    k.value = Crypto.keyString(k.kind === 'owner' ? 'OWN' : k.kind === 'live' ? 'LIVE' : 'KEY');
    k.swid = SWID.generate(Auth.current().ownerId, k.appId || 'GLOBAL', Auth.current().version);
    k.lastRotated = Date.now();
    k.status = 'active';
    DB.save(db);
    return k;
  },
  revoke(keyId) {
    const db = DB.load();
    const uid = Session.userId();
    const k = db.keys.find(x => x.id === keyId && x.ownerId === uid);
    if (!k) return false;
    k.status = 'used';
    DB.save(db);
    return true;
  },
  remove(keyId) {
    const db = DB.load();
    const uid = Session.userId();
    const before = db.keys.length;
    db.keys = db.keys.filter(x => !(x.id === keyId && x.ownerId === uid));
    DB.save(db);
    return db.keys.length < before;
  }
};

/* ---------- Duration presets ---------- */
const DURATIONS = [
  { id: 'permanent', label: 'Permanent', ms: 0 },
  { id: '1d',    label: '1 Day',   ms: 1 * 24 * 3600 * 1000 },
  { id: '3d',    label: '3 Days',  ms: 3 * 24 * 3600 * 1000 },
  { id: '7d',    label: '7 Days',  ms: 7 * 24 * 3600 * 1000 },
  { id: '30d',   label: '30 Days', ms: 30 * 24 * 3600 * 1000 },
  { id: '90d',   label: '90 Days', ms: 90 * 24 * 3600 * 1000 },
  { id: '1y',    label: '1 Year',  ms: 365 * 24 * 3600 * 1000 }
];
const durOpts = () => DURATIONS.map(d => `<option value="${d.id}">${d.label}</option>`).join('');
const durLabel = id => { const d = DURATIONS.find(x => x.id === id); return d ? d.label : (id === 'until-date' ? 'Custom Date' : id); };

/* ---------- Licenses (ISHU AUTH user control) ---------- */
const Licenses = {
  durMs(id) {
    const d = DURATIONS.find(x => x.id === id);
    return d ? d.ms : 0;
  },
  all(appId) {
    const db = DB.load();
    const uid = Session.userId();
    let list = db.licenses || [];
    if (appId) list = list.filter(l => l.ownerId === uid && l.appId === appId);
    else list = list.filter(l => l.ownerId === uid);
    return list;
  },
  create({ appId, username, password, duration, untilMs, hwid, hwidLock, isLicense }) {
    const user = Auth.current();
    if (!user) return { ok: false, msg: 'Not logged in.' };
    if (!username || !username.trim()) return { ok: false, msg: 'Username required.' };

    const db = DB.load();
    db.licenses = db.licenses || [];
    if (db.licenses.some(l => l.ownerId === user.id && l.username === username.trim())) {
      return { ok: false, msg: 'User already exists.' };
    }
    const now = Date.now();
    const durMs = Licenses.durMs(duration);
    const lic = {
      id: DB.nextId(),
      ownerId: user.id,
      appId: appId || null,
      username: username.trim(),
      password: password ? Crypto.hash(password) : null,
      passwordPlain: isLicense ? null : (password || null),
      type: isLicense ? 'license' : 'user',
      licenseKey: Crypto.keyString('LIC'),
      hwid: hwid || null,
      hwidLocked: hwidLock !== false,
      duration: untilMs ? 'until-date' : (duration || 'permanent'),
      createdAt: now,
      expiresAt: untilMs || (durMs ? now + durMs : null),
      lastLogin: null,
      banned: false
    };
    db.licenses.push(lic);
    DB.save(db);
    return { ok: true, lic };
  },
  get(id) {
    const db = DB.load();
    const uid = Session.userId();
    return (db.licenses || []).find(l => l.id === id && l.ownerId === uid) || null;
  },
  remove(id) {
    const db = DB.load();
    const uid = Session.userId();
    const before = (db.licenses || []).length;
    db.licenses = (db.licenses || []).filter(l => !(l.id === id && l.ownerId === uid));
    DB.save(db);
    return before !== (db.licenses || []).length;
  },
  resetHWID(id) {
    const l = Licenses.get(id);
    if (!l) return null;
    l.hwid = null;
    l.hwidResets = (l.hwidResets || 0) + 1;
    Licenses._save(l);
    return l;
  },
  renew(id, duration, untilMs) {
    const l = Licenses.get(id);
    if (!l) return null;
    if (untilMs) {
      l.duration = 'until-date';
      l.expiresAt = untilMs;
    } else {
      const durMs = Licenses.durMs(duration);
      l.duration = duration || 'permanent';
      l.expiresAt = durMs ? Date.now() + durMs : null;
    }
    l.status = 'active';
    Licenses._save(l);
    return l;
  },
  setStatus(id, banned) {
    const l = Licenses.get(id);
    if (!l) return null;
    l.banned = banned;
    Licenses._save(l);
    return l;
  },
  ticketStatus(l) {
    if (!l) return 'expired';
    if (l.banned) return 'reset';
    if (l.expiresAt && Date.now() > l.expiresAt) return 'expired';
    return 'active';
  },
  _save(l) {
    const db = DB.load();
    const idx = (db.licenses || []).findIndex(x => x.id === l.id);
    if (idx !== -1) db.licenses[idx] = l;
    DB.save(db);
  }
};

/* ---------- Formatting ---------- */
const fmt = {
  time(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },
  since(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
};

/* ---------- UI helpers ---------- */
function el(id) { return document.getElementById(id); }

function toast(msg, type) {
  const t = document.getElementById('toast-root');
  if (!t) return;
  const d = document.createElement('div');
  d.className = 'toast ' + (type || 'ok');
  d.textContent = msg;
  t.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 300); }, 2600);
}

function copyText(text, btn) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      toast('Copied to clipboard', 'ok');
      if (btn) { const o = btn.textContent; btn.textContent = 'COPIED'; setTimeout(() => btn.textContent = o, 1400); }
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied to clipboard', 'ok'); } catch (e) {}
    ta.remove();
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statusBadge(status) {
  const map = {
    active: '<span class="k-badge active">ACTIVE</span>',
    used: '<span class="k-badge used">USED</span>',
    expired: '<span class="k-badge expired">EXPIRED</span>',
    owner: '<span class="k-badge owner">OWNER</span>'
  };
  return map[status] || map.active;
}