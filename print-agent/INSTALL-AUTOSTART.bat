@echo off
chcp 65001 >nul
cd /d "%~dp0"
set TASK=GOFOOD Print Agent
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
schtasks /query /tn "%TASK%" >/dev/null 2>&1 && schtasks /delete /tn "%TASK%" /f >nul
schtasks /create /tn "%TASK%" /tr "wscript.exe \"%~dp0run-hidden.vbs\"" /sc onlogon /f
if errorlevel 1 (
  echo FAILED to create task. Run this file as Administrator.
  pause
  exit /b
)
schtasks /run /tn "%TASK%"
echo.
echo Done. Agent runs hidden now and will auto-start at every logon.
echo Logs:  %~dp0outgent.log
echo Stop:  UNINSTALL-AUTOSTART.bat  (or Task Manager -^> node.exe)
pause
