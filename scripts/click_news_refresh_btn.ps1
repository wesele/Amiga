$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class NavClicker6 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[NavClicker6]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object NavClicker6+RECT
[NavClicker6]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# Click the refresh button in NewsList (top right): Left + 440, Top + 80
$rx = $rect.Left + 440
$ry = $rect.Top + 80
[NavClicker6]::SetCursorPos($rx, $ry) | Out-Null
Start-Sleep -Milliseconds 200
[NavClicker6]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
[NavClicker6]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "Clicked refresh at $rx, $ry"
