# End-to-end cloud sync restore test on the isolated Windows-2 instance.
# 1. Deploy Cloudflare schema (if wrangler available)
# 2. Seed + push + wipe + restore via Rust E2E test on idioma-test data dir
# 3. Start Amiga-Test (run-windows-2) for visual verification
param(
    [switch]$SkipDeploy,
    [switch]$SkipLaunch
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DataDir = Join-Path $env:LOCALAPPDATA "idioma-test"
$LogDir = Join-Path $DataDir "logs"

Write-Host "[cloud-sync-e2e] Project: $ProjectDir"
Write-Host "[cloud-sync-e2e] Data dir: $DataDir"

if (-not $SkipDeploy) {
    $cfDir = Join-Path $ProjectDir "cloudflare-chat"
    if (Get-Command wrangler -ErrorAction SilentlyContinue) {
        Write-Host "[cloud-sync-e2e] Applying D1 schema..."
        Push-Location $cfDir
        wrangler d1 execute amiga-chat-social-db --remote --file=./schema.sql
        if ($LASTEXITCODE -ne 0) { throw "wrangler d1 execute failed" }
        Write-Host "[cloud-sync-e2e] Deploying worker..."
        wrangler deploy
        if ($LASTEXITCODE -ne 0) { throw "wrangler deploy failed" }
        Pop-Location
    } else {
        Write-Host "[cloud-sync-e2e] wrangler not found; skipping deploy (assuming API is live)"
    }
}

# Stop Amiga-Test if running so we can safely rewrite idioma-test.db
Get-Process -Name "idioma" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Path -like "*target-test*") {
        Write-Host "[cloud-sync-e2e] Stopping Amiga-Test pid $($_.Id)"
        Stop-Process -Id $_.Id -Force
        Start-Sleep -Seconds 2
    }
}

if (Test-Path $DataDir) {
    Write-Host "[cloud-sync-e2e] Clearing previous idioma-test data..."
    Remove-Item -Recurse -Force $DataDir
}
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$env:IDIOMA_DATA_DIR = $DataDir
$env:IDIOMA_LOG_DIR = $LogDir

Write-Host "[cloud-sync-e2e] Running Rust live restore test..."
Push-Location (Join-Path $ProjectDir "src-tauri")
cargo test e2e_restore_after_local_reset -- --test-threads=1 --include-ignored
if ($LASTEXITCODE -ne 0) { throw "E2E restore test failed" }
Pop-Location

Write-Host "[cloud-sync-e2e] Restore test PASSED."
Write-Host "[cloud-sync-e2e] User data should now exist in $DataDir\idioma.db"

if (-not $SkipLaunch) {
    Write-Host "[cloud-sync-e2e] Launching Amiga-Test (run-windows-2.bat --full)..."
    Start-Process -FilePath (Join-Path $ProjectDir "run-windows-2.bat") -ArgumentList "--full" -WorkingDirectory $ProjectDir
    Write-Host "[cloud-sync-e2e] Open Profile + Settings to verify cloud sync is ON and data restored."
}