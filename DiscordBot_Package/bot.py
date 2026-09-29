"""
Discord Key Bot — ISHU AUTH integration
Slash /key command: owner gets permanent/custom-expiry options; normal users
choose License Key or Username+Password, then must REALLY complete a VPLINK
link. Completion is verified server-side (callback hit) — no "I completed"
button — and the key is auto-DM'd when it fires.
"""
import os, json, time, asyncio, secrets, re
from pathlib import Path

import aiohttp
import discord
from discord import app_commands, ui

HTTP = None          # shared aiohttp session — set in on_ready
_HEARTBEAT_OK = False # prevents duplicate heartbeat tasks


# ── Config ──────────────────────────────────────────────────────────────────
CFG_PATH = Path(__file__).parent / "config.json"
DATA_PATH = Path(__file__).parent / "data.json"

with open(CFG_PATH, encoding="utf-8") as _f:
    CFG = json.load(_f)

SERVER   = CFG.get("server", "").rstrip("/")
NAME     = CFG.get("name", "")          # app label (also used as appid fallback)
MASTER_KEY = CFG.get("key", "")         # master api_key for /api/bootstrap
OWNERID  = CFG.get("ownerid", "")
SECRET   = CFG.get("secret", "")
VERSION  = CFG.get("version", "1.0")
SHORTENER = CFG.get("shortener", "")      # destination long URL
VPLINK_API = CFG.get("vplink_api", "")    # VPLINK API token (optional but recommended)
BOT_OWNER = int(CFG.get("owner_id", 0))   # Discord user id of the admin
KEY_HOURS = int(CFG.get("key_hours", 48))
COOLDOWN_HOURS = int(CFG.get("cooldown_hours", 48))


# ── Persistent data ─────────────────────────────────────────────────────────
def _load_data():
    if DATA_PATH.exists():
        try:
            return json.loads(DATA_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"cooldowns": {}, "last_keys": {}}

def _save_data(d):
    DATA_PATH.write_text(json.dumps(d, indent=2), encoding="utf-8")

DATA = _load_data()


# ── API helper ──────────────────────────────────────────────────────────────
def _passwd() -> str:
    return "UP-" + secrets.token_hex(4).upper()

async def _botkey(username: str, duration: str = "48h", ltype: str = "license", password: str | None = None):
    payload = {
        "name": NAME, "ownerid": OWNERID, "secret": SECRET, "version": VERSION,
        "username": username, "duration": duration, "lock": True,
        "type": ltype,
    }
    if ltype == "user":
        payload["password"] = password or _passwd()
    data = await _api_post(f"{SERVER}/api/botkey", payload)
    if not data.get("ok"):
        # Render wipes the SQLite DB (owner row) whenever its free instance
        # restarts — reseed the owner row and retry once so "API error." can
        # never persist. No manual bot restart needed.
        await _bootstrap()
        data = await _api_post(f"{SERVER}/api/botkey", payload)
    return data


async def _shorten(url: str) -> str | None:
    """Generate a short link via VPLINK API. Returns the short URL, or the
    original URL if VPLINK is not configured or fails."""
    if not VPLINK_API or not url:
        return url or None
    if not HTTP:
        return url
    params = {
        "api": VPLINK_API,
        "url": url,
        "format": "text",
    }
    try:
        async with HTTP.get("https://vplink.in/api", params=params) as r:
            if r.status == 200:
                text = (await r.text()).strip()
                if "vplink.in/" in text:
                    return text
    except Exception:
        pass
    return url or None


async def _task_new(user_id: int, ltype: str) -> dict:
    """Register a verified shortlink task on the server. Returns {token,...}."""
    payload = {
        "name": NAME, "ownerid": OWNERID, "secret": SECRET, "version": VERSION,
        "user_id": str(user_id), "ltype": ltype, "destination": SHORTENER,
    }
    data = await _api_post(f"{SERVER}/api/shortlink/new", payload)
    if not data.get("ok"):
        await _bootstrap()
        data = await _api_post(f"{SERVER}/api/shortlink/new", payload)
    return data


async def _task_status(token: str) -> dict:
    """Server-side completion check (no client button involved)."""
    payload = {
        "name": NAME, "ownerid": OWNERID, "secret": SECRET, "version": VERSION,
        "token": token,
    }
    data = await _api_post(f"{SERVER}/api/shortlink/check", payload)
    if not data.get("ok"):
        await _bootstrap()
        data = await _api_post(f"{SERVER}/api/shortlink/check", payload)
    return data


async def _api_post(url: str, payload: dict) -> dict:
    """POST JSON with the shared session (fast keep-alive, no new TCP per call)."""
    if not HTTP:
        return {"ok": False, "error": "no session"}
    try:
        async with HTTP.post(url, json=payload) as r:
            try:
                return await r.json()
            except Exception:
                return {"ok": False, "error": "bad response"}
    except Exception:
        return {"ok": False, "error": "network timeout"}


