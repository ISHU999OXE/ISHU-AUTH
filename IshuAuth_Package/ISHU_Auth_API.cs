// =============================================================
//   ISHU AUTH - SDK (C#)  API-KEY LOGIN CLASS
//   Drop this one file into your project. No package needed.
// -------------------------------------------------------------
//   PACKAGE GUID : 8CD236B4-A8C4-417D-AEDD-3B4D91CDB61B
// -------------------------------------------------------------
//   USE (same flow as other auth systems — 4 values, no API key):
//     public static api IshuAuthApp = new api(
//         name:    "APP-XXXXXX",       // your app id or app name
//         ownerid: "YOUR-OWNER-ID",    // panel: Install -> Owner ID
//         secret:  "SEC-............", // panel: Install -> Secret ID
//         version: "1.0"
//     );
//
//     IshuAuthApp.init();                                    // session
//     IshuAuthApp.login(username, password);                 // login
//     if (IshuAuthApp.response.success)  { /* unlocked */ }
//     else MessageBox.Show("DENIED: " + IshuAuthApp.response.message);
//
//   Server is already set to the ISHU AUTH cloud below.
//   To run on your own server just change:  api.Server = "http://ip:3000";
// =============================================================

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace ISHU_Auth
{
    public class api
    {
        public string name, ownerid, secret, version;

        /// <summary>ISHU AUTH server — default is the live cloud.
        /// Change this if you host server.py yourself.</summary>
        public static string Server = "https://keyuth-web.onrender.com";

        /// <summary>Last call's result (success / message / ...).</summary>
        public data response = new data();

        public api(string name, string ownerid, string secret, string version)
        {
            this.name = name;
            this.ownerid = ownerid;
            this.secret = secret;
            this.version = version;
        }

        // ---------- init : validate app + secret ----------
        public void init()
        {
            response = Call("/api/init", new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["version"] = version
            });
        }

        // ---------- login : username + password ----------
        public void login(string username, string password)
        {
            response = Call("/api/verify", new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["version"] = version,
                ["user"] = username, ["pass"] = password, ["hwid"] = Fingerprint()
            });
        }

        // ---------- license key login (key-only projects) ----------
        public void license(string key)
        {
            response = Call("/api/verify", new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["version"] = version,
                ["user"] = key, ["pass"] = key, ["hwid"] = Fingerprint()
            });
        }

        // ---------- FULL CONTROL (same as the panel, straight from code) ----------
        // Create / Delete / Ban / Renew / ResetHwid — all with the same
        // name + ownerid + secret. "license" param: TRUE = license-key account,
        // FALSE (default) = username + password account.
        public data Create(string username, string password, string duration = "30d",
                           bool license = false)
        {
            return response = Call("/api/license", new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["version"] = version,
                ["username"] = username, ["password"] = password ?? "",
                ["type"] = license ? "license" : "user", ["duration"] = duration
            });
        }

        // One-line key generator: returns the new LIC_... key (or "" on error).
        public string CreateKey(string duration = "7d")
        {
            Create("k" + Guid.NewGuid().ToString("N").Substring(0, 10), null, duration, true);
            return response.ok ? response.license_key : "";
        }

        public data Delete(string id)
        {
            return response = CallRaw("DELETE", "/api/license/" + id, new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["id"] = id
            });
        }

        public data Ban(string id, bool banned = true)
        {
            return response = Call("/api/license/ban", new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["version"] = version,
                ["id"] = id, ["banned"] = banned ? "true" : "false"
            });
        }

        public data Renew(string id, string duration = "30d")
        {
            return response = Call("/api/license/renew", new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["version"] = version,
                ["id"] = id, ["duration"] = duration
            });
        }

        public data ResetHwid(string id)
        {
            return response = Call("/api/license/resethwid", new Dictionary<string, string>
            {
                ["name"] = name, ["ownerid"] = ownerid, ["secret"] = secret, ["version"] = version,
                ["id"] = id
            });
        }

        // ---------- internals ----------
        static readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

        static data Call(string path, Dictionary<string, string> fields)
        {
            return CallRaw("POST", path, fields);
        }

        static data CallRaw(string method, string path, Dictionary<string, string> fields)
        {
            try
            {
                using var content = new FormUrlEncodedContent(fields);
                var msg = new HttpRequestMessage(new HttpMethod(method), Server + path) { Content = content };
                var res = _http.SendAsync(msg).GetAwaiter().GetResult();
                string json = res.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                return new data
                {
                    success = Regex.IsMatch(json, "\"success\"\\s*:\\s*true"),
                    ok = Regex.IsMatch(json, "\"ok\"\\s*:\\s*true"),
                    message = GrabField(json, "message"),
                    username = GrabField(json, "username"),
                    expiry = GrabField(json, "expires"),
                    appid = GrabField(json, "appid"),
                    license_key = GrabField(json, "license_key"),
                    id = GrabField(json, "id")
                };
            }
            catch (Exception ex)
            {
                return new data { success = false, message = "server unreachable: " + ex.Message };
            }
        }

        static string GrabField(string json, string field)
        {
            var m = Regex.Match(json, "\"" + Regex.Escape(field) + "\"\\s*:\\s*\"(.*?)\"");
            return m.Success ? m.Groups[1].Value : "";
        }

        /// <summary>HWID fingerprint — stable, deterministic device lock.
        /// SHA-256 of the Windows MachineGuid (NOT GetHashCode, which is
        /// randomized per process run and would change on every restart).</summary>
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
            string raw = (string.IsNullOrEmpty(guid) ? Environment.MachineName : guid) +
                         "|" + Environment.MachineName;
            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(raw));
                var sb = new System.Text.StringBuilder(32);
                foreach (byte b in hash) sb.Append(b.ToString("X2"));
                return "HW-" + sb.ToString().Substring(0, 16);
            }
        }
    }

    /// <summary>Result of the last api call (success / message / ...).</summary>
    public class data
    {
        public bool success { get; set; }
        public bool ok { get; set; }
        public string message { get; set; } = "";
        public string username { get; set; } = "";
        public string expiry { get; set; } = "";
        public string appid { get; set; } = "";
        public string license_key { get; set; } = "";
        public string id { get; set; } = "";
    }
}