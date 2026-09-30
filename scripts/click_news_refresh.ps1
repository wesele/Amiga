$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Clicker3 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[Clicker3]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object Clicker3+RECT
[Clicker3]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# Refresh button in NewsList is top-right: roughly Left + 440, Top + 80
$rx = $rect.Left + 445
$ry = $rect.Top + 80
[Clicker3]::SetCursorPos($rx, $ry) | Out-Null
Start-Sleep -Milliseconds 200
[Clicker3]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[Clicker3]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked refresh button at $rx, $ry"
