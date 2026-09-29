# ISHU AUTH

ISHU AUTH **API Key + License Control Platform** by **ISHU**.
Unique "HEAT" theme layout with your own accent color.
Logo: ISHU · ISHU PREMIUM SECURITY LOCK

## Run (live DB mode — recommended)

```bash
python server.py

# → http://localhost:3000
```

This mode uses a **SQLite database** — your app/bot/C#/APK panel verifies against it live.
The panel's **Users** page automatically detects the server and switches to live DB mode.

> No-backend demo: `python -m http.server 3000` (data is saved in browser localStorage).

## Features

| Module | What it does |
| --- | --- |
| API Keys | Basic / Live / Owner keys + **duration** (permanent, 1/3/7/30/90 days, 1 year, or 1/3/6/12/24 hours). Every key has its own HWID. Master key is blurred by default, reveal with the eye icon. **Delete** supported. |
| Applications | **Default app auto-created** (named after your username) · rename with the SVG pencil · Owner ID (click to copy) · Secret ID (blur → reveal + copy) · HWID fingerprint per app |
| Create Users | Create a user + password or a license key · **HWID Lock** (1 device only — checkbox on/off) · **HWID reset** · renew · ban · expiry via **preset** (permanent/1–90 days/1 year/hours) or **calendar** exact date |
| Settings | **14 languages** (English + 13 Indian languages) · **Theme** (preset gradients or upload your own background image from gallery/PC/phone) · **Accent color** (orange/red/blue/green/purple/yellow/cyan/pink) · saved in localStorage (works on static hosts like GitHub Pages) |
| Package | C# SDK (`IshuAuth.cs` + `ISHU_Auth_API.cs`) — no package installation |
| Installation | C# / Python / JS / HTTP code — paste into your app, login starts |

## Connect your project (C# / APK / any app)

1. Run `python server.py` — on any PC or VPS (or locally).
2. Copy the **Master API Key** from the API Keys page and the **App ID** from the Applications page.
3. Create a **user + password** or a **license key** from the Users page (preset or calendar date).
4. Paste the code from the Installation page into your app — done.

**C# package (Installation page or `IshuAuth_Package.zip`)**
- **No NuGet/package needed** — .NET's built-in `System.Net.Http` is enough.
- Drop the single file `IshuAuth.cs` into your project → `Verify`, `ResetHwid`, `Renew`, `Ban`, `Create` are all ready. Works with Native AOT builds.

```csharp
var auth = new IshuAuth {
    Server = "http://YOUR-SERVER:3000",   // wherever server.py runs
    ApiKey = "ISHU_XXXX-....",
    AppId  = "APP-XXXXXX"
};
var r = await auth.Verify("user123", "pass123", "PC-FINGERPRINT");
if (r.Success) Console.WriteLine("LOGIN OK @ " + r.Expires);
else Console.WriteLine("DENIED: " + r.Message);
```

**Android / APK**
- Java/Kotlin: **no package needed**, use built-in `HttpURLConnection`.
- Flutter (if you use it): just the `http` package.

```java
URL url = new URL(server + "/api/verify");
HttpURLConnection c = (HttpURLConnection) url.openConnection();
c.setRequestMethod("POST"); c.setDoOutput(true);
c.setRequestProperty("Content-Type", "application/json");
// write: {"key":API_KEY,"appid":APP_ID,"user":u,"pass":p,"hwid":hwid}
```

### What "live control" means
Wherever the user logs in, the app sends `/api/verify` and the server checks:
- is the user/password or license key valid?
- **time finished** → deny (`subscription expired`) — or use exact calendar expiry
- **HWID changed** → deny (`hwid mismatch`) — reset from the panel or `ResetHwid`
- **banned** → deny (`user banned`)

From `IshuAuth.cs`: `Create` (new user/license), `ResetHwid`, `Renew (duration or exact date)`, `Ban` — all on the live SQLite DB.

## API (server.py)

```
POST /api/verify   {key, appid, user, pass, hwid}
→ {"success":true, "expires":"2026-12-31 23:59:59", ...}
   or {"success":false, "message":"invalid password / hwid mismatch / subscription expired / user banned"}

POST /api/license           {key, appid, username, password, type, duration, lock}  (+ optional "until": ms)
POST /api/generate          (same as /api/license — auto-key / bot use; no hwid)
POST /api/license/renew     {key, appid, id, duration}                              (+ optional "until": ms)
POST /api/license/resethwid {key, appid, id}
POST /api/license/ban       {key, appid, id, banned}
DELETE /api/license/<id>
```

> `lock` (1/0) — set when creating a user. **HWID Lock**: `1` = works only on the device that logs in first (mismatch is denied), `0` = any device. Default `1`.
> `duration` also accepts hours: `1h` `3h` `6h` `12h` `24h` (for auto-key expiry).
> `IshuAuth.Generate("24h")` → creates a license key with its own expiry — auto-expires after 24 hours, then generate the next one. Setup: an expiry-check loop in the app (see the comment in IshuAuth.cs).

## Automatic key generation (inside your app/bot)

Every license key has **its own expiry**. The simple pattern for auto keys:
```
1. Give the user a key (or create a fresh one via /api/generate)
2. On every login, verify:
     - ban/expired        -> DENIED
     - "valid" + expiry near -> generate a new key and send it to the user (Discord bot, website, anything)
```
A Discord/website bot calls `/api/generate` — the key is created automatically, no manual work.
`POST /api/generate  {key, appid, duration:"24h", type:"license"}` → `{ok, license_key, expires}`

## File structure

```
KEYUTH-web/
├── server.py           # Python stdlib + SQLite backend (live mode)
├── IshuAuth.cs         # C# SDK (drop-in, no package needed)
├── IshuAuth_Package/
│   ├── IshuAuth.cs     # same SDK
│   ├── Example.cs      # full working example
│   └── README.txt      # steps
├── IshuAuth_Package.zip# one-click download (Installation page)
├── index.html          # Login (particle bg, logo, premium font)
├── dashboard.html      # Dashboard: Dashboard / Create Users / Applications / API Keys / Settings / Installation
├── css/style.css       # ISHU AUTH theme + animations
└── js/core.js          # Engine: auth, keys, HWID, apps, licenses
```