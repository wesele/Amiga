$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class NavClicker3 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[NavClicker3]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object NavClicker3+RECT
[NavClicker3]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# Click the news item card (2nd card under learning modules)
$cx = $rect.Left + 200
$cy = $rect.Top + 510
[NavClicker3]::SetCursorPos($cx, $cy) | Out-Null
Start-Sleep -Milliseconds 200
[NavClicker3]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[NavClicker3]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked at $cx, $cy"
