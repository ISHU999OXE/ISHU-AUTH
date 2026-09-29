using System;
using ISHU_Auth;

class Program
{
    // ISHU AUTH style — name / ownerid / secret / version, no API key.
    // Get Owner ID + Secret from: panel -> Install page.
    private static readonly api IshuAuthApp = new api(
        name:    "APP-1LHEK3",
        ownerid: "IHH231792GMAILCOM-OFPDR",
        secret:  "SEC_fV0a-6poU-U6sp-xmAN-Wimi-j3ZF-D2HE-d5Hh",
        version: "1.0"
    );

    static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--full")
        {
            FullControl();
            return;
        }

        if (args.Length > 0 && args[0] == "--license")
        {
            string lk = args.Length > 1 ? args[1] : "";
            Console.WriteLine("Server : " + api.Server);
            Console.WriteLine("App    : " + IshuAuthApp.name + " v" + IshuAuthApp.version);
            Console.Write("init() ");
            IshuAuthApp.init();
            Console.WriteLine(IshuAuthApp.response.success ? "OK" : "FAIL: " + IshuAuthApp.response.message);
            Console.Write("license(" + lk + ") ");
            IshuAuthApp.license(lk);
            Console.WriteLine(IshuAuthApp.response.success
                ? "=> LOGIN OK @ " + IshuAuthApp.response.expiry
                : "=> DENIED: " + IshuAuthApp.response.message);
            return;
        }

        string user = args.Length > 0 ? args[0] : "username";
        string pass = args.Length > 1 ? args[1] : "password";

        Console.WriteLine("Server : " + api.Server);
        Console.WriteLine("App    : " + IshuAuthApp.name + " v" + IshuAuthApp.version);

        Console.Write("init() ");
        IshuAuthApp.init();
        Console.WriteLine(IshuAuthApp.response.success ? "OK" : "FAIL: " + IshuAuthApp.response.message);

        Console.Write("login(" + user + ") ");
        IshuAuthApp.login(user, pass);
        Console.WriteLine(IshuAuthApp.response.success
            ? "=> LOGIN OK @ " + IshuAuthApp.response.expiry
            : "=> DENIED: " + IshuAuthApp.response.message);

        return;
    }

    // Full control demo: create -> login -> ban -> unban -> login -> delete
    static void FullControl()
    {
        IshuAuthApp.init();
        Console.WriteLine("Server : " + api.Server);
        Console.WriteLine("App    : " + IshuAuthApp.name + " (ownerid " + IshuAuthApp.ownerid + ")");

        string u = "ctl" + Environment.TickCount.ToString("X");

        Console.Write("create(" + u + ") ");
        var c = IshuAuthApp.Create(u, "pass123", "30d");
        Console.WriteLine(c.ok ? "OK id=" + c.id : "FAIL: " + c.message);
        string id = c.id;

        Console.Write("login(" + u + ") ");
        IshuAuthApp.login(u, "pass123");
        Console.WriteLine(IshuAuthApp.response.success ? "LOGIN OK @ " + IshuAuthApp.response.expiry : "DENIED: " + IshuAuthApp.response.message);

        Console.Write("ban(" + u + ") ");
        IshuAuthApp.Ban(id, true);
        Console.WriteLine(IshuAuthApp.response.message);

        Console.Write("login(" + u + ") again ");
        IshuAuthApp.login(u, "pass123");
        Console.WriteLine(IshuAuthApp.response.success ? "OK (UNEXPECTED)" : "DENIED: " + IshuAuthApp.response.message);

        Console.Write("unban(" + u + ") ");
        IshuAuthApp.Ban(id, false);
        Console.WriteLine(IshuAuthApp.response.message);

        Console.Write("delete(" + u + ") ");
        var d = IshuAuthApp.Delete(id);
        Console.WriteLine(d.ok ? "DELETED" : "FAIL: " + d.message);

        Console.Write("login(" + u + ") after delete ");
        IshuAuthApp.login(u, "pass123");
        Console.WriteLine(IshuAuthApp.response.success ? "OK (UNEXPECTED)" : "DENIED: " + IshuAuthApp.response.message);

        Console.Write("CreateKey(7d) ");
        string lk = IshuAuthApp.CreateKey("7d");
        Console.WriteLine(lk.Length > 0 ? lk : "FAIL");
        if (lk.Length > 0)
        {
            Console.Write("license(" + lk + ") ");
            IshuAuthApp.license(lk);
            Console.WriteLine(IshuAuthApp.response.success ? "LOGIN OK @ " + IshuAuthApp.response.expiry : "DENIED: " + IshuAuthApp.response.message);
        }

        Console.WriteLine("== FULL CONTROL OK ==");
    }
}