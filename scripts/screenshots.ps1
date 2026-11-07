# Capture README screenshots from the dev server (mock data) with headless Edge.
# Prerequisite: `npm run dev` is running on http://localhost:1420.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\screenshots.ps1
$ErrorActionPreference = 'Continue'   # Edge logs harmless noise to stderr
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'docs\images'
New-Item -ItemType Directory -Force $out | Out-Null
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP 'cleaner-max-shots'   # throwaway profile, never the user's

$shots = [ordered]@{
  'overview-light' = 'page=overview&theme=light'
  'overview-dark'  = 'page=overview&theme=dark'
  'caches'         = 'page=caches&theme=light'
  'clean-dialog'   = 'page=caches&theme=dark&dialog=clean'
  'projects'       = 'page=projects&theme=light'
  'system'         = 'page=system&theme=dark'
  'history'        = 'page=history&theme=light'
}

foreach ($name in $shots.Keys) {
  $file = Join-Path $out "$name.png"
  $url = "http://localhost:1420/?$($shots[$name])"
  & $edge --headless=new --disable-gpu --hide-scrollbars --no-first-run "--user-data-dir=$profile" `
    --window-size=1440,900 --force-device-scale-factor=2 --virtual-time-budget=8000 `
    "--screenshot=$file" $url 2>$null | Out-Null
  if (Test-Path $file) { "{0,-16} {1,8:N0} KB" -f $name, ((Get-Item $file).Length / 1KB) } else { "$name FAILED" }
}
