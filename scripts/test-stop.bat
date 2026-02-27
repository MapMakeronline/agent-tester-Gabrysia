@echo off
echo Tworzenie sygnalu STOP dla agenta testera...
echo STOP > "%~dp0..\monitor\stop-signal.txt"
echo.
echo Stop signal utworzony!
echo Agent zatrzyma sie przed kolejnym testem.
echo.
pause
