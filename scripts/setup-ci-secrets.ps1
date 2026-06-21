# setup-ci-secrets.ps1
# One-time script that wires the local Android release keystore into the four
# GitHub repository secrets consumed by .github/workflows/release.yml.
#
# Usage (from repo root):
#   pwsh scripts/setup-ci-secrets.ps1
#
# Prerequisites: `gh` CLI authenticated with `repo` scope on this repository.
# Reads (locally, never leaves your machine):
#   - src-tauri/amiga-release.keystore  (gitignored, but must exist)
#   - src-tauri/gen/android/app/keystore.properties  (gitignored, but must exist)
#
# Sets (or updates) these GitHub repository secrets:
#   AMIGA_KEYSTORE_BASE64
#   AMIGA_KEYSTORE_PASSWORD
#   AMIGA_KEY_ALIAS
#   AMIGA_KEY_PASSWORD

$ErrorActionPreference = 'Stop'

$keystorePath = Join-Path $PSScriptRoot '..\src-tauri\amiga-release.keystore'
$propsPath    = Join-Path $PSScriptRoot '..\src-tauri\gen\android\app\keystore.properties'

if (-not (Test-Path -LiteralPath $keystorePath)) {
    throw "Keystore not found at $keystorePath. Restore it from your secure backup first."
}
if (-not (Test-Path -LiteralPath $propsPath)) {
    throw "keystore.properties not found at $propsPath. Run a local Android build at least once so `tauri android init` populates it, or create it manually."
}

Write-Host 'Reading keystore...'
$keystoreBytes = [IO.File]::ReadAllBytes($keystorePath)
$keystoreB64   = [Convert]::ToBase64String($keystoreBytes)

Write-Host 'Reading keystore.properties...'
$props = @{}
foreach ($line in Get-Content -LiteralPath $propsPath) {
    if ($line -match '^\s*([^#=]+?)\s*=\s*(.+?)\s*$') {
        $props[$Matches[1]] = $Matches[2]
    }
}
foreach ($k in 'storePassword','keyAlias','keyPassword') {
    if (-not $props.ContainsKey($k)) { throw "keystore.properties is missing key '$k'." }
}

Write-Host ''
Write-Host 'About to set 4 GitHub repository secrets on:'
gh repo view --json nameWithOwner -q .nameWithOwner
$answer = Read-Host 'Continue? (y/N)'
if ($answer -ne 'y') { Write-Host 'Cancelled.'; exit 0 }

$setSecret = {
    param($name, $value)
    # Pipe value via stdin to avoid leaking it in process list / shell history.
    $value | gh secret set $name --repo (gh repo view --json nameWithOwner -q .nameWithOwner)
    if ($LASTEXITCODE -ne 0) { throw "Failed to set secret $name." }
    Write-Host "  Set $name"
}

Write-Host 'Setting secrets...'
& $setSecret 'AMIGA_KEYSTORE_BASE64'  $keystoreB64
& $setSecret 'AMIGA_KEYSTORE_PASSWORD' $props['storePassword']
& $setSecret 'AMIGA_KEY_ALIAS'         $props['keyAlias']
& $setSecret 'AMIGA_KEY_PASSWORD'      $props['keyPassword']

Write-Host ''
Write-Host 'Done. Verify with:'
Write-Host '  gh secret list'
