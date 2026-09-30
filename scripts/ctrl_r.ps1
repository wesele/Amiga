$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate("Amiga")
Start-Sleep -Milliseconds 400
# Send Ctrl+R to reload webview
$wshell.SendKeys("^{F5}")
Start-Sleep -Milliseconds 300
$wshell.SendKeys("^r")
