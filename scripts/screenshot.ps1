# scripts/screenshot.ps1
# Capture screenshots of the Amiga app (two modes).
# PowerShell 5.1+ compatible. No external dependencies (uses Microsoft Edge for headless).
#
# Usage:
#   pwsh scripts/screenshot.ps1                                                       # Auto: Amiga window if up, else Vite headless at "/"
#   pwsh scripts/screenshot.ps1 -OutFile screenshots/news.png
#   pwsh scripts/screenshot.ps1 -Mode Headless -Url http://localhost:1420/vocab      # Explicit headless
#   pwsh scripts/screenshot.ps1 -Mode Headless -Url http://localhost:1420/news -OutFile screenshots/news-after.png
#   pwsh scripts/screenshot.ps1 -Mode App -Title "Amiga"                             # Explicit app window
#   pwsh scripts/screenshot.ps1 -Mode App -FullScreen                                 # Capture whole primary screen instead of window
#
# Exit codes: 0 = ok, 1 = error (window not found, Vite not up, Edge not found, etc.)

[CmdletBinding()]
param(
    [ValidateSet("Auto", "App", "Headless")]
    [string]$Mode = "Auto",
    [string]$Title = "Amiga",
    [string]$Url = "http://localhost:1420/",
    [string]$OutFile = "",
    [switch]$FullScreen,
    [int]$Width = 480,
    [int]$Height = 800,
    [string]$EdgePath = "",
    [int]$WaitSeconds = 10
)

$ErrorActionPreference = "Stop"

function Resolve-OutFile {
    param([string]$Path)
    if ($Path) { return $Path }
    $dir = Join-Path (Get-Location) "screenshots"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    return Join-Path $dir ("capture-{0:yyyyMMdd-HHmmss}.png" -f (Get-Date))
}

function Ensure-ParentDir {
    param([string]$Path)
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
}

function Find-AmigaWindow {
    param([string]$WinTitle, [int]$Seconds)
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@ -ErrorAction SilentlyContinue
    $proc = $null
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        $proc = Get-Process | Where-Object {
            $_.MainWindowTitle -eq $WinTitle -and $_.MainWindowHandle -ne [IntPtr]::Zero
        } | Select-Object -First 1
        if ($proc) { break }
        Start-Sleep -Milliseconds 200
    }
    return $proc
}

function Capture-AppWindow {
    param([string]$WinTitle, [string]$Out, [int]$WaitSec, [switch]$Full)

    $proc = Find-AmigaWindow -WinTitle $WinTitle -Seconds $WaitSec
    if (-not $proc) {
        throw "Window with title '$WinTitle' not found (waited $WaitSec s). Start the app via run-windows.bat, or use -Mode Headless with Vite dev server."
    }
    [Win32]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null   # SW_RESTORE
    [Win32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 400

    Add-Type -AssemblyName System.Drawing

    if ($Full) {
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $w = $screen.Width; $h = $screen.Height
        $x = $screen.X; $y = $screen.Y
    } else {
        $r = New-Object Win32+RECT
        [Win32]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
        $w = $r.Right  - $r.Left
        $h = $r.Bottom - $r.Top
        $x = $r.Left; $y = $r.Top
        if ($w -le 0 -or $h -le 0) { throw "Window has zero size" }
    }
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
    } catch {
        $g.Dispose(); $bmp.Dispose()
        throw "CopyFromScreen failed: $_"
    }
    Ensure-ParentDir -Path $Out
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

function Find-Edge {
    if ($EdgePath -and (Test-Path $EdgePath)) { return $EdgePath }
    $cmd = Get-Command msedge -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
    )
    if (${env:ProgramFiles(x86)}) {
        $candidates += Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
    }
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    throw "Microsoft Edge not found. Install Edge or pass -EdgePath."
}

function Test-ViteUp {
    param([string]$U)
    $uri = [System.Uri]$U
    $port = if ($uri.IsDefaultPort) { 80 } else { $uri.Port }
    $hostname = $uri.Host

    # Try IPv4, then IPv6 (Vite often binds only to ::1 on Windows)
    foreach ($family in @("InterNetwork", "InterNetworkV6")) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient($family)
            $client.Connect($hostname, $port)
            $client.Close()
            return $true
        } catch {
            # try next family
        }
    }
    return $false
}

function Capture-Headless {
    param([string]$Edge, [string]$U, [string]$Out, [int]$W, [int]$H)

    if (-not (Test-ViteUp -U $U)) {
        throw "Vite dev server not reachable at $U. Start with 'npm run dev' first."
    }
    Ensure-ParentDir -Path $Out
    $absOut = (Resolve-Path -LiteralPath (Split-Path -Parent $Out) -ErrorAction SilentlyContinue).Path
    if (-not $absOut) { $absOut = (Get-Location).Path }
    $absOut = Join-Path $absOut (Split-Path -Leaf $Out)

    $argList = @(
        "--headless=new"
        "--disable-gpu"
        "--hide-scrollbars"
        "--no-first-run"
        "--no-default-browser-check"
        "--disable-features=Translate,BackForwardCache"
        "--virtual-time-budget=5000"
        "--window-size=$W,$H"
        "--no-sandbox"
        "--screenshot=`"$absOut`""
        "`"$U`""
    )
    $p = Start-Process -FilePath $Edge -ArgumentList $argList -PassThru -Wait -WindowStyle Hidden
    if ($p.ExitCode -ne 0) {
        throw "msedge exited with code $($p.ExitCode)"
    }
    if (-not (Test-Path $absOut)) {
        throw "msedge ran but did not produce $absOut"
    }
}

# ─── main ───

Add-Type -AssemblyName System.Windows.Forms

if ($Mode -eq "App") {
    $out = Resolve-OutFile -Path $OutFile
    Capture-AppWindow -WinTitle $Title -Out $out -WaitSec $WaitSeconds -Full:$FullScreen
    Write-Host "Saved (app): $out"
    return
}

if ($Mode -eq "Headless") {
    $edge = Find-Edge
    $out = Resolve-OutFile -Path $OutFile
    Capture-Headless -Edge $edge -U $Url -Out $out -W $Width -H $Height
    Write-Host "Saved (headless): $out"
    return
}

# Mode = Auto: try App first
try {
    $out = Resolve-OutFile -Path $OutFile
    Capture-AppWindow -WinTitle $Title -Out $out -WaitSec 1 -Full:$FullScreen
    Write-Host "Saved (app): $out"
    return
} catch {
    # fall through to headless
    Write-Verbose "App capture failed: $_"
}

try {
    $edge = Find-Edge
    $out = Resolve-OutFile -Path $OutFile
    Capture-Headless -Edge $edge -U $Url -Out $out -W $Width -H $Height
    Write-Host "Saved (headless fallback): $out"
} catch {
    Write-Error $_
    exit 1
}
