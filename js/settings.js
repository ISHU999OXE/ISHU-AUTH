/* ============================================================
   ISHU AUTH - Settings Engine
   Author: ISHU
   ------------------------------------------------------------
   - i18n: 13 Indian languages + English (default = English)
   - Theme: preset background gradients (default = original look)
   - Color: dynamic accent (default = original heat accent)
   - Persistence: localStorage (GitHub Pages static = browser save)
   ============================================================ */

/* ---------- accents ---------- */
const ACCENTS = {
  orange: { a: '#ff4d2e', a2: '#ffb030', a3: '#25d0ff' },
  red:    { a: '#e11d48', a2: '#f43f5e', a3: '#38bdf8' },
  blue:   { a: '#2563eb', a2: '#3b82f6', a3: '#22d3ee' },
  green:  { a: '#10b981', a2: '#34d399', a3: '#a3e635' },
  purple: { a: '#8b5cf6', a2: '#a78bfa', a3: '#f472b6' },
  yellow: { a: '#eab308', a2: '#facc15', a3: '#22d3ee' },
  cyan:   { a: '#06b6d4', a2: '#22d3ee', a3: '#f59e0b' },
  pink:   { a: '#ec4899', a2: '#f472b6', a3: '#22d3ee' }
};

/* ---------- preset backgrounds ---------- */
const THEMES = {
  void:   { name: 'Void',    bg: '#0b0b0e', c1: 'rgba(255,77,46,.35)',    c2: 'rgba(255,176,48,.22)',  custom: null },
  ember:  { name: 'Ember',   bg: '#12070a', c1: 'rgba(255,60,30,.5)',     c2: 'rgba(255,176,48,.3)',   custom: null },
  ocean:  { name: 'Ocean',   bg: '#06121c', c1: 'rgba(37,208,255,.4)',    c2: 'rgba(59,130,246,.3)',   custom: null },
  forest: { name: 'Forest',  bg: '#07150d', c1: 'rgba(16,185,129,.4)',    c2: 'rgba(163,230,53,.25)',  custom: null },
  royal:  { name: 'Royal',   bg: '#0e0718', c1: 'rgba(139,92,246,.45)',   c2: 'rgba(244,114,182,.25)', custom: null },
  carbon: { name: 'Carbon',  bg: '#0a0a0c', c1: 'rgba(255,255,255,.06)',  c2: 'rgba(120,130,160,.15)', custom: null }
};

/* ---------- languages ---------- */
const LANGS = { en: 'English', hi: 'Hindi', ur: 'Urdu', bn: 'Bangla', ta: 'Tamil', te: 'Telugu',
                mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', ml: 'Malayalam', kn: 'Kannada',
                or: 'Odia', as: 'Assamese' };

/* ---------- the engine ---------- */
const Settings = (function () {
  const KEY = 'ishu.settings.v1';
  let cfg = { lang: 'en', theme: 'void', accent: 'orange' };

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); cfg = Object.assign(cfg, s); }
    catch (e) { /* ignore */ }
    // legacy image-upload field is no longer a thing
    if (cfg.customBg) { cfg.customBg = null; save(); }
    return cfg;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(cfg)); }
  function set(obj) { cfg = Object.assign(cfg, obj); save(); applyColor(); applyTheme(); applyLang(); return cfg; }

  function applyColor() {
    // default (orange) = original look, no inline overrides needed
    const r = document.documentElement.style;
    const propList = ['--accent', '--accent-2', '--accent-3', '--glow', '--grad', '--font-grad'];
    if (!cfg.accent || cfg.accent === 'orange') { propList.forEach(p => r.removeProperty(p)); return; }
    const ac = ACCENTS[cfg.accent] || ACCENTS.orange;
    r.setProperty('--accent', ac.a);
    r.setProperty('--accent-2', ac.a2);
    r.setProperty('--accent-3', ac.a3);
    r.setProperty('--glow', '0 0 22px ' + hexA(ac.a, 0.32));
    r.setProperty('--grad', 'linear-gradient(90deg, ' + ac.a + ', ' + ac.a2 + ')');
    r.setProperty('--font-grad', 'linear-gradient(90deg, ' + ac.a + ', ' + ac.a2 + ', ' + ac.a3 + ', ' + ac.a + ')');
  }

  function applyTheme() {
    const r = document.documentElement.style;
    const propList = ['--bg', '--bg-2', '--bg-3', '--card', '--border'];
    // default (void) = original look, plain dark like day one
    if (!cfg.theme || cfg.theme === 'void') { propList.forEach(p => r.removeProperty(p)); return; }
    const th = THEMES[cfg.theme] || THEMES.void;
    r.setProperty('--bg', th.bg);
    r.setProperty('--bg-2', tint(th.bg, 0.08));
    r.setProperty('--bg-3', tint(th.bg, 0.16));
    r.setProperty('--card', th.bg);
  }

  function tint(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = amt === undefined ? 0.25 : amt;
    const b = (n & 255), g = ((n >> 8) & 255), r = ((n >> 16) & 255);
    const light = (v) => Math.min(255, Math.round(v + (255 - v) * f));
    const dark = (v) => Math.round(v * (1 - f));
    const lr = f < 1 ? light(r) : dark(r), lg = f < 1 ? light(g) : dark(g), lb = f < 1 ? light(b) : dark(b);
    return '#' + toHex(lr) + toHex(lg) + toHex(lb);
  }
  function toHex(v) { const s = v.toString(16); return s.length === 1 ? '0' + s : s; }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function applyLang() {
    const lang = cfg.lang || 'en';
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.lang = lang === 'en' ? 'en' : lang;
    // dynamic templates re-render
    if (typeof window.renderAll === 'function') { try { window.renderAll(); } catch (e) { console.error(e); } }
    // settings page refresh
    if (typeof renderSettings === 'function' && document.getElementById('page-settings')) {
      try { renderSettings(); } catch (e) { console.error(e); }
    }
    // apply to every [data-i18n] node (including freshly rendered ones)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const txt = Tr(lang, el.getAttribute('data-i18n'));
      if (txt) el.textContent = txt;
    });
  }
  function lang() { return cfg.lang || 'en'; }
  return { load, save, set, applyColor, applyTheme, applyLang, lang, cfg: () => cfg, ACCENTS, THEMES, LANGS };
})();

