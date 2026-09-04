@echo off
chcp 65001 >nul
set TASK=GOFOOD Print Agent
schtasks /end /tn "%TASK%" >/dev/null 2>&1
schtasks /delete /tn "%TASK%" /f
taskkill /f /im node.exe >/dev/null 2>&1
echo Autostart removed and agent stopped.
pause
