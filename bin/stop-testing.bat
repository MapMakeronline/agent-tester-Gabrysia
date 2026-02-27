@echo off
REM Get the script's directory
set SCRIPT_DIR=%~dp0
set BASE_DIR=%SCRIPT_DIR%..

REM Create stop signal for tester agent
echo STOP > "%BASE_DIR%\monitor\stop-signal.txt"
echo Wyslano sygnal STOP do agenta tester.
echo Agent zatrzyma sie po zakonczeniu aktualnego testu.