/* ---------- message catalog ---------- */
const MSG = (function () {
  const base = {
    // nav
    nav_dashboard: 'Dashboard', nav_users: 'Create Users', nav_apps: 'Applications',
    nav_keys: 'API Keys', nav_settings: 'Settings', nav_install: 'Installation',
    sign_out: 'Sign Out', customer_support: 'Customer Support',
    // dashboard page
    hero_sub_app: 'APP', hero_sub_keys: 'KEYS', hero_sub_control: 'CONTROL',
    stat_apps: 'Applications', stat_keys: 'API Keys', stat_users: 'Users / Licenses',
    stat_apps_trend: 'default app auto-created', stat_keys_trend: 'still live', stat_users_trend: 'total created',
    identity: 'Identity', identity_hint: 'click to copy · secret is blurred',
    live_stream: 'Live Key Stream', live_hint: 'Latest generated keys & rotations',
    owner_id: 'Owner ID', secret_id: 'Secret ID', version: 'Version', app_id: 'App ID',
    no_keys: 'No keys yet — click to generate, only then the API key is shown.',
    no_keys_live: 'No keys yet.<br>Generate — permanent or day/year option is available.',
    // apps page
    apps_title: 'APPLICATIONS', apps_sub: 'Your app is auto-created — rename it with the pencil.',
    new_app: '+ New App', new_app_name: 'App name',
    // keys page
    keys_title: 'API KEYS', keys_sub: 'Create a key as per your need — permanent or day/year.',
    gen_key: '+ Generate', master_label: 'MASTER API KEY · use it only after generating',
    show: 'Show', hide: 'Hide', copy: 'COPY',
    // users page
    users_title: 'USERS & LICENSES', users_sub: 'Create a user or license key — HWID reset, renew, permanent time, ban. All control is yours.',
    app: 'App', new_user: '+ New User', new_license: '+ License Key',
    local_storage: '● virtual storage', sqlite_live: '● SQLite live',
    th_username: 'Username', th_type: 'Type', th_license: 'License Key', th_expires: 'Expires',
    th_hwid: 'HWID', th_status: 'Status', th_device: 'Device', th_actions: 'Actions',
    user_type: 'user', license_key: 'license-key',
    device_one: '1 device', device_any: 'any device',
    no_users: 'No users / licenses yet — click a button to create the first one.',
    // settings page
    settings_title: 'SETTINGS', settings_sub: 'Language, theme and color — all under your control.',
    lang_title: 'Language', lang_sub: 'Choose the language for the entire panel.',
    theme_title: 'Theme', theme_sub: 'Pick a preset background — the default keeps the original look until you change it.',
    color_title: 'Accent Color', color_sub: 'Change the theme colour of the whole panel.',
    reset_all: 'Reset All Settings',
    saved: 'Settings saved.',
    update: 'Update',
    // install page
    install_title: 'INSTALLATION', install_sub: 'Connect your app, bot or software to ISHU AUTH — no packages to install.',
    your_values: 'Your values — copy these to your client',
    snippet_toggle: 'Display code snippet',
    how_works: 'How it works',
    code_ready_labels: 'C# ready',
    download_pkg: 'Download Package', download_bot: 'Download Bot Source',
    tab_py: 'Python', tab_cs: 'C#', tab_js: 'JavaScript', tab_gen: 'Generic / HTTP',
    // modals / toasts
    create: 'Create', cancel: 'Cancel', delete: 'Delete this user/license?',
    created_user: 'User created', created_license: 'License key created',
    renamed: 'Renamed', key_rotated: 'Key rotated — new HWID is live',
    key_revoked: 'Key revoked', key_deleted: 'Key deleted',
    hwid_reset: 'HWID reset — user can login again',
    renewed: 'Renewed', banned: 'User banned', unbanned: 'User unbanned',
    deleted: 'Deleted', hwid_reset2: 'HWID reset complete',
    need_app: 'Select an app first', user_exists: 'User already exists.',
    invalid: 'Failed', server_unreachable: 'server unreachable',
    // login
    system_online: 'system online', username: 'Username', password: 'Password',
    login: 'Login', no_account: 'No account?', register: 'Register',
    create_account: 'Create Account', choose_username: 'choose username',
    create_password: 'create password', already_registered: 'Already registered?',
    welcome_back: 'Welcome back, ', account_created: 'Account created — welcome ',
    continue_google: 'Continue with Google',
    or_use: 'or login with',
    google_setup: 'Google login not configured yet — put your Google Client ID in index.html (GOOGLE_CLIENT_ID).',
    google_offline: 'No internet — Google Sign-In needs a connection.',
    google_failed: 'Google sign-in failed. Please try again.',
    google_blocked: 'Google sign-in is blocked on this address. Fix: add this URL in Google Cloud Console (Credentials → OAuth Client ID → Authorized JavaScript origins), or simply use Username & Password login above — it works on every address.',
    g_alt: 'Google blocked? Username & Password se login karo (upar) — har jaga chalta hai.',
    // more (settings / keys / users modals)
    owner: 'Owner',
    key_type: 'Key Type', basic_key: 'Basic Key', live_key: 'Live Key (auto-swid)', owner_key: 'Owner Key',
    duration: 'Duration', attach_app: 'Attach to App (optional)', global: '— Global —',
    copy: 'Copy', rotate: 'Rotate', revoke: 'Revoke', delete: 'Delete', forever: 'forever',
    done: 'Done', gen_key_title: 'Generate API Key', key_generated: 'Key generated', key_generated_title: 'Key Generated',
    confirm_revoke: 'Revoke this key?', confirm_del_key: 'Delete this key permanently?',
    confirm_del_app: 'Delete the app and all its keys/users? A new default app will be created.',
    app_deleted: 'App deleted — new default app created',
    new_user_title: 'New User', new_license_title: 'New License Key',
    label_opt: 'Label (optional)', hwid_opt: 'HWID (optional)', hwid_lock: 'HWID Lock',
    hwid_lock_hint: 'works only on 1 device (locks to the device that logs in first)',
    leave_empty: 'leave empty', expiry: 'Expiry — preset or exact date',
    expiry_hint: 'Choose a preset or pick an exact date from the calendar — it starts running from today.',
    renew_title: 'Renew / Extend', renew: 'Renew', ban: 'Ban', unban: 'Unban',
    live: 'LIVE', till: 'till', loading_app: 'Loading your app\u2026',
    copyright: '\u00a9 v1.0 \u00b7 Copyrighted by ISHU'
  };
  const L = {
    hi: { loading_app:'आपका ऐप लोड हो रहा…', upload_hint:'गैलरी, PC या फ़ोन से कोई भी इमेज चुनें — वह बैकग्राउंड बन जाएगा।', owner:'मालिक', key_type:'कुंजी प्रकार', basic_key:'बेसिक कुंजी', live_key:'लाइव कुंजी (ऑटो-एसडब्ल्यूआईडी)', owner_key:'मालिक कुंजी', duration:'अवधि', attach_app:'ऐप से जोड़ें (वैकल्पिक)', global:'— ग्लोबल —', copy:'कॉपी', rotate:'रोटेट', revoke:'रद्द करें', delete:'हटाएं', forever:'सदैव', done:'समाप्त', gen_key_title:'एपीआई कुंजी बनाएं', key_generated:'कुंजी बन गई', key_generated_title:'कुंजी बन गई', confirm_revoke:'इस कुंजी को रद्द करें?', confirm_del_key:'इस कुंजी को स्थायी रूप से हटाएं?', confirm_del_app:'ऐप और उसकी सभी कुंजी/उपयोगकर्ता हटाएं? नई डिफ़ॉल्ट ऐप बनती रहेगी।', app_deleted:'ऐप हटा दी गई — नई डिफ़ॉल्ट ऐप बन गई', new_user_title:'नया उपयोगकर्ता', new_license_title:'नई लाइसेंस कुंजी', label_opt:'लेबल (वैकल्पिक)', hwid_opt:'HWID (वैकल्पिक)', hwid_lock:'HWID लॉक', hwid_lock_hint:'सिर्फ 1 डिवाइस पर चले (पहले लॉगिन वाले डिवाइस पर लॉक)', leave_empty:'खाली छोड़ें', expiry:'समाप्ति — प्रीसेट या सटीक तारीख', expiry_hint:'प्रीसेट चुनें या कैलेंडर से सटीक तारीख — आज से शुरू होता है।', renew_title:'नवीनीकरण / विस्तार', renew:'नवीनीकरण', ban:'प्रतिबंध', unban:'प्रतिबंध हटाएं', live:'लाइव', till:'तक', nav_dashboard:'डैशबोर्ड', nav_users:'उपयोगकर्ता बनाएं', nav_apps:'एप्लिकेशन', nav_keys:'एपीआई की', nav_settings:'सेटिंग्स', nav_install:'इंस्टालेशन', sign_out:'साइन आउट', customer_support:'ग्राहक सहायता', hero_sub_app:'एप', hero_sub_keys:'की', hero_sub_control:'नियंत्रण', stat_apps:'एप्लिकेशन', stat_keys:'एपीआई की', stat_users:'उपयोगकर्ता / लाइसेंस', identity:'पहचान', identity_hint:'क्लिक कर कॉपी करें · सीक्रेट छिपा है', live_stream:'लाइव की स्ट्रीम', owner_id:'मालिक आईडी', secret_id:'सीक्रेट आईडी', version:'संस्करण', app_id:'ऐप आईडी', snippet_toggle:'कोड स्निपेट दिखाएं', apps_title:'एप्लिकेशन', apps_sub:'आपका ऐप अपने-आप बना — पेंसिल से नाम बदलें।', keys_title:'एपीआई की', keys_sub:'अपनी ज़रूरत के हिसाब से की बनाएं — स्थायी या दिन/साल।', gen_key:'+ जनरेट', show:'दिखाएं', hide:'छिपाएं', copy:'कॉपी', users_title:'उपयोगकर्ता और लाइसेंस', users_sub:'उपयोगकर्ता या लाइसेंस की बनाएं — HWID रीसेट, नवीनीकरण, स्थायी समय, प्रतिबंध। सब नियंत्रण आपका।', app:'ऐप', new_user:'+ नया उपयोगकर्ता', new_license:'+ लाइसेंस की', local_storage:'● लोकल स्टोरेज', sqlite_live:'● SQLite लाइव', th_username:'उपयोगकर्ता', th_type:'प्रकार', th_license:'लाइसेंस की', th_expires:'समाप्ति', th_hwid:'HWID', th_status:'स्थिति', th_device:'डिवाइस', th_actions:'कार्रवाई', no_users:'अभी कोई उपयोगकर्ता / लाइसेंस नहीं — पहला बनाने के लिए बटन दबाएं।', settings_title:'सेटिंग्स', settings_sub:'भाषा, थीम और रंग — सब आपके नियंत्रण में।', lang_title:'भाषा', lang_sub:'पूरे पैनल के लिए भाषा चुनें।', theme_title:'थीम', theme_sub:'पहले से बनी बैकग्राउंड चुनें या अपनी इमेज अपलोड करें।', color_title:'रंग', color_sub:'पूरे पैनल का रंग बदलें।', upload_bg:'इमेज अपलोड', clear_bg:'इमेज हटाएं', reset_all:'सभी सेटिंग्स रीसेट', saved:'सेटिंग्स सेव हो गईं।', install_title:'इंस्टालेशन', install_sub:'अपने ऐप, बॉट या सॉफ्टवेयर को ISHU AUTH से जोड़ें — कोई पैकेज इंस्टॉल नहीं।', how_works:'यह कैसे काम करता है', download_pkg:'पैकेज डाउनलोड', tab_py:'पाइथन', tab_cs:'सी#', tab_js:'जावास्क्रिप्ट', tab_gen:'जेनेरिक / HTTP', create:'बनाएं', cancel:'रद्द करें', created_user:'उपयोगकर्ता बना', created_license:'लाइसेंस की बनी', renamed:'नाम बदला', key_rotated:'की घुमाई गई — नया HWID लाइव', key_revoked:'की रद्द', key_deleted:'की हटाई', hwid_reset:'HWID रीसेट — उपयोगकर्ता फिर से लॉगिन कर सकता है', renewed:'नवीनीकरण हुआ', banned:'उपयोगकर्ता प्रतिबंधित', unbanned:'प्रतिबंध हटाया', deleted:'हटाया', hwid_reset2:'HWID रीसेट पूरा', need_app:'पहले एक ऐप चुनें', user_exists:'उपयोगकर्ता पहले से मौजूद है।', invalid:'विफल', server_unreachable:'सर्वर अप्राप्य', system_online:'सिस्टम ऑनलाइन', username:'उपयोगकर्ता नाम', password:'पासवर्ड', login:'लॉगिन', no_account:'खाता नहीं है?', register:'रजिस्टर', create_account:'खाता बनाएं', choose_username:'उपयोगकर्ता नाम चुनें', create_password:'पासवर्ड बनाएं', already_registered:'पहले से पंजीकृत?', welcome_back:'वापस स्वागत है, ', account_created:'खाता बना — स्वागत है ', copyright:'© v1.0 · ISHU द्वारा कॉपीराइट' },
    ur: { loading_app:'آپ لوڈ ہو رہی ہے…', upload_hint:'گیلری، PC یا فون سے کوئی بھی تصویر چنیں — وہ بیک گراؤنڈ بن جائے گی۔', owner:'مالک', key_type:'کی کی قسم', basic_key:'بیسک کی', live_key:'لائیو کی (آٹو-HWID)', owner_key:'مالک کی', duration:'مدت', attach_app:'ایپ سے منسلک (اختیاری)', global:'— گلوبل —', copy:'کاپی', rotate:'گھمائیں', revoke:'منسوخ', delete:'حذف', forever:'ہمیشہ', done:'مکمل', gen_key_title:'API کی بنائیں', key_generated:'کی بن گئی', key_generated_title:'کی بن گئی', confirm_revoke:'کی منسوخ کریں؟', confirm_del_key:'یہ کی مستقل حذف کریں؟', confirm_del_app:'ایپ اور اس کی تمام کیز/صارفین حذف؟ نئی ڈیفالٹ ایپ بنے گی。', app_deleted:'ایپ حذف — نئی ڈیفالٹ ایپ بن گئی', new_user_title:'نیا صارف', new_license_title:'نئی لائسنس کی', label_opt:'لیبل (اختیاری)', hwid_opt:'HWID (اختیاری)', hwid_lock:'HWID لاک', hwid_lock_hint:'صرف 1 ڈیوائس پر چلے (پہلے لاگ ان والے ڈیوائس پر لاک)', leave_empty:'خالی چھوڑیں', expiry:'میعاد — پری سیٹ یا درست تاریخ', expiry_hint:'پری سیٹ چنیں یا کیلنڈر سے تاریخ — آج سے شروعہ', renew_title:'تجدید / توسیع', renew:'تجدید', ban:'پابندی', unban:'پابندی ہٹائیں', live:'لائیو', till:'تک', nav_dashboard:'ڈیش بورڈ', nav_users:'صارف بنائیں', nav_apps:'ایپلیکیشنز', nav_keys:'API کیز', nav_settings:'ترتیبات', nav_install:'انسٹالیشن', sign_out:'سائن آؤٹ', hero_sub_app:'ایپ', hero_sub_keys:'کیز', hero_sub_control:'کنٹرول', stat_apps:'ایپلیکیشنز', stat_keys:'API کیز', stat_users:'صارفین / لائسنس', identity:'شناخت', identity_hint:'کاپی کے لیے کلک کریں · سیکریٹ چھپا ہے', live_stream:'لائیو کی سٹریم', owner_id:'مالک شناخت', secret_id:'سیکریٹ شناخت', version:'ورژن', app_id:'ایپ آئی ڈی', apps_title:'ایپلیکیشنز', apps_sub:'آپ کی ایپ خود بن گئی — پنسل سے نام تبدیل کریں۔', keys_title:'API کیز', keys_sub:'اپنی ضرورت کے مطابق کی بنائیں — مستقل یا دن/سال۔', gen_key:'+ جنریٹ', show:'دکھائیں', hide:'چھپائیں', copy:'کاپی', users_title:'صارفین اور لائسنس', users_sub:'صارف یا لائسنس کی بنائیں — HWID ری سیٹ، تجدید، مستقل وقت، پابندی۔ سب آپ کے کنٹرول میں۔', app:'ایپ', new_user:'+ نیا صارف', new_license:'+ لائسنس کی', local_storage:'● لوکل سٹوریج', sqlite_live:'● SQLite لائیو', th_username:'صارف', th_type:'قسم', th_license:'لائسنس کی', th_expires:'میعاد', th_hwid:'HWID', th_status:'حالت', th_device:'ڈیوائس', th_actions:'اعمال', no_users:'ابھی کوئی صارف / لائسنس نہیں — پہلا بنانے کے لیے بٹن دبائیں۔', settings_title:'ترتیبات', settings_sub:'زبان، تھیم اور رنگ — سب آپ کے کنٹرول میں۔', lang_title:'زبان', lang_sub:'پورے پینل کے لیے زبان منتخب کریں۔', theme_title:'تھیم', theme_sub:'پہلے سے بنی بیک گراؤنڈ چنیں یا اپنی تصویر اپ لوڈ کریں۔', color_title:'رنگ', color_sub:'پورے پینل کا رنگ تبدیل کریں۔', upload_bg:'تصویر اپ لوڈ', clear_bg:'تصویر ہٹائیں', reset_all:'تمام ترتیبات ری سیٹ', saved:'ترتیبات محفوظ ہو گئیں۔', install_title:'انسٹالیشن', install_sub:'اپنی ایپ، بوٹ یا سافٹ ویئر کو ISHU AUTH سے جوڑیں — کوئی پیکج نہیں۔', how_works:'یہ کیسے کام کرتا ہے', download_pkg:'پیکیج ڈاؤن لوڈ', tab_py:'پائیتھن', tab_cs:'C#', tab_js:'جاوا اسکرپٹ', tab_gen:'جنرک / HTTP', create:'بنائیں', cancel:'منسوخ', created_user:'صارف بنا', created_license:'لائسنس کی بنی', renamed:'نام تبدیل ہوا', key_rotated:'کی گھومائی گئی — نیا HWID لائیو', key_revoked:'کی منسوخ', key_deleted:'کی حذف', hwid_reset:'HWID ری سیٹ — صارف دوبارہ لاگ ان کر سکتا ہے', renewed:'تجدید ہوئی', banned:'صارف پر پابندی', unbanned:'پابندی ہٹی', deleted:'حذف ہوا', hwid_reset2:'HWID ری سیٹ مکمل', need_app:'پہلے ایک ایپ منتخب کریں', user_exists:'صارف پہلے سے موجود ہے۔', invalid:'ناکام', server_unreachable:'سرور ناقابل رسائی', system_online:'سسٹم آن لائن', username:'صارف نام', password:'پاس ورڈ', login:'لاگ ان', no_account:'اکاؤنٹ نہیں؟', register:'رجسٹر', create_account:'اکاؤنٹ بنائیں', choose_username:'صارف نام منتخب کریں', create_password:'پاس ورڈ بنائیں', already_registered:'پہلے ہی رجسٹرڈ؟', welcome_back:'خوش آمدید، ', account_created:'اکاؤنٹ بنا — خوش آمدید ', copyright:'© v1.0 · ISHU کاپی رائٹ' },
    bn: { loading_app:'আপনার অ্যাপ লোড হচ্ছে…', upload_hint:'গ্যালারি, PC বা ফোন থেকে যেকোনো ছবি বাছুন — সেটি ব্যাকগ্রাউন্ড হবে।', owner:'মালিক', key_type:'কী ধরণ', basic_key:'বেসিক কী', live_key:'লাইভ কী (অটো-HWID)', owner_key:'মালিক কী', duration:'মেয়াদ', attach_app:'অ্যাপে যুক্ত করুন (ঐচ্ছিক)', global:'— গ্লোবাল —', copy:'কপি', rotate:'রোটেট', revoke:'বাতিল', delete:'মুছুন', forever:'চিরকাল', done:'সমাপ্ত', gen_key_title:'এপিআই কী তৈরি', key_generated:'কী তৈরি হয়েছে', key_generated_title:'কী তৈরি হয়েছে', confirm_revoke:'কী বাতিল করবেন?', confirm_del_key:'কী স্থায়ীভাবে মুছবেন?', confirm_del_app:'অ্যাপ ও এর সব কী/ব্যবহারকারী মুছবেন? নতুন ডিফল্ট অ্যাপ তৈরি হবে।', app_deleted:'অ্যাপ মুছে ফেলা হয়েছে — নতুন ডিফল্ট অ্যাপ তৈরি হয়েছে', new_user_title:'নতুন ব্যবহারকারী', new_license_title:'নতুন লাইসেন্স কী', label_opt:'লেবেল (ঐচ্ছিক)', hwid_opt:'HWID (ঐচ্ছিক)', hwid_lock:'HWID লক', hwid_lock_hint:'শুধু ১ ডিভাইসে চলবে (প্রথম লগইন ডিভাইসে লক)', leave_empty:'খালি রাখুন', expiry:'মেয়াদ — প্রিসেট বা সঠিক তারিখ', expiry_hint:'প্রিসেট বাছুন বা ক্যালেন্डার থেকে তারিখ — আজ থেকে শুরু।', renew_title:'নবায়ন / সম্প্রসারণ', renew:'নবায়ন', ban:'নিষিদ্ধ', unban:'নিষেধ তুলুন', live:'লাইভ', till:'পর্যন্ত', nav_dashboard:'ড্যাশবোর্ড', nav_users:'ব্যবহারকারী তৈরি', nav_apps:'অ্যাপ্লিকেশন', nav_keys:'এপিআই কী', nav_settings:'সেটিংস', nav_install:'ইনস্টলেশন', sign_out:'সাইন আউট', hero_sub_app:'অ্যাপ', hero_sub_keys:'কী', hero_sub_control:'নিয়ন্ত্রণ', stat_apps:'অ্যাপ্লিকেশন', stat_keys:'এপিআই কী', stat_users:'ব্যবহারকারী / লাইসেন্স', identity:'পরিচয়', identity_hint:'কপি করতে ক্লিক করুন · সিক্রেট লুকানো', live_stream:'লাইভ কী স্ট্রিম', owner_id:'মালিক আইডি', secret_id:'সিক্রেট আইডি', version:'সংস্করণ', app_id:'অ্যাপ আইডি', apps_title:'অ্যাপ্লিকেশন', apps_sub:'আপনার অ্যাপ অটো তৈরি — পেন্সিল দিয়ে নাম বদলান।', keys_title:'এপিআই কী', keys_sub:'আপনার প্রয়োজন অনুযায়ী কী তৈরি করুন — স্থায়ী বা দিন/বছর।', gen_key:'+ তৈরি', show:'দেখান', hide:'লুকান', copy:'কপি', users_title:'ব্যবহারকারী ও লাইসেন্স', users_sub:'ব্যবহারকারী বা লাইসেন্স কী তৈরি — HWID রিসেট, নবায়ন, স্থায়ী সময়, নিষিদ্ধ। সব নিয়ন্ত্রণ আপনার।', app:'অ্যাপ', new_user:'+ নতুন ব্যবহারকারী', new_license:'+ লাইসেন্স কী', local_storage:'● লোকাল স্টোরেজ', sqlite_live:'● SQLite লাইভ', th_username:'ব্যবহারকারী', th_type:'ধরন', th_license:'লাইসেন্স কী', th_expires:'মেয়াদ', th_hwid:'HWID', th_status:'স্থিতি', th_device:'ডিভাইস', th_actions:'ক্রিয়া', no_users:'এখনো কোনো ব্যবহারকারী / লাইসেন্স নেই — প্রথমটি তৈরি করতে বাটন চাপুন।', settings_title:'সেটিংস', settings_sub:'ভাষা, থিম ও রং — সব আপনার নিয়ন্ত্রণে।', lang_title:'ভাষা', lang_sub:'পুরো প্যানেলের জন্য ভাষা বাছুন।', theme_title:'থিম', theme_sub:'প্রিসেট ব্যাকগ্রাউন্ড বাছুন বা নিজের ছবি আপলোড করুন।', color_title:'রং', color_sub:'পুরো প্যানেলের রং বদলান।', upload_bg:'ছবি আপলোড', clear_bg:'ছবি মুছুন', reset_all:'সব সেটিংস রিসেট', saved:'সেটিংস সেভ হয়েছে।', install_title:'ইনস্টলেশন', install_sub:'আপনার অ্যাপ, বট বা সফটওয়্যার ISHU AUTH-এ যুক্ত করুন — কোনো প্যাকেজ নেই।', how_works:'কীভাবে কাজ করে', download_pkg:'প্যাকেজ ডাউনলোড', tab_py:'পাইথন', tab_cs:'সি#', tab_js:'জাভাস্ক্রিপ্ট', tab_gen:'জেনেরিক / HTTP', create:'তৈরি', cancel:'বাতিল', created_user:'ব্যবহারকারী তৈরি', created_license:'লাইসেন্স কী তৈরি', renamed:'নাম বদলেছে', key_rotated:'কী ঘোরানো হয়েছে — নতুন HWID লাইভ', key_revoked:'কী বাতিল', key_deleted:'কী মুছে ফেলা', hwid_reset:'HWID রিসেট — ব্যবহারকারী আবার লগইন করতে পারবে', renewed:'নবায়ন হয়েছে', banned:'ব্যবহারকারী নিষিদ্ধ', unbanned:'নিষেধ উঠেছে', deleted:'মুছে ফেলা হয়েছে', hwid_reset2:'HWID রিসেট সম্পন্ন', need_app:'প্রথমে একটি অ্যাপ বাছুন', user_exists:'ব্যবহারকারী আগে থেকেই আছে।', invalid:'ব্যর্থ', server_unreachable:'সার্ভার অপ্রাপ্য', system_online:'সিস্টেম অনলাইন', username:'ব্যবহারকারীর নাম', password:'পাসওয়ার্ড', login:'লগইন', no_account:'খাতা নেই?', register:'নিবন্ধন', create_account:'খাতা তৈরি', choose_username:'ব্যবহারকারীর নাম বাছুন', create_password:'পাসওয়ার্ড তৈরি', already_registered:'আগে থেকেই নিবন্ধিত?', welcome_back:'ফিরে স্বাগতম, ', account_created:'খাতা তৈরি — স্বাগতম ', copyright:'© v1.0 · ISHU কপিরাইট' },
    ta: { loading_app:'உங்கள் ஆப் ஏற்றப்படுகிறது…', upload_hint:'கேலரி, PC அல்லது ஃபோனிலிருந்து எந்தப் படத்தையும் தேர்ந்தெடுக்கவும் — அது பின்னணியாக மாறும்.', owner:'உரிமையாளர்', key_type:'கீ வகை', basic_key:'அடிப்படை கீ', live_key:'லைவ் கீ (ஆட்டோ-HWID)', owner_key:'உரிமையாளர் கீ', duration:'காலம்', attach_app:'ஆப்புடன் இணைக்க (விருப்பம்)', global:'— உலகம் —', copy:'நகலெடு', rotate:'சுழற்று', revoke:'ரத்து', delete:'நீக்கு', forever:'எப்போதும்', done:'முடிந்தது', gen_key_title:'API கீ உருவாக்கு', key_generated:'கீ உருவாக்கப்பட்டது', key_generated_title:'கீ உருவாக்கப்பட்டது', confirm_revoke:'இந்த கீயை ரத்து செய்யவா?', confirm_del_key:'இந்த கீயை நிரந்தரமாக நீக்கவா?', confirm_del_app:'ஆப்பையும் அதன் கீகள்/பயனர்களையும் நீக்கவா? புதிய இயல்பு ஆப் உருவாகும்.', app_deleted:'ஆப் நீக்கப்பட்டது — புதிய இயல்பு ஆப் உருவானது', new_user_title:'புதிய பயனர்', new_license_title:'புதிய உரிம் கீ', label_opt:'லேபிள் (விருப்பம்)', hwid_opt:'HWID (விருப்பம்)', hwid_lock:'HWID பூட்டு', hwid_lock_hint:'1 சாதனத்தில் மட்டும் (முதல் உள்நுழைவு சாதனத்தில் பூட்டு)', leave_empty:'காலியாக விடு', expiry:'காலாவதி — முன்செய்யப்பட்டது அல்லது தேதி', expiry_hint:'முன்செய்யப்பட்டதை தேர்ந்தெடுக்கவும் அல்லது காலெண்டரிலிருந்து தேதி — இன்று முதல்.', renew_title:'புதுப்பி / நீட்டி', renew:'புதுப்பி', ban:'தடை', unban:'தடை நீக்கு', live:'லைவ்', till:'வரை', nav_dashboard:'டாஷ்போர்டு', nav_users:'பயனர்களை உருவாக்கு', nav_apps:'பயன்பாடுகள்', nav_keys:'API கீகள்', nav_settings:'அமைப்புகள்', nav_install:'நிறுவல்', sign_out:'வெளியேறு', hero_sub_app:'ஆப்', hero_sub_keys:'கீகள்', hero_sub_control:'கட்டுப்பாடு', stat_apps:'பயன்பாடுகள்', stat_keys:'API கீகள்', stat_users:'பயனர்கள் / உரிமம்', identity:'அடையாளம்', identity_hint:'நகலெடுக்க கிளிக் செய்க · ரகசியம் மறைந்துள்ளது', live_stream:'லைவ் கீ ஸ்ட்ரீம்', owner_id:'உரிமையாளர் ஐடி', secret_id:'ரகசிய ஐடி', version:'பதிப்பு', app_id:'ஆப் ஐடி', apps_title:'பயன்பாடுகள்', apps_sub:'உங்கள் ஆப் தானாக உருவாகியது — பென்சிலால் பெயர் மாற்றவும்.', keys_title:'API கீகள்', keys_sub:'உங்கள் தேவைக்கேற்ப கீ உருவாக்கவும் — நிரந்தரம் அல்லது நாள்/ஆண்டு.', gen_key:'+ உருவாக்கு', show:'காட்டு', hide:'மறை', copy:'நகலெடு', users_title:'பயனர்கள் & உரிமங்கள்', users_sub:'பயனர் அல்லது உரிமக் கீ உருவாக்கு — HWID மீட்டமை, புதுப்பி, நிரந்தர நேரம், தடை. எல்லாமே உங்கள் கட்டுப்பாட்டில்.', app:'ஆப்', new_user:'+ புதிய பயனர்', new_license:'+ உரிமக் கீ', local_storage:'● உள்ளூர் சேமிப்பு', sqlite_live:'● SQLite லைவ்', th_username:'பயனர்', th_type:'வகை', th_license:'உரிமக் கீ', th_expires:'காலாவதி', th_hwid:'HWID', th_status:'நிலை', th_device:'சாதனம்', th_actions:'செயல்கள்', no_users:'இன்னும் பயனர் / உரிமம் இல்லை — முதலில் உருவாக்க பொத்தான் அழுத்தவும்.', settings_title:'அமைப்புகள்', settings_sub:'மொழி, தீம், நிறம் — அனைத்தும் உங்கள் கட்டுப்பாட்டில்.', lang_title:'மொழி', lang_sub:'முழு பேனலுக்கான மொழியைத் தேர்ந்தெடுக்கவும்.', theme_title:'தீம்', theme_sub:'முன்செய்யப்பட்ட பின்னணி தேர்ந்தெடுக்கவும் அல்லது படம் பதிவேற்றவும்.', color_title:'நிறம்', color_sub:'முழு பேனலின் நிறத்தை மாற்றவும்.', upload_bg:'படம் பதிவேற்று', clear_bg:'படத்தை அழி', reset_all:'எல்லா அமைப்புகளையும் மீட்டமை', saved:'அமைப்புகள் சேமிக்கப்பட்டன.', install_title:'நிறுவல்', install_sub:'உங்கள் ஆப், போட் அல்லது மென்பொருளை ISHU AUTH-உடன் இணைக்கவும் — பேக்கேஜ் இல்லை.', how_works:'இது எப்படி வேலை செய்கிறது', download_pkg:'தொகுப்பை பதிவிறக்கு', tab_py:'பைதான்', tab_cs:'சி#', tab_js:'ஜாவாஸ்கிரிப்ட்', tab_gen:'ஜெனரிக் / HTTP', create:'உருவாக்கு', cancel:'ரத்து', created_user:'பயனர் உருவாக்கப்பட்டது', created_license:'உரிமக் கீ உருவாக்கப்பட்டது', renamed:'பெயர் மாற்றப்பட்டது', key_rotated:'கீ சுழற்றப்பட்டது — புதிய HWID லைவ்', key_revoked:'கீ ரத்து', key_deleted:'கீ நீக்கப்பட்டது', hwid_reset:'HWID மீட்டமை — பயனர் மீண்டும் உள்நுழையலாம்', renewed:'புதுப்பிக்கப்பட்டது', banned:'பயனர் தடைசெய்யப்பட்டது', unbanned:'தடை நீக்கப்பட்டது', deleted:'நீக்கப்பட்டது', hwid_reset2:'HWID மீட்டமை முடிந்தது', need_app:'முதலில் ஒரு ஆப் தேர்ந்தெடுக்கவும்', user_exists:'பயனர் ஏற்கனவே உள்ளது.', invalid:'தோல்வி', server_unreachable:'சேவையகம் எட்டவில்லை', system_online:'அமைப்பு ஆன்லைன்', username:'பயனர் பெயர்', password:'கடவுச்சொல்', login:'உள்நுழை', no_account:'கணக்கு இல்லையா?', register:'பதிவு', create_account:'கணக்கு உருவாக்கு', choose_username:'பயனர் பெயர் தேர்ந்தெடுக்கவும்', create_password:'கடவுச்சொல் உருவாக்கு', already_registered:'ஏற்கனவே பதிவு செய்தீர்களா?', welcome_back:'மீண்டும் வரவேற்கிறோம், ', account_created:'கணக்கு உருவாக்கப்பட்டது — வரவேற்பு ', copyright:'© v1.0 · ISHU பதிப்புரிமை' },
    te: { loading_app:'మీ యాప్ లోడ్ అవుతోంది…', upload_hint:'గ్యాలరీ, PC లేదా ఫోన్ నుండి ఏదైనా చిత్రాన్ని ఎంచుకోండి — అది నేపథ్యమవుతుంది.', owner:'యజమాని', key_type:'కీ రకం', basic_key:'బేసిక్ కీ', live_key:'లైవ్ కీ (ఆటో-HWID)', owner_key:'యజమాని కీ', duration:'వ్యవధి', attach_app:'యాప్కు జోడించు (ఐచ్ఛికం)', global:'— గ్లోబల్ —', copy:'కాపీ', rotate:'రొటేట్', revoke:'రద్దు', delete:'తొలగించు', forever:'ఎప్పటికీ', done:'పూర్తి', gen_key_title:'API కీ సృష్టించు', key_generated:'కీ సృష్టించబడింది', key_generated_title:'కీ సృష్టించబడింది', confirm_revoke:'ఈ కీని రద్దు చేయాలా?', confirm_del_key:'ఈ కీని శాశ్వతంగా తొలగించాలా?', confirm_del_app:'యాప్ మరియు దాని కీలు/వినియోగదారులను తొలగించాలా? కొత్త డిఫాల్ట్ యాప్ ఏర్పడుతుంది.', app_deleted:'యాప్ తొలగించబడింది — కొత్త డిఫాల్ట్ యాప్ ఏర్పడింది', new_user_title:'కొత్త వినియోగదారు', new_license_title:'కొత్త లైసెన్స్ కీ', label_opt:'లేబుల్ (ఐచ్ఛికం)', hwid_opt:'HWID (ఐచ్ఛికం)', hwid_lock:'HWID లాక్', hwid_lock_hint:'1 పరికరంలో మాత్రమే (మొదటి లాగిన్ పరికరంలో లాక్)', leave_empty:'ఖాలీగా ఉంచండి', expiry:'గడువు — ప్రీసెట్ లేదా ఖచ్చితమైన తేదీ', expiry_hint:'ప్రీసెట్ ఎంచుకోండి లేదా క్యాలెండర్ నుండి తేదీ — ఈ రోజు నుండి ప్రారంభమవుతుంది.', renew_title:'పునరుద్ధరించు / పొడిగించు', renew:'పునరుద్ధరించు', ban:'నిషేధం', unban:'నిషేధం తొలగించు', live:'లైవ్', till:'వరకు', nav_dashboard:'డాష్బోర్డ్', nav_users:'వినియోగదారులను సృష్టించండి', nav_apps:'అప్లికేషన్లు', nav_keys:'API కీలు', nav_settings:'సెట్టింగులు', nav_install:'ఇన్స్టాలేషన్', sign_out:'సైన్ అవుట్', hero_sub_app:'యాప్', hero_sub_keys:'కీలు', hero_sub_control:'నియంత్రణ', stat_apps:'అప్లికేషన్లు', stat_keys:'API కీలు', stat_users:'వినియోగదారులు / లైసెన్స్', identity:'గుర్తింపు', identity_hint:'కాపీ చేయడానికి క్లిక్ చేయండి · రహస్యం దాచబడింది', live_stream:'లైవ్ కీ స్ట్రీమ్', owner_id:'యజమాని ఐడి', secret_id:'రహస్య ఐడి', version:'వెర్షన్', app_id:'యాప్ ఐడి', apps_title:'అప్లికేషన్లు', apps_sub:'మీ యాప్ స్వయంచాలకంగా సృష్టించబడింది — పెన్సిల్‌తో పేరు మార్చండి.', keys_title:'API కీలు', keys_sub:'మీ అవసరానికి తగిన కీని సృష్టించండి — శాశ్వతం లేదా రోజు/సంవత్సరం.', gen_key:'+ సృష్టించు', show:'చూపించు', hide:'దాచు', copy:'కాపీ', users_title:'వినియోగదారులు & లైసెన్సులు', users_sub:'వినియోగదారు లేదా లైసెన్స్ కీ సృష్టించండి — HWID రీసెట్, పునరుద్ధరణ, శాశ్వత సమయం, నిషేధం. అంతా మీ నియంత్రణలో.', app:'యాప్', new_user:'+ కొత్త వినియోగదారు', new_license:'+ లైసెన్స్ కీ', local_storage:'● లోకల్ స్టోరేజ్', sqlite_live:'● SQLite లైవ్', th_username:'వినియోగదారు', th_type:'రకం', th_license:'లైసెన్స్ కీ', th_expires:'గడువు', th_hwid:'HWID', th_status:'స్థితి', th_device:'పరికరం', th_actions:'చర్యలు', no_users:'ఇంకా వినియోగదారు/లైసెన్స్ లేదు — మొదటిదాన్ని సృష్టించడానికి బటన్ నొక్కండి.', settings_title:'సెట్టింగులు', settings_sub:'భాష, థీమ్, రంగు — అన్నీ మీ నియంత్రణలో.', lang_title:'భాష', lang_sub:'మొత్తం ప్యానెల్‌కు భాషను ఎంచుకోండి.', theme_title:'థీమ్', theme_sub:'ముందుగా రూపొందించిన నేపథ్యాన్ని ఎంచుకోండి లేదా చిత్రాన్ని అప్‌లోడ్ చేయండి.', color_title:'రంగు', color_sub:'మొత్తం ప్యానెల్ రంగును మార్చండి.', upload_bg:'చిత్రం అప్‌లోడ్', clear_bg:'చిత్రం తొలగించు', reset_all:'అన్ని సెట్టింగులను రీసెట్', saved:'సెట్టింగులు సేవ్ అయ్యాయి.', install_title:'ఇన్‌స్టాలేషన్', install_sub:'మీ యాప్, బోట్ లేదా సాఫ్ట్‌వేర్‌ను ISHU AUTHతో కనెక్ట్ చేయండి — ప్యాకేజీ లేదు.', how_works:'ఇది ఎలా పని చేస్తుంది', download_pkg:'ప్యాకేజీ డౌన్‌లోడ్', tab_py:'పైథాన్', tab_cs:'సి#', tab_js:'జావాస్క్రిప్ట్', tab_gen:'జెనరిక్ / HTTP', create:'సృష్టించు', cancel:'రద్దు', created_user:'వినియోగదారు సృష్టించబడ్డాడు', created_license:'లైసెన్స్ కీ సృష్టించబడింది', renamed:'పేరు మార్చబడింది', key_rotated:'కీ తిప్పబడింది — కొత్త HWID లైవ్', key_revoked:'కీ రద్దు', key_deleted:'కీ తొలగించబడింది', hwid_reset:'HWID రీసెట్ — వినియోగదారు మళ్లీ లాగిన్ చేయవచ్చు', renewed:'పునరుద్ధరించబడింది', banned:'వినియోగదారు నిషేధించబడ్డాడు', unbanned:'నిషేధం తీసివేయబడింది', deleted:'తొలగించబడింది', hwid_reset2:'HWID రీసెట్ పూర్తయింది', need_app:'ముందుగా యాప్ ఎంచుకోండి', user_exists:'వినియోగదారు ఇప్పటికే ఉన్నారు.', invalid:'విఫలమైంది', server_unreachable:'సర్వర్ అందుబాటులో లేదు', system_online:'సిస్టమ్ ఆన్‌లైన్', username:'వినియోగదారు పేరు', password:'పాస్‌వర్డ్', login:'లాగిన్', no_account:'ఖాతా లేదా?', register:'నమోదు', create_account:'ఖాతా సృష్టించండి', choose_username:'వినియోగదారు పేరు ఎంచుకోండి', create_password:'పాస్‌వర్డ్ సృష్టించండి', already_registered:'ఇప్పటికే నమోదు అయ్యారా?', welcome_back:'తిరిగి స్వాగతం, ', account_created:'ఖాతా సృష్టించబడింది — స్వాగతం ', copyright:'© v1.0 · ISHU కాపీరైట్' }
  };
  // ---- Marathi (primary nav/titles, rest falls back to English) ----
  L.mr = { nav_dashboard:'डॅशबोर्ड', nav_users:'वापरकर्ते तयार करा', nav_apps:'अर्ज', nav_keys:'API की', nav_settings:'सेटिंग्ज', nav_install:'स्थापना', sign_out:'साइन आउट', apps_title:'अर्ज', keys_title:'API की', users_title:'वापरकर्ते आणि परवाने', settings_title:'सेटिंग्ज', theme_title:'थीम', color_title:'रंग', lang_title:'भाषा', install_title:'स्थापना', download_pkg:'पॅकेज डाउनलोड', download_bot:'बॉट सोर्स डाउनलोड' };
  // ---- Gujarati ----
  L.gu = { nav_dashboard:'ડેશબોર્ડ', nav_users:'વપરાશકર્તાઓ બનાવો', nav_apps:'એપ્લિકેશન્સ', nav_keys:'API કીઓ', nav_settings:'સેટિંગ્સ', nav_install:'ઇન્સ્ટોલેશન', sign_out:'સાઇન આઉટ', apps_title:'એપ્લિકેશન્સ', keys_title:'API કીઓ', users_title:'વપરાશકર્તાઓ અને લાયસન્સ', settings_title:'સેટિંગ્સ', theme_title:'થીમ', color_title:'રંગ', lang_title:'ભાષા', install_title:'ઇન્સ્ટોલેશન', download_pkg:'પેકેજ ડાઉનલોડ', download_bot:'બોટ સોર્સ ડાઉનલોડ' };
  // ---- Punjabi ----
  L.pa = { nav_dashboard:'ਡੈਸ਼ਬੋਰਡ', nav_users:'ਵਰਤੋਂਕਾਰ ਬਣਾਓ', nav_apps:'ਐਪਲੀਕੇਸ਼ਨਾਂ', nav_keys:'API ਕੁੰਜੀਆਂ', nav_settings:'ਸੈਟਿੰਗਾਂ', nav_install:'ਇੰਸਟਾਲੇਸ਼ਨ', sign_out:'ਸਾਈਨ ਆਊਟ', apps_title:'ਐਪਲੀਕੇਸ਼ਨਾਂ', keys_title:'API ਕੁੰਜੀਆਂ', users_title:'ਵਰਤੋਂਕਾਰ ਅਤੇ ਲਾਇਸੈਂਸ', settings_title:'ਸੈਟਿੰਗਾਂ', theme_title:'ਥੀਮ', color_title:'ਰੰਗ', lang_title:'ਭਾਸ਼ਾ', install_title:'ਇੰਸਟਾਲੇਸ਼ਨ', download_pkg:'ਪੈਕੇਜ ਡਾਊਨਲੋਡ', download_bot:'ਬੋਟ ਸੋਰਸ ਡਾਊਨਲੋਡ' };
  // ---- Malayalam ----
  L.ml = { nav_dashboard:'ഡാഷ്ബോർഡ്', nav_users:'ഉപയോക്താക്കൾ സൃഷ്ടിക്കുക', nav_apps:'ആപ്ലിക്കേഷനുകൾ', nav_keys:'API കീകൾ', nav_settings:'ക്രമീകരണങ്ങൾ', nav_install:'ഇൻസ്റ്റാളേഷൻ', sign_out:'സൈൻ ഔട്ട്', apps_title:'ആപ്ലിക്കേഷനുകൾ', keys_title:'API കീകൾ', users_title:'ഉപയോക്താക്കളും ലൈസൻസുകളും', settings_title:'ക്രമീകരണങ്ങൾ', theme_title:'തീം', color_title:'നിറം', lang_title:'ഭാഷ', install_title:'ഇൻസ്റ്റാളേഷൻ', download_pkg:'പാക്കേജ് ഡൗൺലോഡ്', download_bot:'ബോട്ട് സോഴ്സ് ഡൗൺലോഡ്' };
  // ---- Kannada ----
  L.kn = { nav_dashboard:'ಡ್ಯಾಶ್ಬೋರ್ಡ್', nav_users:'ಬಳಕೆದಾರರನ್ನು ರಚಿಸಿ', nav_apps:'ಅಪ್ಲಿಕೇಶನ್ಗಳು', nav_keys:'API ಕೀಗಳು', nav_settings:'ಸೆಟ್ಟಿಂಗ್ಗಳು', nav_install:'ಅನುಸ್ಥಾಪನೆ', sign_out:'ಸೈನ್ ಔಟ್', apps_title:'ಅಪ್ಲಿಕೇಶನ್ಗಳು', keys_title:'API ಕೀಗಳು', users_title:'ಬಳಕೆದಾರರು ಮತ್ತು ಪರವಾನಗಿಗಳು', settings_title:'ಸೆಟ್ಟಿಂಗ್ಗಳು', theme_title:'ಥೀಮ್', color_title:'ಬಣ್ಣ', lang_title:'ಭಾಷೆ', install_title:'ಅನುಸ್ಥಾಪನೆ', download_pkg:'ಪ್ಯಾಕೇಜ್ ಡೌನ್‌ಲೋಡ್', download_bot:'ಬಾಟ್ ಸೋರ್ಸ್ ಡೌನ್‌ಲೋಡ್' };
  // ---- Odia ----
  L.or = { nav_dashboard:'ଡ୍ୟାଶବୋର୍ଡ', nav_users:'ବ୍ୟବହାରକାରୀ ସୃଷ୍ଟି କରନ୍ତୁ', nav_apps:'ଆପ୍ଲିକେସନ୍', nav_keys:'API କି', nav_settings:'ସେଟିଂ', nav_install:'ସ୍ଥାପନା', sign_out:'ସାଇନ୍ ଆଉଟ୍', apps_title:'ଆପ୍ଲିକେସନ୍', keys_title:'API କି', users_title:'ବ୍ୟବହାରକାରୀ ଓ ଲାଇସେନ୍ସ', settings_title:'ସେଟିଂ', theme_title:'ଥିମ୍', color_title:'ରଙ୍ଗ', lang_title:'ଭାଷା', install_title:'ସ୍ଥାପନା', download_pkg:'ପ୍ୟାକେଜ୍ ଡାଉନଲୋଡ୍', download_bot:'ବଟ ସୋର୍ସ ଡାଉନଲୋଡ୍' };
  // ---- Assamese ----
  L.as = { nav_dashboard:'ডেশ্ববোৰ্ড', nav_users:'ব্যৱহাৰকাৰী সৃষ্টি কৰক', nav_apps:'এপ্লিকেচনসমূহ', nav_keys:'API কি', nav_settings:'ছেটিং', nav_install:'স্থাপন', sign_out:'ছাইন আউট', apps_title:'এপ্লিকেচনসমূহ', keys_title:'API কি', users_title:'ব্যৱহাৰকাৰী আৰু লাইচেঞ্চ', settings_title:'ছেটিং', theme_title:'থিম', color_title:'ৰং', lang_title:'ভাষা', install_title:'স্থাপন', download_pkg:'পেকেজ ডাউনলোড', download_bot:'বট সোর্স ডাউনলোড' };

  // ---- login-page + create-app keys (all 12 languages) ----
  var _login={
    hi:{new_app:'+ नया ऐप',new_app_name:'ऐप का नाम',username:'यूज़रनेम',password:'पासवर्ड',login:'लॉगिन',no_account:'अकाउंट नहीं?',register:'रजिस्टर',create_account:'अकाउंट बनाएं',choose_username:'यूज़रनेम चुनें',create_password:'पासवर्ड बनाएं',already_registered:'पहले से रजिस्टर्ड?',continue_google:'Google से जारी रखें',or_use:'या लॉगिन करें',google_setup:'Google लॉगिन सेट नहीं है — index.html में अपना Google Client ID (GOOGLE_CLIENT_ID) डालें।',google_offline:'कोई इंटरनेट नहीं — Google साइन-इन के लिए कनेक्शन चाहिए।',google_failed:'Google साइन-इन विफल। फिर से कोशिश करें।',google_blocked:'इस पते पर Google लॉगिन ब्लॉक है — Google Cloud Console (OAuth Client ID → Authorized JavaScript origins) में यह URL जोड़ें, या ऊपर Username/Password से लॉगिन करें — वह हर जगह चलता है।',g_alt:'Google ब्लॉक है? ऊपर Username/Password यूज़ करो — हर जगह चलता है।'},
    ur:{new_app:'+ نیا ایپ',new_app_name:'ایپ کا نام',username:'صارف نام',password:'پاس ورڈ',login:'لاگ ان',no_account:'اکاؤنٹ نہیں?',register:'رجسٹر',create_account:'اکاؤنٹ بنائیں',choose_username:'صارف نام چنیں',create_password:'پاس ورڈ بنائیں',already_registered:'پہلے سے رجسٹرڈ?'},
    bn:{new_app:'+ নতুন অ্যাপ',new_app_name:'অ্যাপের নাম',username:'ব্যবহারকারীর নাম',password:'পাসওয়ার্ড',login:'লগইন',no_account:'অ্যাকাউন্ট নেই?',register:'নিবন্ধন',create_account:'অ্যাকাউন্ট তৈরি',choose_username:'ব্যবহারকারীর নাম বাছাই',create_password:'পাসওয়ার্ড তৈরি',already_registered:'ইতিমধ্যে নিবন্ধিত?'},
    ta:{new_app:'+ புதிய ஆப்',new_app_name:'ஆப் பெயர்',username:'பயனர் பெயர்',password:'கடவுச்சொல்',login:'உள்நுழைவு',no_account:'கணக்கு இல்லை?',register:'பதிவு',create_account:'கணக்கு உருவாக்கு',choose_username:'பயனர் பெயரைத் தேர்ந்தெடு',create_password:'கடவுச்சொல்லை உருவாக்கு',already_registered:'ஏற்கனவே பதிவு செய்துள்ளது?'},
    te:{new_app:'+ కొత్త యాప్',new_app_name:'యాప్ పేరు',username:'వినియోగదారుని పేరు',password:'పాస్‌వర్డ్',login:'లాగిన్',no_account:'ఖాతా లేదా?',register:'రిజిస్టర్',create_account:'ఖాతా సృష్టించు',choose_username:'వినియోగదారుని పేరు ఎంచుకోండి',create_password:'పాస్‌వర్డ్ సృష్టించు',already_registered:'ఇప్పటికే నమోదైందా?'},
    mr:{new_app:'+ नवीन अॅप',new_app_name:'अॅपचे नाव',username:'वापरकर्ता नाव',password:'पासवर्ड',login:'लॉगिन',no_account:'अकाउंट नाही?',register:'नोंदणी',create_account:'अकाउंट तयार करा',choose_username:'वापरकर्ता नाव निवडा',create_password:'पासवर्ड तयार करा',already_registered:'आधीपासून नोंदणीकृत?'},
    gu:{new_app:'+ નવી એપ્લિકેશન',new_app_name:'એપનું નામ',username:'વપરાશકર્તા નામ',password:'પાસવર્ડ',login:'લોગિન',no_account:'એકાઉન્ટ નથી?',register:'રજિસ્ટર',create_account:'એકાઉન્ટ બનાવો',choose_username:'વપરાશકર્તા નામ પસંદ કરો',create_password:'પાસવર્ડ બનાવો',already_registered:'પહેલાથી રજિસ્ટર્ડ?'},
    pa:{new_app:'+ ਨਵੀਂ ਐਪ',new_app_name:'ਐਪ ਦਾ ਨਾਂ',username:'ਵਰਤੋਂਕਾਰ ਨਾਂ',password:'ਪਾਸਵਰਡ',login:'ਲੌਗਇਨ',no_account:'ਖਾਤਾ ਨਹੀਂ?',register:'ਰਜਿਸਟਰ',create_account:'ਖਾਤਾ ਬਣਾਓ',choose_username:'ਵਰਤੋਂਕਾਰ ਨਾਂ ਚੁਣੋ',create_password:'ਪਾਸਵਰਡ ਬਣਾਓ',already_registered:'ਪਹਿਲਾਂ ਤੋਂ ਰਜਿਸਟਰਡ?'},
    ml:{new_app:'+ പുതിയ ആപ്പ്',new_app_name:'ആപ്പ് നാമം',username:'ഉപയോക്തൃനാമം',password:'പാസ്‌വേർഡ്',login:'ലോഗിൻ',no_account:'അക്കൌണ്ട് ഇല്ല?',register:'രജിസ്റ്റർ',create_account:'അക്കൌണ്ട് സൃഷ്ടിക്കുക',choose_username:'ഉപയോക്തൃനാമം തിരഞ്ഞെടുക്കുക',create_password:'പാസ്‌വേർഡ് സൃഷ്ടിക്കുക',already_registered:'ഇതിനകം രജിസ്റ്റർ ചെയ്തു?'},
    kn:{new_app:'+ ಹೊಸ ಆಪ್',new_app_name:'ಆಪ್ ಹೆಸರು',username:'ಬಳಕೆದಾರ ಹೆಸರು',password:'ಪಾಸ್‌ವರ್ಡ್',login:'ಲಾಗಿನ್',no_account:'ಖಾತೆ ಇಲ್ಲ?',register:'ನೋಂದಣಿ',create_account:'ಖಾತೆ ರಚಿಸಿ',choose_username:'ಬಳಕೆದಾರ ಹೆಸರು ಆಯ್ಕೆಮಾಡಿ',create_password:'ಪಾಸ್‌ವರ್ಡ್ ರಚಿಸಿ',already_registered:'ಈಗಾಗಲೇ ನೋಂದಾಯಿಸಲಾಗಿದೆ?'},
    or:{new_app:'+ ନୂଆ ଆପ୍',new_app_name:'ଆପ୍ ନାମ',username:'ବ୍ୟବହାରକାରୀ ନାମ',password:'ପାସୱର୍ଡ',login:'ଲଗଇନ',no_account:'ଖାତା ନାହିଁ?',register:'ରେଜିଷ୍ଟର',create_account:'ଖାତା ସୃଷ୍ଟି କରନ୍ତୁ',choose_username:'ବ୍ୟବହାରକାରୀ ନାମ ବାଛନ୍ତୁ',create_password:'ପାସୱର୍ଡ ସୃଷ୍ଟି କରନ୍ତୁ',already_registered:'ପୂର୍ବରୁ ରେଜିଷ୍ଟର?'},
    as:{new_app:'+ নতুন এপ',new_app_name:'এপৰ নাম',username:'ব্যৱহাৰকাৰীৰ নাম',password:'পাছৱৰ্ড',login:'লগইন',no_account:'একাউণ্ট নাই?',register:'পজিচ্টাৰ',create_account:'একাউণ্ট সৃষ্টি কৰক',choose_username:'ব্যৱহাৰকাৰীৰ নাম বাছনি',create_password:'পাছৱৰ্ড সৃষ্টি কৰক',already_registered:'ইতিমধ্যে পজিচ্টাৰ?'}
  };
  Object.keys(_login).forEach(function(k){ L[k]=Object.assign(L[k]||{}, _login[k]); });
  L.hi = Object.assign(L.hi || {}, {
    update: 'अपडेट'
  });

  function get(lang, key) {
    const cat = L[lang] || {};
    return cat[key] !== undefined ? cat[key] : (base[key] !== undefined ? base[key] : key);
  }
  return { get };
})();

/* globals */
function Tr(lang, key) { return MSG.get(lang, key); }
function t(key) { return Tr(Settings.lang(), key); }

/* HTML-escape helper reuse from core (safe fallback) */
if (typeof window.esc !== 'function') {
  window.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}

window.Settings = Settings;
window.Tr = Tr;
window.t = t;

/* init: apply saved settings on load */
(function () {
  if (window.ISCORE) return; // avoid double on dynamic loads
  Settings.load();
  Settings.applyColor();
  Settings.applyTheme();
  Settings.applyLang();
})();
