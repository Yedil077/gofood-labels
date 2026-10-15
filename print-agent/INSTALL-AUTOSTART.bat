@echo off
chcp 65001 >nul
cd /d "%~dp0"
set TASK=GOFOOD Print Agent
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
schtasks /query /tn "%TASK%" >nul 2>&1 && schtasks /delete /tn "%TASK%" /f >nul
rem Запуск при входе в Windows; агент работает скрыто и сам перезапускается, если упал.
schtasks /create /tn "%TASK%" /tr "wscript.exe \"%~dp0run-hidden.vbs\"" /sc onlogon /rl limited /f
if errorlevel 1 (
  echo FAILED to create task. Run this file as Administrator.
  pause
  exit /b
)
schtasks /run /tn "%TASK%"
echo.
echo Done. Agent runs hidden now, restarts itself if it stops,
echo and starts automatically at every Windows logon.
echo Logs:  %~dp0out\agent.log
echo Stop:  UNINSTALL-AUTOSTART.bat
pause
