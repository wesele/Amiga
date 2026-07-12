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
    $ExePath = Join-Path $WorkingDir "src-tauri\target\release\idioma.exe"
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

$DevUrl = "http://localhost:$DevPort"
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
    foreach ($address in [System.Net.Dns]::GetHostAddresses("localhost")) {
        $client = [System.Net.Sockets.TcpClient]::new($address.AddressFamily)
        try {
            $connected = $client.ConnectAsync($address, $Port).Wait(250)
            if ($connected -and $client.Connected) {
                return $true
            }
        } catch {
            continue
        } finally {
            $client.Dispose()
        }
    }
    return $false
}

function Clear-Port {
    param([int]$Port)

    if (-not (Test-PortListening -Port $Port)) {
        Write-AmigaLine "Port $Port is free."
        return
    }

    Write-AmigaLine "Port $Port in use. Cleaning up previous session..."
    $killed = $false

    $pids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)

    foreach ($processId in $pids) {
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

function Start-ViteServer {
    if (Test-ViteReady) {
        Write-AmigaLine "Reusing Vite dev server on port $DevPort."
        return
    }

    $env:VITE_PORT = $DevPort
    $env:VITE_HMR_PORT = $HmrPort
    Write-AmigaLine "Starting Vite dev server on port $DevPort..."
    $viteCli = Join-Path $WorkingDir "node_modules\vite\bin\vite.js"
    if (-not (Test-Path $viteCli)) {
        throw "Vite CLI not found at $viteCli. Run npm install first."
    }
    Start-Process -FilePath "node.exe" -ArgumentList @($viteCli) -WorkingDirectory $WorkingDir -WindowStyle Hidden

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 250
        if (Test-PortListening -Port $DevPort) {
            if (-not (Test-ViteReady)) {
                throw "Port $DevPort opened, but Vite did not respond successfully at $DevUrl."
            }
            Write-AmigaLine "Vite dev server is ready."
            return
        }
    }

    throw "Vite did not become ready at $DevUrl within 15 seconds."
}

function Build-ReleaseBinary {
    Write-AmigaLine "Building changed Rust sources (release profile)..."
    $args = @("build", "--release", "--no-default-features", "--bin", "idioma")
    if ($TauriConfig) {
        $configPath = $TauriConfig
        if (-not [System.IO.Path]::IsPathRooted($configPath)) {
            $configPath = Join-Path $WorkingDir $configPath
        }
        $env:TAURI_CONFIG = Get-Content -Raw (Resolve-Path $configPath)
    }
    & cargo @args --manifest-path (Join-Path $WorkingDir "src-tauri\Cargo.toml")
    if ($LASTEXITCODE -ne 0) {
        throw "Cargo release build failed with exit code $LASTEXITCODE."
    }
}

function Start-ReleaseApp {
    Stop-AmigaProcess
    Write-AmigaLine "Launching cached release binary directly."
    & $ExePath
    return $LASTEXITCODE
}

if (Get-Command sccache -ErrorAction SilentlyContinue) {
    Write-AmigaLine "sccache detected but left disabled: this project's cdylib/proc-macro and native (-L native) deps make every crate non-cacheable (verified: 0 cache writes). Rust rebuild speed comes from CARGO_INCREMENTAL instead."
} else {
    Write-AmigaLine "sccache not found on PATH."
}

Write-AmigaLine "Starting Windows dev session on port $DevPort..."
Write-AmigaLine "Working directory: $WorkingDir"

if ($ForceFull -or $env:AMIGA_FULL_DEV -eq "1") {
    Write-AmigaLine "Full restart requested."
    Clear-Port -Port $DevPort
    Clear-Port -Port $HmrPort
}

$rustFresh = Test-RustBinaryFresh
$viteConfigFresh = Test-ViteConfigFresh

if (-not $viteConfigFresh -and (Test-PortListening -Port $DevPort)) {
    Write-AmigaLine "Frontend configuration changed; restarting Vite."
    Clear-Port -Port $DevPort
    Clear-Port -Port $HmrPort
}

Start-ViteServer

if (-not $rustFresh) {
    Build-ReleaseBinary
} else {
    Write-AmigaLine "Rust release binary is up to date; skipping Cargo entirely."
}

$exitCode = Start-ReleaseApp
exit $exitCode
