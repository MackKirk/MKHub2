# Sage 50 SDK is 32-bit .NET Framework. Do not use `dotnet build` (x64 / net8).
$ErrorActionPreference = "Stop"
$sdk = "C:\Program Files (x86)\Sage 50 Accounting SDK\SDK"
$csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "bin"
New-Item -ItemType Directory -Force -Path $out | Out-Null

if (-not (Test-Path $csc)) { throw "Missing $csc" }
if (-not (Test-Path (Join-Path $sdk "Sage_SA.SDK.dll"))) { throw "Missing Sage SDK at $sdk" }

Write-Host "Copying Sage SDK DLLs to $out"
Copy-Item (Join-Path $sdk "*.dll") $out -Force
if (Test-Path (Join-Path $sdk "CloudID")) {
  Copy-Item (Join-Path $sdk "CloudID\*.dll") $out -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $sdk "fr")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $out "fr") | Out-Null
  Copy-Item (Join-Path $sdk "fr\*.dll") (Join-Path $out "fr") -Force -ErrorAction SilentlyContinue
}

Copy-Item (Join-Path $here "appsettings.json") $out -Force
# Never overwrite an existing bin local file (Sage password / Hub secret).
$srcLocal = Join-Path $here "appsettings.local.json"
$dstLocal = Join-Path $out "appsettings.local.json"
if ((Test-Path $srcLocal) -and -not (Test-Path $dstLocal)) {
  Copy-Item $srcLocal $dstLocal
}

$cs = Get-ChildItem -Path $here -Filter *.cs -Recurse | Where-Object { $_.FullName -notmatch '\\(bin|obj)\\' } | ForEach-Object { $_.FullName }
$refs = @(
  (Join-Path $out "Sage_SA.SDK.dll"),
  (Join-Path $out "Sage_SA.Domain.dll"),
  (Join-Path $out "Sage_SA.Domain.Utility.dll")
) | ForEach-Object { "/reference:`"$_`"" }

Write-Host "Compiling MkHub.SageCompanion.exe (x86 WinForms)"
& $csc /nologo /platform:x86 /target:winexe /out:"$out\MkHub.SageCompanion.exe" @refs `
  /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Data.dll /r:System.dll /r:System.Web.Extensions.dll `
  @cs
if ($LASTEXITCODE -ne 0) { throw "csc failed" }
Write-Host "OK $out\MkHub.SageCompanion.exe"
Write-Host "Run: $out\MkHub.SageCompanion.exe"
