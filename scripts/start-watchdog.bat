@echo off
title Watchdog - Agent Tester
cd /d C:\Users\Dom\.claude\agents\tester\scripts
echo ========================================
echo   WATCHDOG - Agent Tester Monitor
echo ========================================
echo.
echo Monitoruje agenta i restartuje po bledie.
echo Aby zatrzymac: Ctrl+C lub utworz plik watchdog-stop.txt
echo.
echo ========================================
echo.
node watchdog.js
pause
