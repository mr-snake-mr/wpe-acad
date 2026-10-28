# Builds the handover package: dist\wpe-acad-<version>.zip
# Includes the bundled node.exe, so the target machine needs nothing installed.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$version = (Get-Content (Join-Path $root "VERSION.txt") -Raw).Trim().Split("`n")[0].Trim()
if (-not $version) { $version = "0.0.0" }
$name = "wpe-acad-$version"
$stage = Join-Path $root "dist\$name"
$zip = Join-Path $root "dist\$name.zip"

if (Test-Path (Join-Path $root "dist")) { Remove-Item (Join-Path $root "dist") -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$files = @(
  "START-HERE.txt", "README.md", "VERSION.txt", "collect.ps1", "package.json",
  "lisp\WPE.lsp",
  "cli\wpe-plan.js",
  "lib\mapper.js", "lib\aliases.json",
  "docs\CONVENTIONS.md", "docs\RUN-ON-CAD.md", "docs\VERIFICATION.md"
)
foreach ($f in $files) {
  $src = Join-Path $root $f
  if (-not (Test-Path $src)) { throw "missing $f" }
  $dst = Join-Path $stage $f
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item $src $dst
}

# engine + tests travel with it so the target machine can prove itself
Copy-Item (Join-Path $root "engine") (Join-Path $stage "engine") -Recurse
Copy-Item (Join-Path $root "tests") (Join-Path $stage "tests") -Recurse
Get-ChildItem (Join-Path $stage "tests\samples") -File |
  Where-Object { $_.Name -like "*-plan.dxf" -or $_.Name -eq "plan.csv" } |
  Remove-Item -Force

# bundled runtime
$nodeExe = (Get-Command node).Source
New-Item -ItemType Directory -Force -Path (Join-Path $stage "node") | Out-Null
Copy-Item $nodeExe (Join-Path $stage "node\node.exe")

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force

$size = (Get-Item $zip).Length / 1MB
Write-Host ("built {0}  ({1:N1} MB)" -f $zip, $size) -ForegroundColor Green
