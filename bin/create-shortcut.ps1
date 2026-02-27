$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Test Monitor.lnk")
$Shortcut.TargetPath = "$env:USERPROFILE\.claude\agents\tester\bin\TestMonitor.bat"
$Shortcut.WorkingDirectory = "$env:USERPROFILE\.claude\agents\tester\bin"
$Shortcut.IconLocation = "C:\Windows\System32\shell32.dll,21"
$Shortcut.Description = "Universe MapMaker Test Monitor"
$Shortcut.Save()
Write-Host "Skrot utworzony na pulpicie!"
