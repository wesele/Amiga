# Windows GUI smoke: open Soul Mate for current target language, generate today's letter, verify language.
param(
    [string]$Title = "Amiga",
    [string]$ExpectedLang = "zh",
    [string]$OutDir = "screenshots/soulmate-lang"
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutDir = Join-Path $ProjectDir $OutDir
$ScreenshotScript = Join-Path $ProjectDir "scripts\screenshot.ps1"
$DbPath = Join-Path $env:LOCALAPPDATA "idioma\idioma.db"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SoulUi {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
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
    [SoulUi]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
    [SoulUi]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 600
    return $proc
}

function Click-Relative([IntPtr]$Handle, [double]$Rx, [double]$Ry, [int]$DelayMs = 900) {
    $rect = New-Object SoulUi+RECT
    [SoulUi]::GetClientRect($Handle, [ref]$rect) | Out-Null
    $clientW = [int]$rect.Right - [int]$rect.Left
    $clientH = [int]$rect.Bottom - [int]$rect.Top
    $pt = New-Object SoulUi+POINT
    $pt.X = [int]($clientW * $Rx)
    $pt.Y = [int]($clientH * $Ry)
    [SoulUi]::ClientToScreen($Handle, [ref]$pt) | Out-Null
    [SoulUi]::SetCursorPos($pt.X, $pt.Y) | Out-Null
    Start-Sleep -Milliseconds 120
    [SoulUi]::mouse_event([SoulUi]::LEFTDOWN, 0, 0, 0, 0)
    [SoulUi]::mouse_event([SoulUi]::LEFTUP, 0, 0, 0, 0)
    Start-Sleep -Milliseconds $DelayMs
}

function Capture([string]$Name) {
    $out = Join-Path $OutDir "$Name.png"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ScreenshotScript -Mode App -Title $Title -OutFile $out -WaitSeconds 4
    return $out
}

function Query-Db([string]$Sql) {
    & sqlite3 $DbPath $Sql
}

Write-Host "=== Soul Mate language Windows smoke (expected=$ExpectedLang) ==="
$target = Query-Db "SELECT value FROM app_settings WHERE key='current_target_language';"
Write-Host "DB current_target_language=$target"
$worlds = Query-Db "SELECT target_lang || '|' || companion_name || '|' || story_location FROM soulmate_worlds;"
Write-Host "DB worlds:`n$worlds"

$proc = Focus-Amiga $Title
# Learn tab
Click-Relative $proc.MainWindowHandle 0.125 0.94 1400
Capture "01-learn-hub" | Out-Null

# Scroll module grid so Soul Mate is fully visible, then tap it (row 2, col 2)
Click-Relative $proc.MainWindowHandle 0.50 0.55 200
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{PGDN}")
Start-Sleep -Milliseconds 500
# Soul Mate is second tile on second module row (~x 0.50-0.55, y ~0.78)
Click-Relative $proc.MainWindowHandle 0.50 0.78 2800
Capture "02-soulmate-home" | Out-Null

# Main action button ("Today's letter" / 今日来信) sits mid page
Click-Relative $proc.MainWindowHandle 0.50 0.58 1200
Write-Host "Waiting for story generation (up to 120s)..."
$deadline = (Get-Date).AddSeconds(120)
$body = ""
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    $body = Query-Db "SELECT body FROM soulmate_episodes ORDER BY created_at DESC LIMIT 1;"
    if ($body -and $body.Trim().Length -gt 40) { break }
}
Capture "03-soulmate-story" | Out-Null

$title = Query-Db "SELECT title FROM soulmate_episodes ORDER BY created_at DESC LIMIT 1;"
$teaser = Query-Db "SELECT teaser FROM soulmate_episodes ORDER BY created_at DESC LIMIT 1;"
$worldLang = Query-Db "SELECT target_lang FROM soulmate_worlds WHERE target_lang='$ExpectedLang' LIMIT 1;"

Write-Host "Episode title: $title"
Write-Host "Episode teaser: $teaser"
if ($body) {
    $previewLen = [Math]::Min(180, $body.Length)
    Write-Host "Episode body preview: $($body.Substring(0, $previewLen))"
} else {
    Write-Host "Episode body preview: <empty>"
}

$cjk = ([regex]::Matches($body, '[\u4e00-\u9fff]')).Count
$latin = ([regex]::Matches($body, '[A-Za-z]')).Count
Write-Host "Body CJK=$cjk latin=$latin worldLang=$worldLang"

$ok = $false
if ($ExpectedLang -eq "zh") {
    $ok = ($cjk -ge 20) -and ($cjk * 2 -ge $latin)
} elseif ($ExpectedLang -eq "en" -or $ExpectedLang -eq "es") {
    $ok = ($latin -ge 40) -and ($cjk -lt 10)
}

if (-not $ok) {
    Write-Error "FAIL: generated story language does not match expected=$ExpectedLang (CJK=$cjk latin=$latin)"
    exit 1
}

Write-Host "PASS: Soul Mate story language matches $ExpectedLang"
exit 0
