@echo off
REM Nagrywanie procedury testowej przez obserwacje uzytkownika
REM Uzycie: learn-test.bat TC-TOOLS-008 [--port=9222] [--duration=60]
node "%~dp0..\scripts\learn-test.js" %*
