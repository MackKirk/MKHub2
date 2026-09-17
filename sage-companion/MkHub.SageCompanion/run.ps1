# Launch the tray companion from this test PC (no installer yet).
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $here "bin\MkHub.SageCompanion.exe"
if (-not (Test-Path $exe)) {
  & (Join-Path $here "build.ps1")
}
Start-Process $exe
Write-Host "Companion started. Look for MKHub Sage Companion in the system tray (hidden icons)."
Write-Host $exe
