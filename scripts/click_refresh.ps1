$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Output "idioma not running"
    exit 1
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Clicker {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

[Clicker]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object Clicker+RECT
[Clicker]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
$rx = $rect.Left + 435
$ry = $rect.Top + 95
[Clicker]::SetCursorPos($rx, $ry) | Out-Null
Start-Sleep -Milliseconds 200
[Clicker]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[Clicker]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked at $rx, $ry"
