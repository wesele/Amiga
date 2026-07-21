# scripts/operate-tv-app.ps1
# Focus the Amiga TV window, send keypresses, and capture live screenshot.

param(
    [string]$Keys = "",
    [string]$OutFile = "screenshots/live-step.png",
    [int]$DelayMs = 400
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Tv {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@ -ErrorAction SilentlyContinue

$proc = Get-Process | Where-Object { $_.MainWindowTitle -eq "Amiga TV" -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
if (-not $proc) {
    throw "Amiga TV window not found."
}

# Focus window
[Win32Tv]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null # SW_RESTORE
[Win32Tv]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 300

# Send Keys if provided
if ($Keys) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Start-Sleep -Milliseconds $DelayMs
}

# Capture screenshot using existing screenshot.ps1
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$screenshotScript = Join-Path $PSScriptRoot "screenshot.ps1"
powershell -ExecutionPolicy Bypass -File $screenshotScript -Mode App -Title "Amiga TV" -OutFile $OutFile
