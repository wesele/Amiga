$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class NavClicker {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[NavClicker]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object NavClicker+RECT
[NavClicker]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# Window bounds: Left, Top, Right, Bottom.
# In Amiga Learn page:
# Let's find coordinates. The window has titlebar.
# The News card has icon 📰 and "新闻" title.
# It is located around Y = Top + 340, X = Left + 200.
$cx = $rect.Left + 200
$cy = $rect.Top + 340
[NavClicker]::SetCursorPos($cx, $cy) | Out-Null
Start-Sleep -Milliseconds 200
[NavClicker]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[NavClicker]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked at $cx, $cy"
