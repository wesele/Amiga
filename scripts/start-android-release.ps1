# Build, install, and launch the smallest release APK for one Android device.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("x86", "arm")]
    [string]$Platform,
    [switch]$ForceFull
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $ProjectDir

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "C:\Android\sdk"
$env:NDK_HOME = "C:\Android\sdk\ndk\27.0.12077973"
$env:Path = "C:\msys64\mingw64\bin;$($env:Path)"

$Adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
$TauriCli = Join-Path $ProjectDir "node_modules\@tauri-apps\cli\tauri.js"
$PackageName = "com.idioma.app"
$ActivityName = "$PackageName/.MainActivity"

if ($Platform -eq "x86") {
    $Label = "x86_64 emulator"
    $TauriTarget = "x86_64"
    $GradleAbi = "x86_64"
    $RequiredAbi = "x86_64"
} else {
    $Label = "ARM64 physical device"
    $TauriTarget = "aarch64"
    $GradleAbi = "arm64"
    $RequiredAbi = "arm64-v8a"
}

$Apk = Join-Path $ProjectDir "src-tauri\gen\android\app\build\outputs\apk\$GradleAbi\release\app-$GradleAbi-release.apk"
$WatchPaths = @(
    "src",
    "public",
    "index.html",
    "vite.config.js",
    "package.json",
    "package-lock.json",
    "content-studio\data",
    "src-tauri\Cargo.toml",
    "src-tauri\Cargo.lock",
    "src-tauri\build.rs",
    "src-tauri\tauri.conf.json",
    "src-tauri\tauri.android.conf.json",
    "src-tauri\capabilities",
    "src-tauri\src",
    "src-tauri\android",
    "scripts\android-patch.cjs"
)

function Write-AmigaLine([string]$Message) {
    Write-Host "[Amiga] $Message"
}

function Invoke-Adb {
    param([string]$Serial, [string[]]$Arguments)
    $output = & $Adb -s $Serial @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "adb $($Arguments -join ' ') failed for $Serial`n$($output -join [Environment]::NewLine)"
    }
    return $output
}

function Get-DeviceProperty([string]$Serial, [string]$Name) {
    return ((Invoke-Adb -Serial $Serial -Arguments @("shell", "getprop", $Name)) -join "").Trim()
}

function Select-AndroidDevice {
    $lines = & $Adb devices -l 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "adb devices failed.`n$($lines -join [Environment]::NewLine)"
    }

    $connected = @()
    foreach ($line in $lines) {
        if ($line -match '^([^\s]+)\s+device(?:\s|$)') {
            $connected += $Matches[1]
        }
    }

    if ($env:AMIGA_ANDROID_DEVICE) {
        if ($connected -notcontains $env:AMIGA_ANDROID_DEVICE) {
            throw "AMIGA_ANDROID_DEVICE '$($env:AMIGA_ANDROID_DEVICE)' is not connected and authorized."
        }
        $connected = @($env:AMIGA_ANDROID_DEVICE)
    }

    $candidates = @()
    foreach ($serial in $connected) {
        $isEmulator = (Get-DeviceProperty $serial "ro.kernel.qemu") -eq "1"
        $abiList = Get-DeviceProperty $serial "ro.product.cpu.abilist"
        if (-not $abiList) {
            $abiList = Get-DeviceProperty $serial "ro.product.cpu.abi"
        }

        $correctKind = if ($Platform -eq "x86") { $isEmulator } else { -not $isEmulator }
        $hasAbi = ($abiList -split ",") -contains $RequiredAbi
        if ($correctKind -and $hasAbi) {
            $candidates += [pscustomobject]@{ Serial = $serial; Abis = $abiList }
        }
    }

    if ($candidates.Count -eq 0) {
        if ($Platform -eq "x86") {
            throw "No connected x86_64 Android emulator was found. Start the emulator and retry."
        }
        throw "No connected ARM64 physical Android device was found. Connect and authorize a phone, then retry."
    }

    if ($candidates.Count -gt 1 -and -not $env:AMIGA_ANDROID_DEVICE) {
        Write-AmigaLine "Multiple matching devices found; using $($candidates[0].Serial). Set AMIGA_ANDROID_DEVICE to choose another."
    }
    return $candidates[0]
}

function Get-LatestSourceWriteTimeUtc {
    $latest = [datetime]::MinValue
    foreach ($relativePath in $WatchPaths) {
        $path = Join-Path $ProjectDir $relativePath
        if (-not (Test-Path $path)) { continue }
        $item = Get-Item $path
        if ($item.PSIsContainer) {
            Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_.LastWriteTimeUtc -gt $latest) { $latest = $_.LastWriteTimeUtc }
            }
        } elseif ($item.LastWriteTimeUtc -gt $latest) {
            $latest = $item.LastWriteTimeUtc
        }
    }
    return $latest
}

