# TV user acceptance test: navigate Amiga TV (left rail + 16:9 content)
# and capture screenshots of key surfaces for layout/ops review.
#
# Prerequisites: Amiga TV window running (run-windows-tv.bat).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tv-uat.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tv-uat.ps1 -OutDir screenshots/tv-uat

param(
    [string]$Title = "Amiga TV",
    [string]$OutDir = "",
    [string]$ScreenshotScript = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutDir) {
    $OutDir = Join-Path $ProjectDir "screenshots\tv-uat"
}
if (-not $ScreenshotScript) {
    $ScreenshotScript = Join-Path $ProjectDir "scripts\screenshot.ps1"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TvUatUi {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    public const uint LEFTDOWN = 0x0002;
    public const uint LEFTUP = 0x0004;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const byte VK_LEFT = 0x25;
    public const byte VK_UP = 0x26;
    public const byte VK_RIGHT = 0x27;
    public const byte VK_DOWN = 0x28;
    public const byte VK_RETURN = 0x0D;
    public const byte VK_ESCAPE = 0x1B;
    public const byte VK_TAB = 0x09;
}
"@

Add-Type -AssemblyName System.Windows.Forms

function Get-AmigaProc([string]$WinTitle) {
    Get-Process | Where-Object {
        $_.MainWindowTitle -eq $WinTitle -and $_.MainWindowHandle -ne [IntPtr]::Zero
    } | Select-Object -First 1
}

function Focus-Amiga([string]$WinTitle) {
    $proc = Get-AmigaProc $WinTitle
    if (-not $proc) { throw "Window '$WinTitle' not found. Start run-windows-tv.bat first." }
    [TvUatUi]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
    [TvUatUi]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 500
    return $proc
}

function Click-Relative([IntPtr]$Handle, [double]$Rx, [double]$Ry, [int]$DelayMs = 900) {
    $rect = New-Object TvUatUi+RECT
    [TvUatUi]::GetClientRect($Handle, [ref]$rect) | Out-Null
    $clientW = [int]$rect.Right - [int]$rect.Left
    $clientH = [int]$rect.Bottom - [int]$rect.Top
    $pt = New-Object TvUatUi+POINT
    $pt.X = [int]($clientW * $Rx)
    $pt.Y = [int]($clientH * $Ry)
    [TvUatUi]::ClientToScreen($Handle, [ref]$pt) | Out-Null
    [TvUatUi]::SetCursorPos($pt.X, $pt.Y) | Out-Null
    Start-Sleep -Milliseconds 100
    [TvUatUi]::mouse_event([TvUatUi]::LEFTDOWN, 0, 0, 0, 0)
    [TvUatUi]::mouse_event([TvUatUi]::LEFTUP, 0, 0, 0, 0)
    Start-Sleep -Milliseconds $DelayMs
}

function Send-Key([byte]$Vk, [int]$DelayMs = 350) {
    [TvUatUi]::keybd_event($Vk, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [TvUatUi]::keybd_event($Vk, 0, [TvUatUi]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds $DelayMs
}

function Capture-Step {
    param([string]$Id, [string]$Feature, [string]$Description)
    $outFile = Join-Path $OutDir "$Id.png"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ScreenshotScript -Mode App -Title $Title -OutFile $outFile -WaitSeconds 5
    Write-Host "  captured $Id — $Description"
    return [ordered]@{
        id          = $Id
        feature     = $Feature
        description = $Description
        screenshot  = $outFile
        timestamp   = (Get-Date -Format "o")
    }
}

# TV shell: left rail ~220/1280 ≈ 0.17 of width, TOP-ALIGNED (flex-start).
# Three L1 tabs: Learn / Achievements / Profile ("Me"), packed from the top.
$RailX = 0.08
$TabLearn        = @{ X = $RailX; Y = 0.12 }
$TabAchievements = @{ X = $RailX; Y = 0.24 }
$TabProfile      = @{ X = $RailX; Y = 0.36 }

# Learn hub content (after left rail). Compact path card + News/Reading on first screen.
$ContentPathCard = @{ X = 0.55; Y = 0.38 }
$ContentNewsTile = @{ X = 0.40; Y = 0.72 }
$ContentReading  = @{ X = 0.72; Y = 0.72 }
$ContentVocabStat= @{ X = 0.35; Y = 0.18 }
$BackBtn         = @{ X = 0.26; Y = 0.10 }

$proc = Focus-Amiga $Title
$steps = @()

Write-Host "TV UAT starting on window '$Title'"

# Dismiss overlays
Send-Key ([TvUatUi]::VK_ESCAPE) 300
Send-Key ([TvUatUi]::VK_ESCAPE) 300

# ========== L1: Learn hub ==========
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 1400
$steps += Capture-Step "01-learn-hub" "learn" "Learn hub home (path card + module tiles)"

# Remote focus walk on hub
Focus-Amiga $Title | Out-Null
1..6 | ForEach-Object { Send-Key ([TvUatUi]::VK_DOWN) 280 }
$steps += Capture-Step "01b-learn-hub-focus-down" "remote" "After ArrowDown sequence on Learn hub"

1..4 | ForEach-Object { Send-Key ([TvUatUi]::VK_RIGHT) 280 }
$steps += Capture-Step "01c-learn-hub-focus-right" "remote" "After ArrowRight sequence on Learn hub"

# ========== Path ==========
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 900
Click-Relative $proc.MainWindowHandle $ContentPathCard.X $ContentPathCard.Y 2200
$steps += Capture-Step "02-path-map" "path" "Learning path map / curriculum"

# Try open a node/section
Click-Relative $proc.MainWindowHandle 0.55 0.50 2200
$steps += Capture-Step "03-path-section" "path" "Path section / lesson entry"

# Remote on path
Focus-Amiga $Title | Out-Null
1..4 | ForEach-Object { Send-Key ([TvUatUi]::VK_DOWN) 280 }
$steps += Capture-Step "03b-path-focus" "remote" "Remote focus walk on path surface"

# Back toward learn
Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1200
Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1200
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 1200
$steps += Capture-Step "04-learn-hub-return" "learn" "Returned to Learn hub"

# ========== News ==========
# Prefer remote focus walk to News tile (more reliable than absolute click after
# compact hub layout): Words stat -> Path card -> News.
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 900
Click-Relative $proc.MainWindowHandle $ContentVocabStat.X $ContentVocabStat.Y 500
1..6 | ForEach-Object { Send-Key ([TvUatUi]::VK_DOWN) 220 }
Send-Key ([TvUatUi]::VK_RETURN) 1800
# Fallback absolute click if focus walk lands elsewhere
if (-not (Get-Process | Where-Object { $_.MainWindowTitle -eq $Title })) { throw "Amiga TV lost" }
$steps += Capture-Step "05-news-list" "news" "News article list"

# Open first article via content click (card body, not source link)
Click-Relative $proc.MainWindowHandle 0.55 0.34 2200
Start-Sleep -Milliseconds 1500
$steps += Capture-Step "06-news-reader" "news" "News reader (original/non-blocking + L1 rail)"

# Reader remote + scroll-like downs
Focus-Amiga $Title | Out-Null
1..5 | ForEach-Object { Send-Key ([TvUatUi]::VK_DOWN) 250 }
$steps += Capture-Step "06b-news-reader-focus" "remote" "Remote focus inside news reader"

# Back out of reader + list
Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1100
Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1100
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 1100

# ========== Reading ==========
Click-Relative $proc.MainWindowHandle $ContentReading.X $ContentReading.Y 2000
$steps += Capture-Step "07-reading-list" "reading" "Graded reading list"

Click-Relative $proc.MainWindowHandle 0.55 0.40 2200
$steps += Capture-Step "08-reading-article" "reading" "Reading article detail"

Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1100
Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1100
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 1100

# ========== Vocab via stats cell ==========
Click-Relative $proc.MainWindowHandle $ContentVocabStat.X $ContentVocabStat.Y 1800
$steps += Capture-Step "09-vocab" "vocab" "Vocabulary page from stats cell"

Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1100
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 900

# ========== Achievements L1 ==========
Click-Relative $proc.MainWindowHandle $TabAchievements.X $TabAchievements.Y 1400
$steps += Capture-Step "10-achievements" "achievements" "Achievements matrix + badges"

# Scroll content via wheel-ish: click mid-page then down keys (no page scroll keys)
Focus-Amiga $Title | Out-Null
Click-Relative $proc.MainWindowHandle 0.55 0.55 400
1..8 | ForEach-Object { Send-Key ([TvUatUi]::VK_DOWN) 220 }
$steps += Capture-Step "10b-achievements-lower" "achievements" "Achievements after remote downs (badges area?)"

# ========== Profile L1 ==========
Click-Relative $proc.MainWindowHandle $TabProfile.X $TabProfile.Y 1400
$steps += Capture-Step "11-profile" "profile" "Profile main (UI lang + general)"

# Open learning settings
Click-Relative $proc.MainWindowHandle 0.55 0.62 1600
$steps += Capture-Step "12-settings" "profile" "Learning settings page"

# Remote on settings
Focus-Amiga $Title | Out-Null
1..6 | ForEach-Object { Send-Key ([TvUatUi]::VK_DOWN) 280 }
$steps += Capture-Step "12b-settings-focus" "remote" "Remote focus walk on settings"

Click-Relative $proc.MainWindowHandle $BackBtn.X $BackBtn.Y 1100
$steps += Capture-Step "13-profile-return" "profile" "Back to profile"

# UI language pills area
Click-Relative $proc.MainWindowHandle 0.45 0.42 1000
$steps += Capture-Step "14-profile-lang" "profile" "UI language section focus/click"

# ========== Rail focus / cross-tab remote ==========
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 1000
Focus-Amiga $Title | Out-Null
# Move focus left toward rail then down through tabs
1..3 | ForEach-Object { Send-Key ([TvUatUi]::VK_LEFT) 280 }
$steps += Capture-Step "15-rail-focus" "remote" "Focus moved left toward side rail"
Send-Key ([TvUatUi]::VK_DOWN) 400
Send-Key ([TvUatUi]::VK_DOWN) 400
$steps += Capture-Step "15b-rail-down" "remote" "ArrowDown along side rail tabs"
Send-Key ([TvUatUi]::VK_RETURN) 1200
$steps += Capture-Step "15c-rail-enter" "remote" "Enter after rail focus (tab switch?)"

# Escape / back behavior
Send-Key ([TvUatUi]::VK_ESCAPE) 900
$steps += Capture-Step "16-escape" "remote" "After Escape (back handler)"

# Final home
Click-Relative $proc.MainWindowHandle $TabLearn.X $TabLearn.Y 1200
$steps += Capture-Step "17-final-learn" "learn" "Final Learn hub state"

$manifest = @{
    title     = $Title
    timestamp = (Get-Date -Format "o")
    outDir    = $OutDir
    note      = "TV UAT: left rail layout, remote arrows, reduced module set"
    steps     = $steps
}
$manifestPath = Join-Path $OutDir "manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "TV UAT complete: $($steps.Count) screenshots"
Write-Host "Manifest: $manifestPath"
Write-Host "OutDir: $OutDir"