async def _heartbeat():
    """Keep the Render free instance awake so it never sleeps / cold-starts /
    wipes its SQLite DB. Also re-seeds the owner row every cycle as a safety
    net — the bot never needs a manual restart."""
    while True:
        await asyncio.sleep(240)
        if not HTTP:
            continue
        try:
            payload = {
                "key": MASTER_KEY, "appid": NAME, "appname": NAME,
                "ownerid": OWNERID, "secret": SECRET, "version": VERSION,
            }
            if MASTER_KEY:
                async with HTTP.post(f"{SERVER}/api/bootstrap", json=payload) as r:
                    pass
            else:
                async with HTTP.get(f"{SERVER}/") as r:
                    pass
        except Exception:
            pass


async def _bootstrap():
    """Re-register the owner row. Render's free SQLite DB resets on every
    restart/redeploy, so without this the /api/botkey auth would 401 and the
    bot would show 'API error.' Calling it on startup makes the bot restore
    the owner row automatically — no manual reseed ever needed."""
    if not MASTER_KEY or not NAME:
        return False
    if not HTTP:
        return False
    payload = {
        "key": MASTER_KEY,
        "appid": NAME,
        "appname": NAME,
        "ownerid": OWNERID,
        "secret": SECRET,
        "version": VERSION,
    }
    try:
        async with HTTP.post(
            f"{SERVER}/api/bootstrap", json=payload) as r:
            if r.status == 200:
                data = await r.json()
                return bool(data.get("ok"))
    except Exception:
        return False
    return False


# ── Cooldown check ──────────────────────────────────────────────────────────
def _user_cooldown_ok(user_id: int) -> tuple[bool, float]:
    """Returns (allowed, seconds_remaining)."""
    last = DATA["cooldowns"].get(str(user_id), 0)
    elapsed = time.time() - last
    wait = COOLDOWN_HOURS * 3600 - elapsed
    if wait <= 0:
        return True, 0
    return False, wait


def _format_time(seconds: float) -> str:
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}h {m}m"
    return f"{m}m {s}s"


def _fmt_issue(data: dict) -> str:
    """Format the issued key for DM — license key OR username/password."""
    if data.get("type") == "user":
        return (f"**Username**\n`{data.get('username', '')}`\n"
                f"**Password**\n`{data.get('password', '')}`")
    return f"**License Key**\n`{data.get('license_key', '')}`"


def _dm_text(data: dict, expires: str) -> str:
    """Professional DM layout for the issued credentials."""
    if data.get("type") == "user":
        creds = (f"**\U0001f464 Username**\n`{data.get('username', '')}`\n\n"
                 f"**\U0001f511 Password**\n`{data.get('password', '')}`")
    else:
        creds = f"**\U0001f511 License Key**\n`{data.get('license_key', '')}`"
    return (
        "\U0001f389 **Congratulations! Your key is ready.**\n\n"
        f"**Your Access Credentials:**\n{creds}\n\n"
        f"\u23f1\ufe0f **Expires:** {expires or 'Permanent'}"
        "\n\n\U0001f4dd *Please keep your credentials safe and do not share them with anyone.*"
    )


# ── License lookup / status helpers ─────────────────────────────────────────
async def _license_rows() -> list:
    """Fetch every license for this app (owner-authed). Returns a list of rows
    (username, license_key, type, expires_at ms, hwid, last_login, ...)."""
    rows: list = []
    if not HTTP:
        return rows
    try:
        async with HTTP.get(
            f"{SERVER}/api/licenses?appid={NAME}",
            headers={"x-api-key": MASTER_KEY},
            timeout=aiohttp.ClientTimeout(total=20)) as r:
            data = await r.json()
        if isinstance(data, dict) and data.get("ok"):
            rows = data.get("list") or []
    except Exception:
        pass
    return rows


async def _hwid_reset(username: str, actor: str) -> dict:
    """Reset HWID for a license. actor='user' -> 1x/24h; actor='owner' -> unlimited."""
    payload = {
        "name": NAME, "ownerid": OWNERID, "secret": SECRET, "version": VERSION,
        "user": username, "as": actor,
    }
    data = await _api_post(f"{SERVER}/api/resethwid", payload)
    if not data.get("ok"):
        await _bootstrap()
        data = await _api_post(f"{SERVER}/api/resethwid", payload)
    return data


