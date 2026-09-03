@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GOFOOD Print Agent

if not exist "agent-config.json" (
  if exist "agent-config.example.json" copy /y "agent-config.example.json" "agent-config.json" >nul
  echo.
  echo Fill agent-config.json (apiBase, agentToken, iiko), then run again.
  notepad "agent-config.json"
  pause
  exit /b
)

if not exist "node_modules" (
  echo Installing dependencies (needs internet, ~1 min)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo npm install failed. Is Node.js 18+ installed?
    pause
    exit /b
  )
)

echo Starting GOFOOD Print Agent. Keep this window open.
node src\index.js
pause
