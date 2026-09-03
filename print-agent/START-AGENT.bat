@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GOFOOD Print Agent

if not exist "agent-config.json" (
  echo Нет agent-config.json. Копирую из примера...
  copy "agent-config.example.json" "agent-config.json" >nul
  echo.
  echo ОТКРОЙТЕ agent-config.json и укажите apiBase и agentToken, затем запустите снова.
  notepad "agent-config.json"
  pause
  exit /b
)

if not exist "node_modules" (
  echo Установка зависимостей агента (нужен интернет один раз)...
  call npm install --no-audit --no-fund || (echo ОШИБКА установки & pause & exit /b)
)

echo Запуск агента. Не закрывайте это окно во время работы кухни.
node src\index.js
pause
