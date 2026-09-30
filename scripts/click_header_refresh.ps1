$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Clicker4 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[Clicker4]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object Clicker4+RECT
[Clicker4]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# In NewsList: Header refresh button is in .ph-actions.
# Let's click at Left + 440, Top + 55
$rx = $rect.Left + 440
$ry = $rect.Top + 55
[Clicker4]::SetCursorPos($rx, $ry) | Out-Null
Start-Sleep -Milliseconds 200
[Clicker4]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[Clicker4]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked header button at $rx, $ry"
