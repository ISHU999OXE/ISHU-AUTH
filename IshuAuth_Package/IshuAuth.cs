// =============================================================
//   ISHU AUTH - SDK (C#)  —  drop this file into your project
//   Author: ISHU · ISHU AUTH / server-side license control
// -------------------------------------------------------------
//   INSTALL:        No package needed. .NET built-in System.Net.Http.
//   AOT SAFE:       This file uses form-POST (no JSON reflection)
//                   — it works even in your PublishAot (native AOT)
//                   build.
//   SERVER:         python server.py  (run on your PC/VPS)
// -------------------------------------------------------------
//   BASIC USE (in your LoginForm):
//     var auth = new IshuAuth();
//     auth.Server = "http://192.168.1.5:3000";   // your PC IP or VPS
//     auth.ApiKey = "ISHU_XXXX-....";            // panel: API Keys
//     auth.AppId  = "APP-XXXXXX";                // panel: Applications
//
//     var r = await auth.Verify("user123", "pass123",
//             IshuAuth.Fingerprint());                  // stable HWID
//     if (r.Success) { /* app unlocked */ }
//     else MessageBox.Show("DENIED: " + r.Message);
//
//   EXTRA CONTROL (create / reset / renew / ban — same as the panel):
//     await auth.Create("user2", "pass2", "30d", "user");
//     await auth.ResetHwid(licenseId);
//     await auth.Renew(licenseId, "7d");              // or "permanent"
//     await auth.Renew(licenseId, null, untilMs);     // or exact date
//     await auth.Ban(licenseId, true);
// =============================================================

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

public class IshuAuth
{
    public string Server = "http://localhost:3000";
    public string ApiKey = "";
    public string AppId = "";

    static readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

