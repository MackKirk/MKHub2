$ErrorActionPreference = "Stop"
$sdk = "C:\Program Files (x86)\Sage 50 Accounting SDK\SDK"
$csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "bin"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item (Join-Path $sdk "*.dll") $out -Force
if (Test-Path (Join-Path $sdk "CloudID")) {
  Copy-Item (Join-Path $sdk "CloudID\*.dll") $out -Force -ErrorAction SilentlyContinue
}
$refs = @(
  (Join-Path $out "Sage_SA.SDK.dll"),
  (Join-Path $out "Sage_SA.Domain.dll"),
  (Join-Path $out "Sage_SA.Domain.Utility.dll")
) | ForEach-Object { "/reference:`"$_`"" }
Write-Host "Compiling SageWriteSlip.exe (x86)"
& $csc /nologo /platform:x86 /target:exe /out:"$out\SageWriteSlip.exe" @refs /r:System.Windows.Forms.dll /r:System.Data.dll /r:System.dll "$here\Program.cs"
if ($LASTEXITCODE -ne 0) { throw "csc failed" }
Write-Host "OK $out\SageWriteSlip.exe"
