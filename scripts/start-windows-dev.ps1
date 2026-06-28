# Amiga Windows dev launcher with fast-start when sources are unchanged.
param(
    [switch]$ForceFull,
    [string]$WorkingDir = "",
    [int]$DevPort = 1420,
    [int]$HmrPort = 1421,
    [string]$ExePath = "",
    [string]$TauriConfig = "",
    [string]$LogPrefix = "Amiga",
    [hashtable]$ExtraEnv = @{}
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($WorkingDir)) {
    $WorkingDir = $ProjectDir
} else {
    $WorkingDir = (Resolve-Path $WorkingDir).Path
}

Set-Location $WorkingDir

if ([string]::IsNullOrWhiteSpace($ExePath)) {
    $ExePath = Join-Path $WorkingDir "src-tauri\target\debug\idioma.exe"
} else {
    $requestedExe = $ExePath
    $resolvedExe = Resolve-Path $requestedExe -ErrorAction SilentlyContinue
    if ($resolvedExe) {
        $ExePath = $resolvedExe.Path
    } elseif ([System.IO.Path]::IsPathRooted($requestedExe)) {
        $ExePath = $requestedExe
    } else {
        $ExePath = Join-Path $WorkingDir $requestedExe
    }
}

$DevUrl = "http://127.0.0.1:$DevPort"
$ViteCacheDir = Join-Path $WorkingDir "node_modules\.vite-cache"

$RustWatchRoots = @(
    "src-tauri\Cargo.toml",
    "src-tauri\Cargo.lock",
    "src-tauri\build.rs",
    "src-tauri\tauri.conf.json",
    "src-tauri\tauri.conf.test.json",
    "src-tauri\capabilities",
    "src-tauri\src"
)

$FrontendConfigFiles = @(
    "vite.config.js",
    "package.json",
    "package-lock.json"
)

foreach ($key in $ExtraEnv.Keys) {
    Set-Item -Path "env:$key" -Value $ExtraEnv[$key]
}

function Write-AmigaLine {
    param([string]$Message)
    Write-Host "[$LogPrefix] $Message"
}

function Test-PortListening {
    param([int]$Port)
    $matches = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING"
    return [bool]$matches
}

function Clear-Port {
    param([int]$Port)

    if (-not (Test-PortListening -Port $Port)) {
        Write-AmigaLine "Port $Port is free."
        return
    }

    Write-AmigaLine "Port $Port in use. Cleaning up previous session..."
    $killed = $false
    $pids = @()

    netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING" | ForEach-Object {
        $parts = ($_ -split "\s+") | Where-Object { $_ -ne "" }
        if ($parts.Length -ge 5) {
            $pids += [int]$parts[-1]
        }
    }

    foreach ($processId in ($pids | Sort-Object -Unique)) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            $killed = $true
        } catch {
            Write-AmigaLine "Warning: failed to kill PID $processId for port $Port."
        }
    }

    if ($killed) {
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Seconds 1
            if (-not (Test-PortListening -Port $Port)) {
                return
            }
        }
        Write-AmigaLine "Warning: port $Port still appears busy after cleanup."
    }
}

function Test-ViteReady {
    try {
        $response = Invoke-WebRequest -Uri $DevUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-LatestWriteTimeUtc {
    param([string[]]$Paths)

    $latest = [datetime]::MinValue
    foreach ($relativePath in $Paths) {
        $fullPath = Join-Path $WorkingDir $relativePath
        if (-not (Test-Path $fullPath)) {
            continue
        }

        $item = Get-Item $fullPath
        if ($item.PSIsContainer) {
            Get-ChildItem -Path $fullPath -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_.LastWriteTimeUtc -gt $latest) {
                    $latest = $_.LastWriteTimeUtc
                }
            }
        } elseif ($item.LastWriteTimeUtc -gt $latest) {
            $latest = $item.LastWriteTimeUtc
        }
    }

    return $latest
}

function Test-RustBinaryFresh {
    if (-not (Test-Path $ExePath)) {
        return $false
    }

    $exeTime = (Get-Item $ExePath).LastWriteTimeUtc
    $latestSource = Get-LatestWriteTimeUtc -Paths $RustWatchRoots
    return $latestSource -le $exeTime
}

function Test-ViteConfigFresh {
    if (-not (Test-Path $ViteCacheDir)) {
        return $false
    }

    $cacheTime = (Get-Item $ViteCacheDir).LastWriteTimeUtc
    foreach ($relativePath in $FrontendConfigFiles) {
        $fullPath = Join-Path $WorkingDir $relativePath
        if ((Test-Path $fullPath) -and (Get-Item $fullPath).LastWriteTimeUtc -gt $cacheTime) {
            return $false
        }
    }

    return $true
}

function Stop-AmigaProcess {
    $exePathNormalized = (Resolve-Path $ExePath -ErrorAction SilentlyContinue).Path
    if (-not $exePathNormalized) {
        return
    }

    Get-CimInstance Win32_Process -Filter "Name='idioma.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $exePathNormalized } |
        ForEach-Object {
            Write-AmigaLine "Stopping stale Amiga process (PID $($_.ProcessId))..."
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

function Invoke-TauriDev {
    param(
        [string[]]$ExtraArgs
    )

    $args = @("tauri", "dev")
    if ($TauriConfig) {
        $args += @("--config", $TauriConfig)
    }
    $args += $ExtraArgs

    Write-AmigaLine ("Running: npx " + ($args -join " "))
    & npx @args
    return $LASTEXITCODE
}

Write-AmigaLine "Starting Windows dev session on port $DevPort..."
Write-AmigaLine "Working directory: $WorkingDir"

if ($ForceFull -or $env:AMIGA_FULL_DEV -eq "1") {
    Write-AmigaLine "Full restart requested."
    Clear-Port -Port $DevPort
    Clear-Port -Port $HmrPort
    $exitCode = Invoke-TauriDev
    exit $exitCode
}

$rustFresh = Test-RustBinaryFresh
$viteReady = Test-ViteReady
$viteConfigFresh = Test-ViteConfigFresh

if ($rustFresh -and $viteReady -and $viteConfigFresh) {
    Write-AmigaLine "Fast start: reusing Vite dev server and cached Rust binary."
    Stop-AmigaProcess
    $env:TAURI_CLI_NO_DEV_SERVER_WAIT = "1"
    $exitCode = Invoke-TauriDev -ExtraArgs @("--no-dev-server")
    exit $exitCode
}

if ($rustFresh) {
    Write-AmigaLine "Quick start: Rust binary is up to date; rebuilding only Vite if needed."
    Clear-Port -Port $DevPort
    Clear-Port -Port $HmrPort
    $exitCode = Invoke-TauriDev
    exit $exitCode
}

Write-AmigaLine "Full start: Rust sources changed or debug binary missing."
Clear-Port -Port $DevPort
Clear-Port -Port $HmrPort
$exitCode = Invoke-TauriDev
exit $exitCode