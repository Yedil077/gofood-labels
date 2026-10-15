@echo off
chcp 65001 >nul
cd /d "%~dp0"
set TASK=GOFOOD Print Agent
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)

rem 1) Task Scheduler (needs Administrator if the task was created before by an admin)
schtasks /query /tn "%TASK%" >nul 2>&1 && schtasks /delete /tn "%TASK%" /f >nul 2>&1
schtasks /create /tn "%TASK%" /tr "wscript.exe \"%~dp0run-hidden.vbs\"" /sc onlogon /rl limited /f >nul 2>&1
if not errorlevel 1 (
  schtasks /run /tn "%TASK%" >nul 2>&1
  echo.
  echo OK: autostart via Task Scheduler.
  goto done
)

rem 2) No admin rights: shortcut in the user's Startup folder (no admin needed)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\GOFOOD Print Agent.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments='\"%~dp0run-hidden.vbs\"'; $s.WorkingDirectory='%~dp0'; $s.Save()"
start "" wscript.exe "%~dp0run-hidden.vbs"
echo.
echo OK: autostart via Startup folder (no admin rights needed).

:done
echo Agent is running hidden now, restarts itself if it stops,
echo and starts automatically at every Windows logon.
echo Check the site: page "Ochered" should show "Agent na svyazi" in ~20 seconds.
echo Logs:  %~dp0out\agent.log
pause
