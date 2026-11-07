# Run a command in the project root with the Windows toolchain (Rust in D:\rust, MSVC in D:\BuildTools).
# Usage (from WSL):  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File D:\dev\disk-cleaner\scripts\win.ps1 "npm install"
param([Parameter(Mandatory = $true)][string]$Cmd)
$env:RUSTUP_HOME = 'D:\rust\rustup'
$env:CARGO_HOME = 'D:\rust\cargo'
$env:Path = 'D:\rust\cargo\bin;' + $env:Path
$env:CI = 'true'   # keep CLIs non-interactive (tauri wants true/false)
Set-Location (Split-Path -Parent $PSScriptRoot)
cmd.exe /d /c "$Cmd 2>&1"
exit $LASTEXITCODE
