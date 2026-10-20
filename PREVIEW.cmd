@echo off
title Website preview
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org, install it, then double-click this file again.
  pause
  exit /b 1
)
if not exist "node_modules\sharp" (
  echo First time only: getting things ready. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo Setup did not finish. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
rem Bring down anything added from the phone, so this folder and GitHub stay one project.
node src\sync.mjs pull
call npm run dev
pause
