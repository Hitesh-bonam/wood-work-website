@echo off
title Publish website
cd /d "%~dp0"
rem Saves projects and site, brings down anything added from the phone, then sends it all to GitHub.
node src\sync.mjs publish
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
echo.
pause
