$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Clicker2 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[Clicker2]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object Clicker2+RECT
[Clicker2]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# Click on "新闻" (News card in Learn page)
$cx = $rect.Left + 240
$cy = $rect.Top + 360
[Clicker2]::SetCursorPos($cx, $cy) | Out-Null
Start-Sleep -Milliseconds 200
[Clicker2]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[Clicker2]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked at $cx, $cy"
