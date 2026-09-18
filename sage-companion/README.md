# MKHub Sage Companion

Windows tray app for **this test PC only**. It pulls queued hours from MKHub and writes Sage 50 Canada Time Slips into the **Development** company file. FastAPI never opens Sage.

Hub / API / frontend are not imported by this folder.

## Layout

- `MkHub.SageCompanion/` — tray product (run this)
- `tools/SageProbe/` — read-only SDK catalog dump
- `tools/SageWriteSlip/` — one-shot IMP write probe
- `dist/` — zip later, when this is ready for the live Sage PC

## Build (x86, .NET Framework 4.8)

Sage SDK is 32-bit. Do not use `dotnet build` (x64 / net8).

```powershell
cd sage-companion\MkHub.SageCompanion
.\build.ps1
.\bin\MkHub.SageCompanion.exe
```

Requires Sage 50 Premium 2026 and the Sage 50 Accounting SDK on this machine.

## Settings

Defaults point at the Development SAI:

`T:\Databases\2025 MACK KIRK.SAI`

**MKHub queue:** set API URL (`http://127.0.0.1:8000`) and the companion secret. That secret must match `SAGE_COMPANION_SECRET` in the Hub `.env`. Use **Test MKHub queue** before a live sync.

**Dry run** is on by default: Sync now pulls the queue and logs `.IMP` files. It does **not** call `Sage_SA_import.exe` and does **not** ack MKHub (Attendance stays Queued). Uncheck Dry run only when you intend to write test slips and mark those rows **In Sage**.

A sync opens the Sage company **once** to check employees, items, and existing slips, then closes it and runs **one** `Sage_SA_import.exe` for the whole batch (one password prompt). A second Sync now is ignored until that batch finishes. There is no automatic retry.

If Hub URL or secret is empty, Sync still posts one sample Time Slip (legacy test mode). If Hub is configured and the queue is empty, nothing is posted.

Passwords stay in `appsettings.local.json` next to the exe (gitignored). Never commit them. Never point this at the live Sage share.

## Later

When this is solid: zip the `bin` folder for the live Sage PC (same Sage version). An installer is only needed if a prerequisite is missing. Change the SAI path in Settings on that PC.
