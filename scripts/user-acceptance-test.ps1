# User acceptance test: navigate Amiga app and capture screenshots per feature.
# Requires Amiga Tauri window running (run-windows.bat / start-windows-dev.ps1).
#
# Usage:
#   powershell -File scripts/user-acceptance-test.ps1
#   powershell -File scripts/user-acceptance-test.ps1 -Round 2 -OutDir screenshots/uat-round2

param(
    [string]$Title = "Amiga",
    [string]$OutDir = "",
    [int]$Round = 1,
    [string]$ScreenshotScript = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutDir) {
    $OutDir = Join-Path $ProjectDir "screenshots\uat-round$Round"
}
if (-not $ScreenshotScript) {
    $ScreenshotScript = Join-Path $ProjectDir "scripts\screenshot.ps1"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class UatUi {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    public const uint LEFTDOWN = 0x0002;
    public const uint LEFTUP = 0x0004;
}
"@

function Get-AmigaProc([string]$WinTitle) {
    Get-Process | Where-Object {
        $_.MainWindowTitle -eq $WinTitle -and $_.MainWindowHandle -ne [IntPtr]::Zero
    } | Select-Object -First 1
}

function Focus-Amiga([string]$WinTitle) {
    $proc = Get-AmigaProc $WinTitle
    if (-not $proc) { throw "Window '$WinTitle' not found. Start run-windows.bat first." }
    [UatUi]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
    [UatUi]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 500
    return $proc
}

function Click-Back([IntPtr]$Handle) {
    # Header back button — top-left of content area
    Click-Relative $Handle 0.08 0.10 1000
}

function Click-Relative([IntPtr]$Handle, [double]$Rx, [double]$Ry, [int]$DelayMs = 800) {
    $rect = New-Object UatUi+RECT
    [UatUi]::GetClientRect($Handle, [ref]$rect) | Out-Null
    $clientW = [int]$rect.Right - [int]$rect.Left
    $clientH = [int]$rect.Bottom - [int]$rect.Top
    $pt = New-Object UatUi+POINT
    $pt.X = [int]($clientW * $Rx)
    $pt.Y = [int]($clientH * $Ry)
    [UatUi]::ClientToScreen($Handle, [ref]$pt) | Out-Null
    [UatUi]::SetCursorPos($pt.X, $pt.Y) | Out-Null
    Start-Sleep -Milliseconds 120
    [UatUi]::mouse_event([UatUi]::LEFTDOWN, 0, 0, 0, 0)
    [UatUi]::mouse_event([UatUi]::LEFTUP, 0, 0, 0, 0)
    Start-Sleep -Milliseconds $DelayMs
}

function Capture-Step {
    param([string]$Id, [string]$Feature, [string]$Description)
    $outFile = Join-Path $OutDir "$Id.png"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ScreenshotScript -Mode App -Title $Title -OutFile $outFile -WaitSeconds 5
    return [ordered]@{
        id          = $Id
        feature     = $Feature
        description = $Description
        screenshot  = $outFile
        timestamp   = (Get-Date -Format "o")
    }
}

# Bottom nav tab centers (4 equal tabs, y ~0.94)
$TabLearn   = @{ X = 0.125; Y = 0.94 }
$TabVocab   = @{ X = 0.375; Y = 0.94 }
$TabChat    = @{ X = 0.625; Y = 0.94 }
$TabProfile = @{ X = 0.875; Y = 0.94 }

# Learn hub tile centers (3-column row below header)
$TilePath        = @{ X = 0.17; Y = 0.28 }
$TileNews        = @{ X = 0.50; Y = 0.28 }
$TileTranslator  = @{ X = 0.83; Y = 0.28 }

Add-Type -AssemblyName System.Windows.Forms

$proc = Focus-Amiga $Title
$steps = @()

# Dismiss any system overlay (share sheet, etc.)
[System.Windows.Forms.SendKeys]::SendWait("{ESC}")
Start-Sleep -Milliseconds 400

function Go-Tab($tab) {
    Click-Relative $proc.MainWindowHandle $tab.X $tab.Y 1200
}

# --- Learn tab ---
$steps += Capture-Step "01-learn-hub" "learn" "Learn hub with module tiles"

# Path module (left tile in 3-col row)
Click-Relative $proc.MainWindowHandle $TilePath.X $TilePath.Y 2000
$steps += Capture-Step "02-path-map" "path" "Learning path map"

# Scroll down on path map if needed, tap first available node
Click-Relative $proc.MainWindowHandle 0.50 0.55 2000
$steps += Capture-Step "03-path-section" "path" "Path section or node detail"

# Back to learn hub
Go-Tab $TabLearn
$steps += Capture-Step "04-learn-hub-return" "learn" "Returned to learn hub"

# --- Vocab tab (before news reader, which hides bottom nav) ---
Go-Tab $TabVocab
$steps += Capture-Step "05-vocab-main" "vocab" "Vocabulary main page"

# Tap a vocab section/card if visible
Click-Relative $proc.MainWindowHandle 0.50 0.35 1500
$steps += Capture-Step "06-vocab-detail" "vocab" "Vocab detail or study view"

# --- Chat tab ---
Go-Tab $TabChat
$steps += Capture-Step "07-chat-main" "chat" "Chat contacts list"

# Social hub button if visible
Click-Relative $proc.MainWindowHandle 0.85 0.08 1500
$steps += Capture-Step "08-chat-social" "chat" "Social hub or header action"

# Open first chat contact
Click-Relative $proc.MainWindowHandle 0.50 0.25 2000
$steps += Capture-Step "09-chat-session" "chat" "Active chat session"

# Chat session hides bottom nav — back out before profile tab
Click-Back $proc.MainWindowHandle

# --- Profile tab ---
Go-Tab $TabProfile
$steps += Capture-Step "10-profile-main" "profile" "Profile main page"

# Settings (scroll area — general settings row is mid-page)
Click-Relative $proc.MainWindowHandle 0.50 0.62 1500
$steps += Capture-Step "11-settings" "profile" "Settings page"

# Back and LLM config
Click-Back $proc.MainWindowHandle
Go-Tab $TabProfile
Click-Relative $proc.MainWindowHandle 0.50 0.78 1500
$steps += Capture-Step "12-profile-llm" "profile" "LLM config or secondary profile item"

# --- News module (last: reader hides bottom nav) ---
Go-Tab $TabLearn
Click-Relative $proc.MainWindowHandle $TileNews.X $TileNews.Y 2000
$steps += Capture-Step "13-news-list" "news" "News article list"

# Open first news article
Click-Relative $proc.MainWindowHandle 0.50 0.30 2000
$steps += Capture-Step "14-news-reader" "news" "News reader view"

# Reader hides bottom nav — back out to restore shell chrome
Click-Back $proc.MainWindowHandle
Click-Back $proc.MainWindowHandle

# Write manifest
$manifest = @{
    round     = $Round
    timestamp = (Get-Date -Format "o")
    outDir    = $OutDir
    steps     = $steps
}
$manifestPath = Join-Path $OutDir "manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host "UAT Round $Round complete: $($steps.Count) screenshots"
Write-Host "Manifest: $manifestPath"