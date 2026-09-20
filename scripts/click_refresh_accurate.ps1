$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class NavClicker7 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[NavClicker7]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object NavClicker7+RECT
[NavClicker7]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null

# Let's see: In PageHeader:
# .page-header has height 56px.
# On Windows, a standard resizable window has titlebar height ~32px, border ~8px.
# Total top offset to inside client area is ~40px.
# Inside client area, header is 0..56px.
# The refresh button is around X = Left + 8 + 480 - 40 = Left + 448.
# Y is Top + 40 + 28 = Top + 68.
$rx = $rect.Left + 448
$ry = $rect.Top + 68
[NavClicker7]::SetCursorPos($rx, $ry) | Out-Null
Start-Sleep -Milliseconds 200
[NavClicker7]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[NavClicker7]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked refresh button at $rx, $ry"