def _time_left(ms: int) -> str:
    s = int(max(0, ms // 1000))
    d, h = divmod(s // 3600, 24)
    h, m = divmod(h, 60)
    if d:
        return f"{d}d {h}h {m}m"
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m"
    return f"{s}s"


def _lic_status(row: dict):
    """Returns (status_line, is_active)."""
    exp = row.get("expires_at")
    now = int(time.time() * 1000)
    if not exp:
        return "\U0001f7e2 **Lifetime** (Active forever)", True
    left = int(exp) - now
    if left > 0:
        return f"\U0001f7e2 **Active** \u2014 Time left: `{_time_left(left)}`", True
    return "\U0001f534 **Expired**", False


def _lic_cred(row: dict) -> str:
    if row.get("type") == "user":
        return f"**Username:** `{row.get('username', '')}`"
    return f"**License Key:** `{row.get('license_key', '')}`"


def _pick_license(rows: list, username: str):
    mine = [r for r in rows if (r.get("username") or "") == username]
    if not mine:
        return None
    now = int(time.time() * 1000)
    live = [r for r in mine if not r.get("expires_at") or int(r["expires_at"]) > now]
    return max(live or mine, key=lambda r: int(r.get("expires_at") or 0))


def _user_detail(row: dict) -> str:
    status, _ = _lic_status(row)
    exp = row.get("expires_at")
    exp_line = "Permanent" if not exp else f"<t:{int(int(exp) // 1000)}:f>"
    last = row.get("last_login")
    last_line = "Never" if not last else f"<t:{int(int(last) // 1000)}:R>"
    return (
        f"**\U0001f4dd {row.get('username', '')}**\n"
        f"- {status}\n"
        f"- Expires: {exp_line}\n"
        f"- Type: `{row.get('type')}`\n"
        f"- HWID bound: `{row.get('hwid') or 'no'}`\n"
        f"- Last login: {last_line}\n\n"
        f"- {_lic_cred(row)}"
    )


# ── Bot setup ───────────────────────────────────────────────────────────────
intents = discord.Intents.default()
intents.members = True
bot = discord.Client(intents=intents, activity=discord.Game(name="/key"))
tree = app_commands.CommandTree(bot)


# ── Views ───────────────────────────────────────────────────────────────────
# Pending verified tasks: token -> {channel_id, msg_id, user_id, ltype, link}
PENDING = {}
TASK_TIMEOUT_SECONDS = 300   # how long the bot waits for a real completion
TASK_POLL_SECONDS = 5


class TaskClaimView(ui.View):
    """Shown while a task is pending: open-link button + server-verified
    'I completed' claim button. The claim button NEVER trusts the client — it
    asks the backend for the session status first (pending -> reject, completed
    -> issue key)."""
    def __init__(self, token: str, user_id: int, ltype: str, link: str):
        super().__init__(timeout=300)
        self.token = token
        self.user_id = user_id
        self.ltype = ltype
        self.add_item(ui.Button(
            label="\U0001f517 Open Link \u2014 Complete the task",
            style=discord.ButtonStyle.link, url=link))

    def _pick(self, ltype: str) -> str:
        return "Username + Password" if ltype == "user" else "License Key"

    @ui.button(label="\u2705 I completed the link \u2014 Claim my key",
               style=discord.ButtonStyle.success, emoji="\u2705")
    async def on_claim(self, interaction: discord.Interaction, button: ui.Button):
        if interaction.user.id != self.user_id:
            return await interaction.response.send_message(
                "This button is not for you.", ephemeral=True)
        task = PENDING.get(self.token)
        if not task:
            return await interaction.response.send_message(
                "This task has expired. Run `/key` again.", ephemeral=True)
        await interaction.response.defer(ephemeral=True)

        try:
            st = await _task_status(self.token)
        except Exception:
            return await interaction.followup.send(
                "Server error. Try again in a moment.", ephemeral=True)

        if not st.get("ok"):
            return await interaction.followup.send(
                "Task not found. Run `/key` again.", ephemeral=True)

        if not st.get("completed"):
            # Server says the session is still pending -> bypass blocked.
            return await interaction.followup.send(
                "\u274c **Verification Incomplete \u2014 Access Denied**\n\n"
                "Your task has not been verified yet. Please open the link and "
                "wait for the **8-second countdown** to finish, then press "
                "**\u2705 I completed the link** again.", ephemeral=True)

        await _deliver_key(task, self.token)
        await interaction.followup.send(
            "\u2705 **Verification Successful** \u2014 your key has been sent to your DM!",
            ephemeral=True)


class UserKeyTypeView(ui.View):
    """Shown to normal users: choose what they want — License Key or Username+Password."""
    def __init__(self, user_id: int):
        super().__init__(timeout=300)
        self.user_id = user_id

    def _pick(self, ltype: str) -> str:
        return "Username + Password" if ltype == "user" else "License Key"

    async def _start(self, interaction: discord.Interaction, ltype: str):
        if interaction.user.id != self.user_id:
            try:
                return await interaction.response.send_message(
                    "This button is not for you.", ephemeral=True)
            except Exception:
                return
        try:
            allowed, remaining = _user_cooldown_ok(self.user_id)
            if not allowed:
                return await interaction.response.send_message(
                    f"Please wait {_format_time(remaining)} before generating a new key.", ephemeral=True)
            await interaction.response.defer(ephemeral=True)

            res = await _task_new(self.user_id, ltype)
            if not res.get("ok"):
                return await interaction.followup.send(
                    "Could not start the task. Try again later.", ephemeral=True)

            token = res["token"]
            callback = f"{SERVER}/api/shortlink/v?token={token}"
            link = await _shorten(callback)
            if not link:
                return await interaction.followup.send(
                    "Shortener link is not configured. Contact admin.", ephemeral=True)
            if VPLINK_API and "vplink.in/" not in link:
                return await interaction.followup.send(
                    "\u26a0\ufe0f **Verification link could not be generated.**\n"
                    "Please contact the support team and inform them the shortener "
                    "service is misconfigured (`vplink_api`).", ephemeral=True)

            text = (
                f"**\U0001f510 Task Verification Required**\n\n"
                f"Before your **{self._pick(ltype)}** is issued, please complete a "
                f"quick verification step in your browser.\n\n"
                f"**1.** Tap **\U0001f517 Open Link** \u2014 it will open in your default browser.\n"
                f"**2.** Let the **8-second countdown** finish. \u26a0\ufe0f Do **not** close "
                f"the tab or press the back button.\n"
                f"**3.** When the page confirms your task is verified, tap "
                f"**\u2705 I completed the link** below.\n\n"
                f"Your key will be delivered to your Direct Messages immediately after "
                f"the server verifies your completion.\n\n"
                f"\u23f1\ufe0f Request expires in **{TASK_TIMEOUT_SECONDS // 60} minutes**.\n"
                f"Key duration: **{KEY_HOURS} hours**."
            )
            msg = await interaction.followup.send(
                text, view=TaskClaimView(token, self.user_id, ltype, link),
                ephemeral=True, wait=True)
            if getattr(msg, "id", None):
                PENDING[token] = {
                    "channel_id": interaction.channel_id,
                    "msg_id": msg.id,
                    "user_id": self.user_id,
                    "ltype": ltype,
                    "link": link,
                }
                bot.loop.create_task(_watch_status(token))
            else:
                await interaction.followup.send(
                    "Task started, but I couldn't track it. Contact admin.", ephemeral=True)
        except Exception:
            try:
                if not interaction.response.is_done():
                    await interaction.followup.send(
                        "Something went wrong. Please try again.", ephemeral=True)
            except Exception:
                pass

    @ui.button(label="License Key", style=discord.ButtonStyle.primary, emoji="\U0001f511")
    async def on_license(self, interaction: discord.Interaction, button: ui.Button):
        await self._start(interaction, "license")

    @ui.button(label="Username + Password", style=discord.ButtonStyle.success, emoji="\U0001f465")
    async def on_user(self, interaction: discord.Interaction, button: ui.Button):
        await self._start(interaction, "user")


async def _edit_task(task: dict, text: str, keep_view: bool = False):
    channel = bot.get_channel(task["channel_id"])
    if not channel:
        return
    try:
        msg = channel.get_partial_message(task["msg_id"])
        if keep_view:
            await msg.edit(content=text)
        else:
            await msg.edit(content=text, view=None)
    except Exception:
        pass


async def _deliver_key(task: dict, token: str):
    """Called ONLY from the server-verified 'I completed' button: the backend
    already returned completed=True for this session token, so we issue the key
    + DM it. No client-side fake completion can reach this path."""
    user_id = task["user_id"]
    ltype = task["ltype"]
    data = await _botkey(f"dc_{user_id}", duration=f"{KEY_HOURS}h", ltype=ltype,
                         password=_passwd() if ltype == "user" else None)
    if not data.get("ok"):
        await _edit_task(task, "\u274c Failed to generate your key server-side. Contact admin.")
        PENDING.pop(token, None)
        return

    body = _fmt_issue(data)
    expires = data.get("expires", "")
    DATA["cooldowns"][str(user_id)] = time.time()
    DATA["last_keys"][str(user_id)] = {"body": body, "expires": expires}
    _save_data(DATA)

    dm_text = _dm_text(data, expires)
    sent = False
    try:
        target = bot.get_user(user_id) or await bot.fetch_user(user_id)
        await target.send(dm_text)
        sent = True
    except Exception:
        sent = False

    what = "Username + Password" if ltype == "user" else "License Key"
    if sent:
        await _edit_task(task, f"\u2705 **Verified \u2014 {what} delivered to your DM!**")
    else:
        await _edit_task(task, f"\u2705 **Verified \u2014 here are your credentials**\n\n"
                               f"{body}\nExpires: {expires}\n\n"
                               f"*Couldn't DM you \u2014 please enable DMs and try `/mykey`.*")
    PENDING.pop(token, None)


async def _watch_status(token: str):
    """Poll the server. When the backend marks the session completed (via the
    signed verify-page postback), update the Discord message so the user knows
    to press the 'I completed' claim button. The key itself is issued ONLY when
    the user presses the button AND the backend confirms completion."""
    task = PENDING.get(token)
    if not task:
        return
    deadline = time.time() + TASK_TIMEOUT_SECONDS
    while time.time() < deadline:
        if token not in PENDING:
            return
        await asyncio.sleep(TASK_POLL_SECONDS)
        try:
            res = await _task_status(token)
        except Exception:
            continue
        if res.get("ok") and res.get("completed"):
            await _edit_task(
                task,
                "\u2705 **Task Completed & Verified**\n\n"
                "Press **\u2705 I completed the link** below to receive your key "
                "via Direct Message.",
                keep_view=True)
            return
    if token in PENDING:
        await _edit_task(task, "\u23f0 **Request Expired** \u2014 the verification was not completed in time. Please run `/key` to start again.")
        PENDING.pop(token, None)


class CustomDaysModal(ui.Modal, title="Custom key duration"):
    days = ui.TextInput(label="Number of days", placeholder="e.g. 2, 5, 10, 90", max_length=5)

    def __init__(self, ltype: str = "license"):
        super().__init__()
        self.ltype = ltype

    async def on_submit(self, interaction: discord.Interaction):
        try:
            n = int(self.days.value.strip())
            if n <= 0 or n > 3650:
                raise ValueError
        except ValueError:
            return await interaction.response.send_message(
                "Enter a valid number of days (1 to 3650).", ephemeral=True)
        try:
            await interaction.response.defer(ephemeral=True)
            username = f"dc_{interaction.user.id}"
            from datetime import datetime, timezone, timedelta
            until = int((datetime.now(timezone.utc) + timedelta(days=n)).timestamp() * 1000)
            ltype = self.ltype
            data = await _botkey(username, duration="custom", ltype=ltype,
                                 password=_passwd() if ltype == "user" else None)
            if not data.get("ok"):
                return await interaction.followup.send(
                    "\u274c **Server Error** \u2014 could not issue key. Please try again.", ephemeral=True)
            await interaction.followup.send(
                f"\u2705 **Key Issued Successfully**\n\n"
                f"{_fmt_issue(data)}\n\n"
                f"\u23f1\ufe0f Expires: {data.get('expires')}\n\u23f0 Duration: {n} day(s)", ephemeral=True)
        except Exception:
            try:
                if not interaction.response.is_done():
                    await interaction.followup.send(
                        "\u274c Something went wrong. Please try again.", ephemeral=True)
            except Exception:
                pass


class OwnerTypeView(ui.View):
    """Owner picks what to issue: license key or username+password."""
    def __init__(self):
        super().__init__(timeout=120)

    @ui.button(label="License Key", style=discord.ButtonStyle.primary, emoji="\U0001f511")
    async def on_license(self, interaction: discord.Interaction, button: ui.Button):
        try:
            await interaction.response.send_message(
                "Choose a duration:", view=OwnerDurationView("license"), ephemeral=True)
        except Exception:
            pass

    @ui.button(label="Username + Password", style=discord.ButtonStyle.success, emoji="\U0001f465")
    async def on_user(self, interaction: discord.Interaction, button: ui.Button):
        try:
            await interaction.response.send_message(
                "Choose a duration:", view=OwnerDurationView("user"), ephemeral=True)
        except Exception:
            pass


class OwnerDurationView(ui.View):
    """Shown to the bot owner — choose key duration."""
    def __init__(self, ltype: str = "license"):
        super().__init__(timeout=120)
        self.ltype = ltype

    async def _issue(self, interaction: discord.Interaction, duration: str):
        try:
            await interaction.response.defer(ephemeral=True)
            username = f"dc_{interaction.user.id}"
            ltype = self.ltype
            data = await _botkey(username, duration=duration, ltype=ltype,
                                 password=_passwd() if ltype == "user" else None)
            if not data.get("ok"):
                return await interaction.followup.send(
                    "\u274c **Server Error** \u2014 could not issue key. Please try again.", ephemeral=True)
            await interaction.followup.send(
                f"\u2705 **Key Issued Successfully**\n\n"
                f"{_fmt_issue(data)}\n\n"
                f"\u23f1\ufe0f Expires: {data.get('expires') or 'Permanent'}", ephemeral=True)
        except Exception:
            try:
                if not interaction.response.is_done():
                    await interaction.followup.send(
                        "\u274c Something went wrong. Please try again.", ephemeral=True)
            except Exception:
                pass

    @ui.button(label="Permanent", style=discord.ButtonStyle.danger, emoji="\U0001f512")
    async def on_permanent(self, interaction: discord.Interaction, button: ui.Button):
        await self._issue(interaction, "permanent")

    @ui.button(label="48 hours", style=discord.ButtonStyle.primary, emoji="\u23f0")
    async def on_48h(self, interaction: discord.Interaction, button: ui.Button):
        await self._issue(interaction, "48h")

    @ui.button(label="7 days", style=discord.ButtonStyle.primary, emoji="\U0001f4c5")
    async def on_7d(self, interaction: discord.Interaction, button: ui.Button):
        await self._issue(interaction, "7d")

    @ui.button(label="30 days", style=discord.ButtonStyle.primary, emoji="\U0001f4c6")
    async def on_30d(self, interaction: discord.Interaction, button: ui.Button):
        await self._issue(interaction, "30d")

    @ui.button(label="365 days", style=discord.ButtonStyle.primary, emoji="\U0001f4c5")
    async def on_365d(self, interaction: discord.Interaction, button: ui.Button):
        await self._issue(interaction, "1y")

    @ui.button(label="Custom days", style=discord.ButtonStyle.secondary, emoji="\U0001f4c8")
    async def on_custom(self, interaction: discord.Interaction, button: ui.Button):
        try:
            await interaction.response.send_modal(CustomDaysModal(self.ltype))
        except Exception:
            pass


# ── HWID reset views ────────────────────────────────────────────────────────
class MyKeyHWIDView(ui.View):
    """Reset button shown under /mykey. Normal user -> 1x/24h; owner -> unlimited."""
    def __init__(self, username: str, user_id: int):
        super().__init__(timeout=180)
        self.username = username
        self.user_id = user_id

    @ui.button(label="\U0001f504 Reset HWID", style=discord.ButtonStyle.secondary)
    async def on_reset(self, interaction: discord.Interaction, button: ui.Button):
        if interaction.user.id != self.user_id:
            try:
                return await interaction.response.send_message(
                    "This button is not for you.", ephemeral=True)
            except Exception:
                return
        try:
            await interaction.response.defer(ephemeral=True)
            actor = "owner" if interaction.user.id == BOT_OWNER else "user"
            data = await _hwid_reset(self.username, actor)
            if data.get("ok"):
                rows = await _license_rows()
                pick = _pick_license(rows, self.username)
                creds = _lic_cred(pick) if pick else "No key found."
                await interaction.followup.send(
                    f"\U0001f504 **HWID Reset Done**\n\n"
                    f"{creds}\n\n"
                    f"Your key can now be used on one new device.", ephemeral=True)
            else:
                await interaction.followup.send(
                    f"\u274c {data.get('error') or 'HWID reset failed. Please try again.'}",
                    ephemeral=True)
        except Exception:
            try:
                await interaction.followup.send(
                    "\u274c Something went wrong. Please try again.", ephemeral=True)
            except Exception:
                pass


class OwnerUserResetView(ui.View):
    """Owner-only: reset a chosen user's HWID (unlimited)."""
    def __init__(self, username: str):
        super().__init__(timeout=180)
        self.username = username

    @ui.button(label="\U0001f504 Reset HWID (Owner)", style=discord.ButtonStyle.danger)
    async def on_reset(self, interaction: discord.Interaction, button: ui.Button):
        if interaction.user.id != BOT_OWNER:
            try:
                return await interaction.response.send_message(
                    "Owner only.", ephemeral=True)
            except Exception:
                return
        try:
            await interaction.response.defer(ephemeral=True)
            data = await _hwid_reset(self.username, "owner")
            if data.get("ok"):
                rows = await _license_rows()
                pick = _pick_license(rows, self.username)
                creds = _lic_cred(pick) if pick else "No key found."
                await interaction.followup.send(
                    f"\U0001f504 **HWID Reset Done**\n\n{creds}", ephemeral=True)
            else:
                await interaction.followup.send(
                    f"\u274c {data.get('error') or 'HWID reset failed.'}", ephemeral=True)
        except Exception:
            try:
                await interaction.followup.send(
                    "\u274c Something went wrong. Please try again.", ephemeral=True)
            except Exception:
                pass


class UserSelectView(ui.View):
    """Owner /user: pick a user to see their key + reset their HWID."""
    def __init__(self, rows: list):
        super().__init__(timeout=180)
        self.rows = rows
        now = int(time.time() * 1000)
        best = {}
        for r in rows:
            u = (r.get("username") or "").strip()
            if not u:
                continue
            exp = r.get("expires_at")
            key = u
            if key not in best or int(exp or 0) > int(best[key].get("expires_at") or 0):
                best[key] = r
        users = sorted(best.values(), key=lambda r: int(r.get("last_login") or 0), reverse=True)
        truncated = len(users) > 25
        opts = []
        for r in users[:25]:
            exp = r.get("expires_at")
            if not exp:
                st = "Lifetime"
            elif int(exp) > now:
                st = "Active"
            else:
                st = "Expired"
            desc = f"{st} \u00b7 {r.get('type', 'license')}"
            opts.append(discord.SelectOption(
                label=r["username"][:100], value=str(r["username"]), description=desc[:100]))
        select = ui.Select(placeholder="Choose a user...", options=opts)
        selected_text = ("Showing first 25 users.\n" if truncated else "")
        self.selected_text = selected_text

        async def on_select(interaction: discord.Interaction):
            if interaction.user.id != BOT_OWNER:
                return await interaction.response.send_message(
                    "Owner only.", ephemeral=True)
            try:
                await interaction.response.defer(ephemeral=True)
                username = select.values[0]
                row = best.get(username)
                if not row:
                    return await interaction.followup.send(
                        "User not found.", ephemeral=True)
                await interaction.followup.send(
                    _user_detail(row), view=OwnerUserResetView(username), ephemeral=True)
            except Exception:
                try:
                    await interaction.followup.send(
                        "\u274c Something went wrong. Please try again.", ephemeral=True)
                except Exception:
                    pass

        select.callback = on_select
        self.add_item(select)


# ── /key command ────────────────────────────────────────────────────────────
@tree.command(name="key", description="Generate or claim a key")
async def key_cmd(interaction: discord.Interaction):
    try:
        # Owner path
        if interaction.user.id == BOT_OWNER:
            return await interaction.response.send_message(
                "You are the owner. Choose what to issue:", view=OwnerTypeView(), ephemeral=True
            )

        # Normal user path — cooldown check
        allowed, remaining = _user_cooldown_ok(interaction.user.id)
        if not allowed:
            return await interaction.response.send_message(
                f"\u23f1\ufe0f Your previous key is still active. Please wait **{_format_time(remaining)}** before generating a new one.",
                ephemeral=True,
            )

        await interaction.response.send_message(
            "Please select the type of key you would like to generate:",
            view=UserKeyTypeView(interaction.user.id), ephemeral=True,
        )
    except Exception:
        try:
            await interaction.response.send_message(
                "\u274c Something went wrong. Please try again.", ephemeral=True)
        except Exception:
            pass


# ── /mykey command — show your key + status ───────────────────────────────
@tree.command(name="mykey", description="Show your key, its status and a HWID reset option")
async def mykey_cmd(interaction: discord.Interaction):
    try:
        await interaction.response.defer(ephemeral=True)
        rows = await _license_rows()
        uname = f"dc_{interaction.user.id}"
        pick = _pick_license(rows, uname)
        if not pick:
            return await interaction.followup.send(
                "\U0001f511 **Please generate a key first.**\n\n"
                "You haven't generated any key yet. Use `/key` to create one.",
                ephemeral=True)
        status, _ = _lic_status(pick)
        creds = _lic_cred(pick)
        if pick.get("type") == "user":
            info = DATA["last_keys"].get(str(interaction.user.id))
            if info:
                m = re.search(r"Password\s*\n`([^`]+)`", str(info.get("body", "")))
                if m and uname in str(info.get("body", "")):
                    creds += f"\n**Password:** `{m.group(1)}`"
        exp = pick.get("expires_at")
        exp_line = "Permanent" if not exp else f"<t:{int(int(exp) // 1000)}:f>"
        await interaction.followup.send(
            f"**Your Key**\n\n{creds}\n\n{status}\nExpires: {exp_line}\n\n"
            "Press **\U0001f504 Reset HWID** below to log in on a new device "
            "(`/resethwid` works too).",
            view=MyKeyHWIDView(uname, interaction.user.id), ephemeral=True)
    except Exception:
        try:
            await interaction.followup.send(
                "\u274c Something went wrong. Please try again.", ephemeral=True)
        except Exception:
            pass


# ── /user command — owner: browse all users' keys ──────────────────────────
@tree.command(name="user", description="Owner: view every user who generated a key")
async def user_cmd(interaction: discord.Interaction):
    try:
        if interaction.user.id != BOT_OWNER:
            return await interaction.response.send_message(
                "\U0001f6ab This command is for the owner only.", ephemeral=True)
        await interaction.response.defer(ephemeral=True)
        rows = await _license_rows()
        if not rows:
            return await interaction.followup.send(
                "No keys have been generated yet.", ephemeral=True)
        await interaction.followup.send(
            "Select a user to view their key:", view=UserSelectView(rows), ephemeral=True)
    except Exception:
        try:
            await interaction.followup.send(
                "\u274c Something went wrong. Please try again.", ephemeral=True)
        except Exception:
            pass


# ── /resethwid command — HWID device reset ────────────────────────────────
# Normal user: apni key ka HWID reset, once per 24h (server enforce karta hai).
# Owner: unlimited, aur optional target username par reset kar sakta hai.
@tree.command(name="resethwid", description="Reset your device (HWID) to log in on a new PC (once per 24h)")
async def resethwid_cmd(interaction: discord.Interaction, username: str | None = None):
    try:
        is_owner = interaction.user.id == BOT_OWNER
        target = str(interaction.user.id)
        actor = "owner" if is_owner else "user"
        if is_owner and username and username.strip():
            target = username.strip()
        payload = {
            "name": NAME, "ownerid": OWNERID, "secret": SECRET, "version": VERSION,
            "user": target, "as": actor,
        }
        data = await _api_post(f"{SERVER}/api/resethwid", payload)
        if not data.get("ok"):
            await _bootstrap()
            data = await _api_post(f"{SERVER}/api/resethwid", payload)
        if data.get("ok"):
            await interaction.response.send_message(
                "\u2705 **HWID Reset Done** \u2014 ab aap apne naye PC/device pe login kar sakte hain.",
                ephemeral=True)
        else:
            await interaction.response.send_message(
                f"\u274c {data.get('error') or 'HWID reset failed.'}",
                ephemeral=True)
    except Exception:
        try:
            await interaction.response.send_message(
                "\u274c Something went wrong. Please try again.", ephemeral=True)
        except Exception:
            pass


# ── /status command — check cooldown ───────────────────────────────────────
@tree.command(name="status", description="Check how long until you can get a new key")
async def status_cmd(interaction: discord.Interaction):
    try:
        allowed, remaining = _user_cooldown_ok(interaction.user.id)
        if allowed:
            return await interaction.response.send_message(
                "You can generate a new key now. Use `/key`.", ephemeral=True)
        await interaction.response.send_message(
            f"\u23f1\ufe0f Please wait **{_format_time(remaining)}** before generating a new key.",
            ephemeral=True
        )
    except Exception:
        try:
            await interaction.response.send_message(
                "\u274c Something went wrong. Please try again.", ephemeral=True)
        except Exception:
            pass


# ── Error handlers ──────────────────────────────────────────────────────────
@bot.event
async def on_error(event, *args, **kwargs):
    import traceback, sys
    print(f"[bot] unhandled error in '{event}'", file=sys.stderr)
    traceback.print_exc()


@tree.error
async def on_app_command_error(interaction: discord.Interaction, error):
    try:
        if not interaction.response.is_done():
            await interaction.response.send_message(
                "\u274c Something went wrong. Please try again.", ephemeral=True)
    except Exception:
        pass


# ── Connection watchdog ─────────────────────────────────────────────────────
async def _connection_watchdog():
    """Bot kabhi silently dead nahi rahega. Agar Discord websocket band
    ho jata hai aur 90 sec tak reconnect nahi hota, bot ko force restart
    kar deta hai — auto-restart wrapper (_run) use ko wapas start karega."""
    global HTTP
    await bot.wait_until_ready()
    while True:
        await asyncio.sleep(90)
        if bot.is_closed():
            print("[watchdog] connection lost — forcing restart")
            if HTTP:
                try:
                    await HTTP.close()
                except Exception:
                    pass
            try:
                await bot.close()
            except Exception:
                pass
            return


# ── Startup ─────────────────────────────────────────────────────────────────
@bot.event
async def on_ready():
    global HTTP, _HEARTBEAT_OK
    try:
        # Create shared HTTP session (single TCP connection, fast keep-alive)
        if not HTTP:
            HTTP = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=60),
                connector=aiohttp.TCPConnector(limit=20))
        ok = await _bootstrap()
        await tree.sync()
        print(f"Logged in as {bot.user}  |  /key synced  |  owner row: {'re-seeded' if ok else 'NOT seeded (check config key)'}")
        if not _HEARTBEAT_OK:
            _HEARTBEAT_OK = True
            bot.loop.create_task(_heartbeat())
            bot.loop.create_task(_connection_watchdog())
    except Exception:
        print("[bot] on_ready error (will retry on next connect)")


# ── Self-healing restart wrapper ────────────────────────────────────────────
def _run():
    """Bot kabhi permanently crash nahi hoga. Agar Discord gateway connection
    tootta hai ya koi fatal exception aata hai, 5 sec baad khud restart ho
    jayega — manual restart ki zaroorat kabhi nahi padegi."""
    global HTTP, _HEARTBEAT_OK
    import traceback, sys
    while True:
        HTTP = None
        _HEARTBEAT_OK = False
        try:
            print("[bot] starting bot…")
            bot.run(CFG["token"], reconnect=True)
        except KeyboardInterrupt:
            print("\n[bot] stopped by user.")
            break
        except Exception:
            print("[bot] crashed — restarting in 5 seconds…", file=sys.stderr)
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    _run()
