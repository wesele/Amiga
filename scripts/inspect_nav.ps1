$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate("Amiga")
Start-Sleep -Milliseconds 400
# Tab multiple times or click refresh
$wshell.SendKeys("{TAB}")
