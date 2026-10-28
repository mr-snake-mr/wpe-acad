# Collects everything needed to diagnose a failed run.
# Usage:  powershell -ExecutionPolicy Bypass -File collect.ps1 -DrawingFolder "C:\Projects\Cell 12"

param(
  [Parameter(Mandatory = $true)][string]$DrawingFolder,
  [string]$Out = "$env:USERPROFILE\Desktop\wpe-diagnostics.zip"
)

if (-not (Test-Path $DrawingFolder)) {
  Write-Host "Folder not found: $DrawingFolder" -ForegroundColor Red
  exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$stage = Join-Path $env:TEMP ("wpe-diag-" + $stamp)
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# diagnostics the LISP wrote next to the drawing
Get-ChildItem $DrawingFolder -File -Include *.csv, *.txt -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "wpe-*" } |
  Copy-Item -Destination $stage -Force

# environment
$envFile = Join-Path $stage "environment.txt"
"collected," + (Get-Date -Format "s") | Out-File $envFile -Encoding UTF8
"computer," + $env:COMPUTERNAME | Out-File $envFile -Append -Encoding UTF8
"user," + $env:USERNAME | Out-File $envFile -Append -Encoding UTF8
"powershell," + $PSVersionTable.PSVersion.ToString() | Out-File $envFile -Append -Encoding UTF8
$versionFile = Join-Path $PSScriptRoot "VERSION.txt"
if (Test-Path $versionFile) {
  "package," + (Get-Content $versionFile -Raw).Trim() | Out-File $envFile -Append -Encoding UTF8
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $Out -Force
Remove-Item $stage -Recurse -Force

Write-Host ""
Write-Host "Wrote $Out" -ForegroundColor Green
Write-Host "Contents:"
Get-ChildItem $Out | ForEach-Object { Write-Host ("  {0}  {1:N1} KB" -f $_.Name, ($_.Length / 1KB)) }
Write-Host ""
Write-Host "Send that zip back, plus the AutoCAD command-window text (F2, copy all)."
