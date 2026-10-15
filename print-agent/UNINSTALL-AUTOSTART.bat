@echo off
chcp 65001 >nul
set TASK=GOFOOD Print Agent
schtasks /end /tn "%TASK%" >nul 2>&1
schtasks /delete /tn "%TASK%" /f >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GOFOOD Print Agent.lnk" >nul 2>&1
rem Stop the restart loop (run-hidden.vbs) first, then the agent itself - only it, not every node.exe.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run-hidden.vbs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*src\index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Autostart removed and agent stopped.
echo (If a Task Scheduler task was created by an administrator, run this file as Administrator to remove it.)
pause
