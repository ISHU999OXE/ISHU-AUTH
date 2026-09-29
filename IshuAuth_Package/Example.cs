// ISHU AUTH - full working example
// Run: dotnet run  (or drop it into your project)

using System;
using System.Threading.Tasks;

class Example
{
    static async Task Main()
    {
        var auth = new IshuAuth();
        auth.Server = "http://YOUR-SERVER:3000";   // wherever server.py runs
        auth.ApiKey = "ISHU_XXXX-....";          // panel: API Keys page
        auth.AppId  = "APP-XXXXXX";              // panel: Applications page

        // ---------- 1) APP LOGIN ----------
        // Use IshuAuth.Fingerprint() — stable across restarts (SHA-256 of MachineGuid).
        // Do NOT pass GetHashCode() or Environment.MachineName — those are NOT
        // deterministic and will cause "hwid mismatch" on every launch.
        var r = await auth.Verify("user123", "pass123", IshuAuth.Fingerprint());
        if (r.Success)
        {
            Console.WriteLine("LOGIN OK      @ " + r.Expires);
            Console.WriteLine("WELCOME " + r.Username);
        }
        else
        {
            Console.WriteLine("ACCESS DENIED : " + r.Message);
            return; // close the app / go back to the login screen
        }

        // ---------- 2) CONTROL (owner side) ----------
        // Create a new user (or a license key):
        var created = await auth.Create("user2", "pass2", "permanent", "user");
        Console.WriteLine(created.ok ? "User created" : "Create fail: " + created.message);

        // HWID reset -> let the user log in from another PC again:
        // await auth.ResetHwid("<license-id>");
        // await auth.Renew("<license-id>", "30d");
        // await auth.Ban("<license-id>", true);

        Console.WriteLine("ISHU PREMIUM SECURITY LOCK");
    }
}