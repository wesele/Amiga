$proc = Get-Process idioma -ErrorAction SilentlyContinue
if (-not $proc) { exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Clicker6 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
[Clicker6]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$rect = New-Object Clicker6+RECT
[Clicker6]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
# Let's drag down in the middle to trigger pull-to-refresh
$cx = $rect.Left + 240
$startY = $rect.Top + 150
$endY = $rect.Top + 350

[Clicker6]::SetCursorPos($cx, $startY) | Out-Null
Start-Sleep -Milliseconds 100
[Clicker6]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero) # Left down
for ($y = $startY; $y -le $endY; $y += 10) {
    [Clicker6]::SetCursorPos($cx, $y) | Out-Null
    Start-Sleep -Milliseconds 20
}
Start-Sleep -Milliseconds 200
[Clicker6]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero) # Left up
Write-Output "Dragged down to trigger refresh"
