@echo off
chcp 65001 >nul
title Tester - Universe MapMaker

set SCRIPT_DIR=%~dp0
set BASE_DIR=%SCRIPT_DIR%..

:: ========================================
:: CLEANUP POPRZEDNIEJ SESJI
:: ========================================

:: Wyslij STOP do starego serwera (jesli dziala)
curl -s -X POST http://localhost:8081/api/reset >nul 2>&1
timeout /t 1 /nobreak >nul

:: Zatrzymaj serwer po nazwie okna
taskkill /F /FI "WINDOWTITLE eq Test Monitor Server" >nul 2>&1

:: Zwolnij port 8081
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081" ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
)

:: Usun sygnaly i pliki tymczasowe
del "%BASE_DIR%\monitor\stop-signal.txt" >nul 2>&1
del "%BASE_DIR%\data\pw-coded-results.json" >nul 2>&1

:: Poczekaj na zamkniecie procesow
timeout /t 2 /nobreak >nul

:: Reset tests-data.js - uzyj node zamiast echo (niezawodne)
node -e "const fs=require('fs'),p=require('path').join('%BASE_DIR:\=/%','monitor','tests-data.js');fs.writeFileSync(p,'var testData = {\"lastUpdate\":null,\"sheetId\":\"\",\"sheetUrl\":\"\",\"sheetTitle\":\"\",\"agentStatus\":{\"isRunning\":false,\"currentAction\":\"\",\"finished\":false,\"startedAt\":null},\"summary\":{\"total\":0,\"passed\":0,\"failed\":0,\"blocked\":0,\"inProgress\":0,\"pending\":0},\"currentTest\":null,\"tests\":[]};','utf8');console.log('Reset OK');"

:: ========================================
:: START NOWEJ SESJI
:: ========================================

echo.
echo ========================================
echo   Universe MapMaker - Tester + Monitor
echo ========================================
echo.

:: Uruchom serwer w tle
start "Test Monitor Server" /min cmd /c "cd /d "%BASE_DIR%\scripts" && node server.js"

:: Poczekaj na uruchomienie serwera
echo Uruchamiam serwer na http://localhost:8081 ...
timeout /t 3 /nobreak >nul

:: Otworz przegladarke z monitorem
start http://localhost:8081

echo Monitor otwarty w przegladarce.
echo Wklej link do arkusza Google Sheets i kliknij "Rozpocznij testy".
echo.
echo ========================================
echo   Nacisnij dowolny klawisz aby
echo   ZATRZYMAC testy i zamknac serwer
echo ========================================
pause >nul

:: ========================================
:: CLEANUP PRZY ZAMYKANIU
:: ========================================

curl -s -X POST http://localhost:8081/api/stop >nul 2>&1
timeout /t 5 /nobreak >nul
taskkill /F /FI "WINDOWTITLE eq Test Monitor Server" >nul 2>&1
echo Zatrzymano.
