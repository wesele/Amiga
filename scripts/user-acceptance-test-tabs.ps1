# Focused UAT: vocab, chat, profile tabs (after backing out of nested views).
param(
    [string]$Title = "Amiga",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutDir) { $OutDir = Join-Path $ProjectDir "screenshots\uat-round1b" }
$ScreenshotScript = Join-Path $ProjectDir "scripts\screenshot.ps1"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TabUi {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    public const uint LEFTDOWN = 0x0002; public const uint LEFTUP = 0x0004;
}
"@

function Get-Proc([string]$WinTitle) {
    Get-Process | Where-Object { $_.MainWindowTitle -eq $WinTitle -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
}

function Focus([string]$WinTitle) {
    $p = Get-Proc $WinTitle
    if (-not $p) { throw "Window '$WinTitle' not found" }
    [TabUi]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
    [TabUi]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 500
    return $p
}

function Click([IntPtr]$Handle, [double]$Rx, [double]$Ry, [int]$Ms = 1000) {
    $r = New-Object TabUi+RECT; [TabUi]::GetClientRect($Handle, [ref]$r) | Out-Null
    $clientW = [int]$r.Right - [int]$r.Left
    $clientH = [int]$r.Bottom - [int]$r.Top
    $pt = New-Object TabUi+POINT; $pt.X = [int]($clientW * $Rx); $pt.Y = [int]($clientH * $Ry)
    [TabUi]::ClientToScreen($Handle, [ref]$pt) | Out-Null
    [TabUi]::SetCursorPos($pt.X, $pt.Y) | Out-Null
    Start-Sleep -Milliseconds 100
    [TabUi]::mouse_event([TabUi]::LEFTDOWN, 0, 0, 0, 0)
    [TabUi]::mouse_event([TabUi]::LEFTUP, 0, 0, 0, 0)
    Start-Sleep -Milliseconds $Ms
}

function Shot([string]$Id) {
    $out = Join-Path $OutDir "$Id.png"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ScreenshotScript -Mode App -Title $Title -OutFile $out -WaitSeconds 5
    Write-Host "Captured: $out"
}

$proc = Focus $Title
$H = $proc.MainWindowHandle

# Vocab tab
Click $H 0.375 0.94 1500
Shot "07-vocab-main"
Click $H 0.50 0.35 1500
Shot "08-vocab-interaction"

# Chat tab
Click $H 0.625 0.94 1500
Shot "09-chat-main"
Click $H 0.85 0.08 1500
Shot "10-chat-social"
Click $H 0.50 0.25 2000
Shot "11-chat-session"
# Back from chat session
Click $H 0.08 0.10 1000

# Profile tab
Click $H 0.875 0.94 1500
Shot "12-profile-main"
Click $H 0.50 0.30 1500
Shot "13-settings"
# Back from settings
Click $H 0.08 0.10 1000
Click $H 0.875 0.94 1000
Click $H 0.50 0.45 1500
Shot "14-llm-config"

Write-Host "Done: $OutDir"