@echo off
chcp 65001 >nul
set TASK=GOFOOD Print Agent
schtasks /end /tn "%TASK%" >nul 2>&1
schtasks /delete /tn "%TASK%" /f
rem Сначала останавливаем цикл автоперезапуска (run-hidden.vbs), потом сам агент — только его, не все node.exe.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run-hidden.vbs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*src\index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Autostart removed and agent stopped.
pause
