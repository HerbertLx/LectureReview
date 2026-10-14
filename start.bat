@echo off
setlocal
chcp 65001 >nul
title LectureReview
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
set "launchExit=%errorlevel%"
if errorlevel 1 (
  echo.
  echo LectureReview could not start. Read the message above and README.md.
  pause
)
endlocal & exit /b %launchExit%
