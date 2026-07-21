# TV remote-only focus smoke test.
#
# Prerequisite: start `run-windows-tv.bat` and leave it on the Learn home.
# The script never clicks or moves the mouse; every transition uses the same
# arrows / OK / Back keys emitted by a TV remote.

param(
    [string]$Title = "Amiga TV",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutDir) {
    $OutDir = Join-Path $ProjectDir "screenshots\tv-focus-uat"
}
$ScreenshotScript = Join-Path $PSScriptRoot "screenshot.ps1"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TvFocusUat {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint flags, UIntPtr extra);
    public const uint KEYUP = 0x0002;
    public const byte LEFT = 0x25;
    public const byte UP = 0x26;
    public const byte RIGHT = 0x27;
    public const byte DOWN = 0x28;
    public const byte OK = 0x0D;
    public const byte BACK = 0x1B;
}
"@

function Get-TvProcess {
    $process = Get-Process | Where-Object {
        $_.MainWindowTitle -eq $Title -and $_.MainWindowHandle -ne [IntPtr]::Zero
    } | Select-Object -First 1
    if (-not $process) {
        throw "Window '$Title' not found. Start run-windows-tv.bat first."
    }
    return $process
}

function Focus-Tv {
    $process = Get-TvProcess
    [TvFocusUat]::ShowWindow($process.MainWindowHandle, 9) | Out-Null
    [TvFocusUat]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 250
}

function Send-RemoteKey([byte]$Key, [int]$DelayMs = 450) {
    Focus-Tv
    [TvFocusUat]::keybd_event($Key, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 35
    [TvFocusUat]::keybd_event($Key, 0, [TvFocusUat]::KEYUP, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds $DelayMs
}

function Capture([string]$Name) {
    $path = Join-Path $OutDir "$Name.png"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ScreenshotScript `
        -Mode App -Title $Title -OutFile $path -WaitSeconds 3
    if ($LASTEXITCODE -ne 0) { throw "Screenshot failed: $Name" }
}

Focus-Tv
Capture "01-cold-start-learn"

# Learn: vocab -> path -> open -> Back restores path.
Send-RemoteKey ([TvFocusUat]::DOWN)
Capture "02-learn-path-focus"
Send-RemoteKey ([TvFocusUat]::OK) 1200
Capture "03-path-entry-focus"
Send-RemoteKey ([TvFocusUat]::BACK) 900
Capture "04-learn-path-restored"

# News: open list, reader, Back to the originating card, then Learn.
Send-RemoteKey ([TvFocusUat]::DOWN)
Send-RemoteKey ([TvFocusUat]::OK) 1200
Capture "05-news-list-focus"
Send-RemoteKey ([TvFocusUat]::OK) 1400
Capture "06-news-reader-focus"
Send-RemoteKey ([TvFocusUat]::BACK) 900
Capture "07-news-card-restored"
Send-RemoteKey ([TvFocusUat]::BACK) 900

# Reading: News -> Reading, open list/article and restore the list card.
Send-RemoteKey ([TvFocusUat]::RIGHT)
Send-RemoteKey ([TvFocusUat]::OK) 1200
Capture "08-reading-list-focus"
Send-RemoteKey ([TvFocusUat]::OK) 1400
Capture "09-reading-reader-focus"
Send-RemoteKey ([TvFocusUat]::BACK) 900
Capture "10-reading-card-restored"
Send-RemoteKey ([TvFocusUat]::BACK) 900

# Cross to the rail, switch tabs by focus, and enter Settings.
Send-RemoteKey ([TvFocusUat]::LEFT)
Send-RemoteKey ([TvFocusUat]::LEFT)
Send-RemoteKey ([TvFocusUat]::DOWN) 900
Capture "11-achievements-rail-focus"
Send-RemoteKey ([TvFocusUat]::RIGHT)
Capture "12-achievements-content-focus"
Send-RemoteKey ([TvFocusUat]::LEFT)
Send-RemoteKey ([TvFocusUat]::DOWN) 900
Send-RemoteKey ([TvFocusUat]::RIGHT)
Send-RemoteKey ([TvFocusUat]::DOWN)
Send-RemoteKey ([TvFocusUat]::OK) 900
Capture "13-settings-entry-focus"

# Settings dialog: open News count, Back closes and restores the row.
1..5 | ForEach-Object { Send-RemoteKey ([TvFocusUat]::DOWN) }
Send-RemoteKey ([TvFocusUat]::OK)
Capture "14-settings-dialog-focus"
Send-RemoteKey ([TvFocusUat]::BACK)
Capture "15-settings-dialog-restored"

Write-Host "TV focus UAT completed. Screenshots: $OutDir"
