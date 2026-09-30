param(
    [string]$Title = "Amiga",
    [string]$OutFile = "screenshots/news-current.png"
)
$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ClientUi {
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

$p = Get-Process | Where-Object { $_.MainWindowTitle -eq $Title -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
if (-not $p) { throw "Amiga window not found" }
[ClientUi]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[ClientUi]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400

function Click-Client([double]$Rx, [double]$Ry, [int]$Ms = 500) {
    $r = New-Object ClientUi+RECT; [ClientUi]::GetClientRect($p.MainWindowHandle, [ref]$r) | Out-Null
    $w = [int]$r.Right - [int]$r.Left
    $h = [int]$r.Bottom - [int]$r.Top
    $pt = New-Object ClientUi+POINT; $pt.X = [int]($w * $Rx); $pt.Y = [int]($h * $Ry)
    [ClientUi]::ClientToScreen($p.MainWindowHandle, [ref]$pt) | Out-Null
    [ClientUi]::SetCursorPos($pt.X, $pt.Y) | Out-Null
    Start-Sleep -Milliseconds 100
    [ClientUi]::mouse_event([ClientUi]::LEFTDOWN, 0, 0, 0, 0)
    [ClientUi]::mouse_event([ClientUi]::LEFTUP, 0, 0, 0, 0)
    Start-Sleep -Milliseconds $Ms
}

# Click refresh button: in NewsList header (Rx: ~0.92, Ry: ~0.04)
Click-Client 0.92 0.04 1500

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/screenshot.ps1 -Mode App -Title $Title -OutFile $OutFile
Write-Host "Screenshot saved to $OutFile"
