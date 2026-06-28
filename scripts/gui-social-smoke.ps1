param(
    [string]$Title = "Amiga",
    [string]$Message = "gui-smoke-test"
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class UiOps {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    public const uint LEFTDOWN = 0x0002;
    public const uint LEFTUP = 0x0004;
}
"@

function Get-WindowProc([string]$WinTitle) {
    Get-Process | Where-Object { $_.MainWindowTitle -eq $WinTitle -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
}

function Click-Relative([IntPtr]$Handle, [double]$Rx, [double]$Ry) {
    $rect = New-Object UiOps+RECT
    [UiOps]::GetClientRect($Handle, [ref]$rect) | Out-Null
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top
    $pt = New-Object UiOps+POINT
    $pt.X = [int]($w * $Rx)
    $pt.Y = [int]($h * $Ry)
    [UiOps]::ClientToScreen($Handle, [ref]$pt) | Out-Null
    $x = $pt.X
    $y = $pt.Y
    [UiOps]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 120
    [UiOps]::mouse_event([UiOps]::LEFTDOWN, 0, 0, 0, 0)
    [UiOps]::mouse_event([UiOps]::LEFTUP, 0, 0, 0, 0)
}

function Focus-Window([string]$WinTitle) {
    $proc = Get-WindowProc $WinTitle
    if (-not $proc) { throw "Window '$WinTitle' not found" }
    [UiOps]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
    [UiOps]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 500
    return $proc
}

function Open-PublicGroup([string]$WinTitle) {
    $proc = Focus-Window $WinTitle
    Click-Relative $proc.MainWindowHandle 0.50 0.96    # chat tab (3rd of 4, centered)
    Start-Sleep -Seconds 2
    Click-Relative $proc.MainWindowHandle 0.50 0.20      # public group row
    Start-Sleep -Seconds 2
}

function Send-ChatMessage([string]$WinTitle, [string]$Text) {
    $proc = Focus-Window $WinTitle
    Click-Relative $proc.MainWindowHandle 0.42 0.93   # input
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait("^a{BACKSPACE}")
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Start-Sleep -Milliseconds 300
    Click-Relative $proc.MainWindowHandle 0.90 0.93   # send
    Start-Sleep -Seconds 1
}

Add-Type -AssemblyName System.Windows.Forms

Open-PublicGroup -WinTitle $Title
if ($Message -and $Message -ne "skip") {
    Send-ChatMessage -WinTitle $Title -Text $Message
}
Write-Host "Done: $Title"