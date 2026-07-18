# Windows TV dev launcher. Uses isolated ports and build output so it can
# coexist with the regular mobile-shaped Windows development session.
param(
    [switch]$ForceFull
)

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launcher = Join-Path $PSScriptRoot "start-windows-dev.ps1"

& $launcher `
    -ForceFull:$ForceFull `
    -DevPort 1430 `
    -HmrPort 1431 `
    -ExePath (Join-Path $ProjectDir "src-tauri\target-tv\release\idioma.exe") `
    -TauriConfig (Join-Path $ProjectDir "src-tauri\tauri.tv.conf.json") `
    -LogPrefix "Amiga-TV" `
    -ExtraEnv @{
        VITE_AMIGA_TV = "1"
        VITE_PORT = "1430"
        VITE_HMR_PORT = "1431"
        VITE_CACHE_DIR = "node_modules\.vite-cache-tv"
        CARGO_TARGET_DIR = Join-Path $ProjectDir "src-tauri\target-tv"
    }

exit $LASTEXITCODE