    /// <summary>Stable device fingerprint (SHA-256 of Windows MachineGuid) — use as the HWID.
    /// Same PC always returns the same value, so the key stays locked to this PC and
    /// keeps working across restarts. Do NOT use GetHashCode() — .NET randomizes it
    /// per process run, so it would change on every launch and force HWID resets.</summary>
    public static string Fingerprint()
    {
        string guid = "";
        try
        {
            guid = Microsoft.Win32.Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography",
                "MachineGuid", "")?.ToString() ?? "";
        }
        catch { }
        using (var sha = System.Security.Cryptography.SHA256.Create())
        {
            byte[] hash = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(
                (string.IsNullOrEmpty(guid) ? Environment.MachineName : guid) +
                "|" + Environment.MachineName));
            var sb = new System.Text.StringBuilder(32);
            foreach (byte b in hash) sb.Append(b.ToString("X2"));
            return "HW-" + sb.ToString().Substring(0, 16);
        }
    }

    // ---------- APP LOGIN / VERIFY ----------
    // user: username     (if logging in with a license key, use the key itself)
    // pass: password     (if it's a license key, use the key as password too)
    // hwid: device fingerprint — after an HWID reset the user can log in again
    public async Task<VerifyResult> Verify(string user, string pass, string hwid)
    {
        try
        {
            var json = await Post("/api/verify", new Dictionary<string, string>
            {
                ["key"] = ApiKey, ["appid"] = AppId,
                ["user"] = user, ["pass"] = pass, ["hwid"] = hwid ?? ""
            });
            return new VerifyResult
            {
                Success = Regex.IsMatch(json, "\"success\"\\s*:\\s*true"),
                Message = GrabField(json, "message"),
                Expires = GrabField(json, "expires"),
                Username = GrabField(json, "username")
            };
        }
        catch (Exception ex)
        {
            return new VerifyResult { Success = false, Message = "server unreachable: " + ex.Message };
        }
    }

    // =============================================================
    //   USER / LICENSE CONTROL — same as the panel, from C#
    // =============================================================

    /// <summary>Creates a new user or license. type = "user" or "license".
    /// lock: false = any device (no HWID check), default(true) = only 1 device.</summary>
    public async Task<CreateAck> Create(string username, string password, string duration,
                                        string type = "user", long? untilMs = null, bool? lockDevice = null)
    {
        var f = new Dictionary<string, string>
        {
            ["key"] = ApiKey, ["appid"] = AppId,
            ["username"] = username, ["password"] = password,
            ["type"] = type, ["duration"] = duration
        };
        if (untilMs.HasValue) f["until"] = untilMs.Value.ToString();
        if (lockDevice.HasValue) f["lock"] = lockDevice.Value ? "1" : "0";
        var json = await Post("/api/license", f);
        return new CreateAck
        {
            ok = Ok(json),
            Message = GrabField(json, "message"),
            LicenseKey = GrabField(json, "license_key"),
            Id = GrabField(json, "id"),
            Expires = GrabField(json, "expires")
        };
    }

    // =============================================================
    //   AUTOMATIC KEY GENERATION — create keys from your app/bot.
    //   Setup: key auto-expires after 24h <=> generate the next one.
    //--------------------------------------------------------------
    //   Simple pattern (expiry check + auto generate) — works from
    //   anywhere, here is how to use the API from C#:
    //
    //   while (running) {
    //       var v = await auth.Verify(keyUser, keyPass, hwid);
    //       if (v.Success) {
    //           if (v.Expires != "permanent" &&
    //               DateTime.Parse(v.Expires) < DateTime.Now.AddHours(1))
    //               keyUser = keyPass = auth.Generate("24h").LicenseKey;  // new key
    //           break;  // login ok
    //       } else {
    //           return fail("DENIED: " + v.Message);
    //       }
    //   }
    // =============================================================

    /// <summary>Generates a new license key with its own expiry.
    /// duration: "permanent", "1h","3h","6h","12h","24h","1d","3d","7d","30d","90d","1y",
    /// or an exact date (untilMs). lock: false = no HWID binding (easy for bots).</summary>
    public async Task<CreateAck> Generate(string duration = "24h", long? untilMs = null, bool? lockDevice = null)
    {
        return await Create("gen-" + Guid.NewGuid().ToString("N").Substring(0, 10),
                            null, duration, "license", untilMs, lockDevice);
    }

    /// <summary>HWID reset — unlinks the user's device.</summary>
    public async Task<bool> ResetHwid(string licenseId)
    {
        var f = Base(); f["id"] = licenseId;
        return Ok(await Post("/api/license/resethwid", f));
    }

    /// <summary>Renew / extend — permanent | 1d | 3d | 7d | 30d | 90d | 1y, or an exact date (untilMs).</summary>
    public async Task<bool> Renew(string licenseId, string duration, long? untilMs = null)
    {
        var f = Base(); f["id"] = licenseId;
        f["duration"] = duration ?? "permanent";
        if (untilMs.HasValue) f["until"] = untilMs.Value.ToString();
        return Ok(await Post("/api/license/renew", f));
    }

    /// <summary>Ban / unban.</summary>
    public async Task<bool> Ban(string licenseId, bool banned)
    {
        var f = Base(); f["id"] = licenseId;
        f["banned"] = banned ? "true" : "false";
        return Ok(await Post("/api/license/ban", f));
    }

    // ---------- internals ----------
    Dictionary<string, string> Base() => new Dictionary<string, string>
    {
        ["key"] = ApiKey, ["appid"] = AppId
    };

    async Task<string> Post(string path, Dictionary<string, string> fields)
    {
        using var content = new FormUrlEncodedContent(fields);
        var res = await _http.PostAsync(Server + path, content);
        return await res.Content.ReadAsStringAsync();
    }

    bool Ok(string json)
        => json.Contains("\"ok\":true") || json.Contains("\"ok\": true");

    string GrabField(string json, string name)
    {
        var m = Regex.Match(json, "\"" + Regex.Escape(name) + "\"\\s*:\\s*\"(.*?)\"");
        return m.Success ? m.Groups[1].Value : "";
    }

    public class VerifyResult
    {
        public bool Success;
        public string Message;
        public string Expires;
        public string Username;
    }

    public class CreateAck
    {
        public bool ok;
        public string Message;
        public string LicenseKey;
        public string Id;
        public string Expires;
    }
}

// =============================================================
//   ANDROID / APK (Java) NOTE — no package needed:
//   make a form POST with WebView or HttpURLConnection:
//     POST {server}/api/verify  body (form):
//       key=... & appid=... & user=... & pass=... & hwid=...
// =============================================================