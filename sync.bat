@echo off
chcp 65001 >nul
title Tester Agent - Sync to GitHub

:: Wrapper for sync.sh - runs in Git Bash
:: Usage:
::   sync.bat                    - sync all + push
::   sync.bat --no-push          - sync without push
::   sync.bat -m "message"       - custom commit message

set AGENT_DIR=%~dp0
set SYNC_SCRIPT=%AGENT_DIR%sync.sh

:: Find Git Bash
set GIT_BASH=
if exist "C:\Program Files\Git\bin\bash.exe" set GIT_BASH=C:\Program Files\Git\bin\bash.exe
if exist "C:\Program Files (x86)\Git\bin\bash.exe" set GIT_BASH=C:\Program Files (x86)\Git\bin\bash.exe

if "%GIT_BASH%"=="" (
    echo ERROR: Git Bash not found. Install Git for Windows.
    pause
    exit /b 1
)

"%GIT_BASH%" "%SYNC_SCRIPT%" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo SYNC FAILED with error code %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

pause
