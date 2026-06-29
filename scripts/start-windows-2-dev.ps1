# Fast-start launcher for the isolated windows-2 dev instance.
param(
    [switch]$ForceFull
)

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ShadowDir = Join-Path $ProjectDir "windows-2"
$TauriConfig = Join-Path $ShadowDir "src-tauri\tauri.conf.test.json"

if (-not (Test-Path $ShadowDir)) {
    Write-Host "[Amiga-Test] ERROR: Shadow directory not found: $ShadowDir"
    Write-Host "[Amiga-Test] Run run-windows-2.bat first to create the mirror."
    exit 1
}

$launcher = Join-Path $PSScriptRoot "start-windows-dev.ps1"
& $launcher `
    -ForceFull:$ForceFull `
    -WorkingDir $ShadowDir `
    -DevPort 1422 `
    -HmrPort 1423 `
    -ExePath (Join-Path $ShadowDir "src-tauri\target-test\debug\idioma.exe") `
    -TauriConfig $TauriConfig `
    -LogPrefix "Amiga-Test" `
    -ExtraEnv @{
        VITE_PORT = "1422"
        VITE_HMR_PORT = "1423"
        IDIOMA_DATA_DIR = Join-Path $env:LOCALAPPDATA "idioma-test"
        IDIOMA_LOG_DIR = Join-Path $env:LOCALAPPDATA "idioma-test\logs"
        CARGO_TARGET_DIR = Join-Path $ShadowDir "src-tauri\target-test"
    }

exit $LASTEXITCODE