function Test-ApkFresh {
    if ($ForceFull -or -not (Test-Path $Apk)) { return $false }
    return (Get-LatestSourceWriteTimeUtc) -le (Get-Item $Apk).LastWriteTimeUtc
}

function Ensure-AndroidProject {
    if (Test-Path "src-tauri\gen\android") { return }
    Write-AmigaLine "Initializing the generated Android project (first run)..."
    & node $TauriCli android init
    if ($LASTEXITCODE -ne 0) { throw "tauri android init failed with exit code $LASTEXITCODE." }
}

function Ensure-LocalSigningConfig {
    $propertiesPath = Join-Path $ProjectDir "src-tauri\gen\android\app\keystore.properties"
    if (Test-Path $propertiesPath) { return }

    $debugKeystore = Join-Path $env:USERPROFILE ".android\debug.keystore"
    if (-not (Test-Path $debugKeystore)) {
        throw "Neither release keystore.properties nor the standard Android debug keystore exists."
    }

    Write-AmigaLine "Release keystore.properties is absent; using the local Android debug key for this runnable release APK."
    $storeFile = $debugKeystore.Replace("\", "/")
    @(
        "storeFile=$storeFile"
        "storePassword=android"
        "keyAlias=androiddebugkey"
        "keyPassword=android"
    ) | Set-Content -Path $propertiesPath -Encoding ascii
}

function Sync-AndroidSources {
    Write-AmigaLine "Synchronizing tracked Android sources..."
    & node "scripts\android-patch.cjs"
    if ($LASTEXITCODE -ne 0) { throw "Android patch failed with exit code $LASTEXITCODE." }
}

function Build-ReleaseApk {
    Write-AmigaLine "Building $Label release APK only..."
    & node $TauriCli android build --target $TauriTarget --apk --split-per-abi
    if ($LASTEXITCODE -ne 0) { throw "Android release build failed with exit code $LASTEXITCODE." }
    if (-not (Test-Path $Apk)) { throw "Expected APK was not produced: $Apk" }
}

function Get-InstallMarkerPath([string]$Serial) {
    $safeSerial = $Serial -replace '[^A-Za-z0-9_.-]', '_'
    return Join-Path $ProjectDir "src-tauri\target\android-run-cache\$safeSerial-$Platform.txt"
}

function Test-InstallCurrent([string]$Serial) {
    $marker = Get-InstallMarkerPath $Serial
    if (-not (Test-Path $marker)) { return $false }
    $packagePath = (& $Adb -s $Serial shell pm path $PackageName 2>$null) -join ""
    if ($LASTEXITCODE -ne 0 -or $packagePath -notmatch '^package:') { return $false }
    $apkHash = (Get-FileHash $Apk -Algorithm SHA256).Hash
    return (Get-Content -Raw $marker).Trim() -eq $apkHash
}

function Save-InstallMarker([string]$Serial) {
    $marker = Get-InstallMarkerPath $Serial
    New-Item -ItemType Directory -Force (Split-Path $marker) | Out-Null
    Set-Content -Path $marker -Value (Get-FileHash $Apk -Algorithm SHA256).Hash -NoNewline -Encoding ascii
}

if (-not (Test-Path $Adb)) { throw "adb not found at $Adb." }
if (-not (Test-Path $TauriCli)) { throw "Tauri CLI not found. Run npm install first." }

Write-AmigaLine "Looking for a connected $Label..."
$device = Select-AndroidDevice
Write-AmigaLine "Using $($device.Serial) ($($device.Abis))."

Ensure-AndroidProject
Ensure-LocalSigningConfig
Sync-AndroidSources

if (Test-ApkFresh) {
    Write-AmigaLine "APK is newer than all relevant sources; skipping frontend, Rust, and Gradle builds."
} else {
    Build-ReleaseApk
}

if (Test-InstallCurrent $device.Serial) {
    Write-AmigaLine "This exact APK is already installed; skipping adb install."
} else {
    Write-AmigaLine "Installing release APK with data-preserving permissions..."
    Invoke-Adb -Serial $device.Serial -Arguments @("install", "-r", "-g", $Apk) | ForEach-Object { Write-Host $_ }
    Save-InstallMarker $device.Serial
}

Write-AmigaLine "Launching Amiga..."
Invoke-Adb -Serial $device.Serial -Arguments @("shell", "am", "force-stop", $PackageName) | Out-Null
Invoke-Adb -Serial $device.Serial -Arguments @("shell", "am", "start", "-n", $ActivityName) | ForEach-Object { Write-Host $_ }
Write-AmigaLine "Done."
