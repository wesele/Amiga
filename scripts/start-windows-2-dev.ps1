$Shadow = "C:\Code\Idioma\windows-2"
Set-Location $Shadow
$env:VITE_PORT = "1422"
$env:VITE_HMR_PORT = "1423"
$env:IDIOMA_DATA_DIR = "$env:LOCALAPPDATA\idioma-test"
$env:IDIOMA_LOG_DIR = "$env:LOCALAPPDATA\idioma-test\logs"
$env:CARGO_TARGET_DIR = "$Shadow\src-tauri\target-test"
Write-Host "[Amiga-Test] Starting on port 1422..."
npx tauri dev --config "$Shadow\src-tauri\tauri.conf.test.json"