$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Clicker5 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[Clicker5]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object Clicker5+RECT
[Clicker5]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# In NewsList: The action button is inside PageHeader (height ~56px) plus window titlebar (~32px).
# So Top + 32 + 28 = Top + 60. Right - 30 = Left + 480 - 30 = Left + 450.
$rx = $rect.Left + 445
$ry = $rect.Top + 65
[Clicker5]::SetCursorPos($rx, $ry) | Out-Null
Start-Sleep -Milliseconds 200
[Clicker5]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[Clicker5]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked at $rx, $ry"
