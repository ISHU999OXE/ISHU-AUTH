ISHU AUTH - C# PACKAGE
======================
Author: ISHU
PACKAGE GUID : 8CD236B4-A8C4-417D-AEDD-3B4D91CDB61B
NAMESPACE    : ISHU_Auth
CLASS        : api (in ISHU_Auth_API.cs) / IshuAuth (in IshuAuth.cs)

What's inside?
  IshuAuth.cs       -> main SDK (drop this into your project)
  ISHU_Auth_API.cs  -> name/ownerid/secret/version style SDK
  Example.cs        -> full working example
  INSTALL-GUIDE.txt -> step-by-step install & use guide (with GUID)
  README.txt        -> this file

INSTALL (do you need any package? NO)
-------------------------------------
1. Run `python server.py` (on your PC or a VPS)
2. Log in to the panel -> copy the MASTER key from the API Keys page
3. Copy the App ID from the Applications page
4. Drop IshuAuth.cs into your C# project's source folder (next to the .sln)
5. Create a user + password or a license key from the Users page
6. Call Verify() in your app:

   var auth = new IshuAuth();
   auth.Server = "http://YOUR-SERVER:3000";   // wherever server.py runs
   auth.ApiKey = "ISHU_XXXX-....";
   auth.AppId  = "APP-XXXXXX";

   var r = await auth.Verify("user123", "pass123", IshuAuth.Fingerprint());
   if (r.Success) Console.WriteLine("LOGIN OK @ " + r.Expires);
   else Console.WriteLine("DENIED: " + r.Message);

   IMPORTANT: ALWAYS pass IshuAuth.Fingerprint() as the HWID. It is a
   stable SHA-256 of the PC's MachineGuid — the SAME PC always gives the
   same value, so the key works across restarts. Never pass GetHashCode()
   or Environment.MachineName as HWID — those change on every launch and
   cause "hwid mismatch" (the "reset HWID" loop you keep hitting).

CONTROL (create/reset/renew/ban — same as the panel)
----------------------------------------------------
   await auth.Create("user2", "pass2", "30d", "user");
   await auth.ResetHwid(licenseId);
   await auth.Renew(licenseId, "7d");
   await auth.Ban(licenseId, true);

What is HWID?  The user's unique device fingerprint
(they can only log in from one PC/phone). With the new SDK the same PC
NEVER needs an HWID reset — only reset it when the user changes PC.
Reset it from the panel (or ResetHwid), then they can do a fresh login.

Android/APK?  Java needs no package - use HttpURLConnection
(see the notice in Example.cs). Flutter just uses the `http` package.

(c) Copyrighted by ISHU