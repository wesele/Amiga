param(
    [string]$Title = "Amiga"
)
$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ClientUi2 {
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
[ClientUi2]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[ClientUi2]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400

function Drag-Down([double]$Rx, [double]$StartRy, [double]$EndRy) {
    $r = New-Object ClientUi2+RECT; [ClientUi2]::GetClientRect($p.MainWindowHandle, [ref]$r) | Out-Null
    $w = [int]$r.Right - [int]$r.Left
    $h = [int]$r.Bottom - [int]$r.Top
    
    $startY = [int]($h * $StartRy)
    $endY = [int]($h * $EndRy)
    $x = [int]($w * $Rx)

    $pt = New-Object ClientUi2+POINT; $pt.X = $x; $pt.Y = $startY
    [ClientUi2]::ClientToScreen($p.MainWindowHandle, [ref]$pt) | Out-Null
    [ClientUi2]::SetCursorPos($pt.X, $pt.Y) | Out-Null
    Start-Sleep -Milliseconds 100

    [ClientUi2]::mouse_event([ClientUi2]::LEFTDOWN, 0, 0, 0, 0)
    for ($curY = $startY; $curY -le $endY; $curY += 15) {
        $stepPt = New-Object ClientUi2+POINT; $stepPt.X = $x; $stepPt.Y = $curY
        [ClientUi2]::ClientToScreen($p.MainWindowHandle, [ref]$stepPt) | Out-Null
        [ClientUi2]::SetCursorPos($stepPt.X, $stepPt.Y) | Out-Null
        Start-Sleep -Milliseconds 25
    }
    Start-Sleep -Milliseconds 300
    [ClientUi2]::mouse_event([ClientUi2]::LEFTUP, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 2000
}

Drag-Down 0.5 0.25 0.65
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/screenshot.ps1 -Mode App -Title $Title -OutFile screenshots/news-current.png
