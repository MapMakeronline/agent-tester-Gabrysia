@echo off
chcp 65001 >nul
title Agent Tester - Aktualizacja sciezek
echo ============================================================
echo   Aktualizacja sciezek w plikach agenta
echo   Zamienia C:\Users\Dom na C:\Users\%USERNAME%
echo   Wersja: 2026-02-25 (v4)
echo ============================================================
echo.

if "%USERNAME%"=="Dom" (
    echo Sciezki sa juz poprawne (uzytkownik: Dom^). Nic do zmiany.
    pause
    exit /b 0
)

set OLD_PATH=C:\\Users\\Dom
set NEW_PATH=C:\\Users\\%USERNAME%
set OLD_UNIX=/c/Users/Dom
set NEW_UNIX=/c/Users/%USERNAME%

echo Zamieniam: %OLD_PATH% -> %NEW_PATH%
echo.

:: Update AGENT.md
set AGENT_MD=%USERPROFILE%\.claude\agents\tester\AGENT.md
if exist "%AGENT_MD%" (
    node -e "const fs=require('fs'); let c=fs.readFileSync('%AGENT_MD:\=\\%','utf8'); c=c.replace(/C:\\\\Users\\\\Dom/g,'%NEW_PATH%'); c=c.replace(/\/c\/Users\/Dom/g,'%NEW_UNIX%'); fs.writeFileSync('%AGENT_MD:\=\\%',c); console.log('  [OK] AGENT.md');"
) else (
    echo   [SKIP] AGENT.md nie znaleziony
)

:: Update tester.md plugin
set PLUGIN_MD=%USERPROFILE%\.claude\plugins\tester-agent\agents\tester.md
if exist "%PLUGIN_MD%" (
    node -e "const fs=require('fs'); let c=fs.readFileSync('%PLUGIN_MD:\=\\%','utf8'); c=c.replace(/C:\\\\Users\\\\Dom/g,'%NEW_PATH%'); c=c.replace(/\/c\/Users\/Dom/g,'%NEW_UNIX%'); fs.writeFileSync('%PLUGIN_MD:\=\\%',c); console.log('  [OK] tester.md');"
) else (
    echo   [SKIP] tester.md nie znaleziony
)

:: Update sheets-reporter.ts
set REPORTER=%USERPROFILE%\MUIFrontend\e2e\helpers\sheets-reporter.ts
if exist "%REPORTER%" (
    node -e "const fs=require('fs'); let c=fs.readFileSync('%REPORTER:\=\\%','utf8'); c=c.replace(/C:\\\\Users\\\\Dom/g,'%NEW_PATH%'); c=c.replace(/\/c\/Users\/Dom/g,'%NEW_UNIX%'); fs.writeFileSync('%REPORTER:\=\\%',c); console.log('  [OK] sheets-reporter.ts');"
) else (
    echo   [SKIP] sheets-reporter.ts nie znaleziony
)

:: Update memory.md
set MEMORY=%USERPROFILE%\.claude\agents\tester\memory.md
if exist "%MEMORY%" (
    node -e "const fs=require('fs'); let c=fs.readFileSync('%MEMORY:\=\\%','utf8'); c=c.replace(/C:\\\\Users\\\\Dom/g,'%NEW_PATH%'); c=c.replace(/\/c\/Users\/Dom/g,'%NEW_UNIX%'); fs.writeFileSync('%MEMORY:\=\\%',c); console.log('  [OK] memory.md');"
) else (
    echo   [SKIP] memory.md nie znaleziony
)

:: Update init-session.js (contains MUIFRONTEND path calculation)
set INIT=%USERPROFILE%\.claude\agents\tester\scripts\init-session.js
if exist "%INIT%" (
    node -e "const fs=require('fs'); let c=fs.readFileSync('%INIT:\=\\%','utf8'); c=c.replace(/C:\\\\Users\\\\Dom/g,'%NEW_PATH%'); c=c.replace(/\/c\/Users\/Dom/g,'%NEW_UNIX%'); fs.writeFileSync('%INIT:\=\\%',c); console.log('  [OK] init-session.js');"
) else (
    echo   [SKIP] init-session.js nie znaleziony
)

:: Update StartTester.bat
set STARTER=%USERPROFILE%\.claude\agents\tester\bin\StartTester.bat
if exist "%STARTER%" (
    node -e "const fs=require('fs'); let c=fs.readFileSync('%STARTER:\=\\%','utf8'); c=c.replace(/C:\\\\Users\\\\Dom/g,'%NEW_PATH%'); c=c.replace(/\/c\/Users\/Dom/g,'%NEW_UNIX%'); fs.writeFileSync('%STARTER:\=\\%',c); console.log('  [OK] StartTester.bat');"
) else (
    echo   [SKIP] StartTester.bat nie znaleziony
)

:: Note: auth.ts does NOT contain hardcoded paths (uses env variables)

echo.
echo ============================================================
echo   Sciezki zaktualizowane!
echo ============================================================
echo.
echo   Pliki zmienione:
echo   - AGENT.md (instrukcje agenta)
echo   - tester.md (plugin)
echo   - sheets-reporter.ts (reporter)
echo   - memory.md (pamiec agenta)
echo   - init-session.js (inicjalizacja sesji)
echo   - StartTester.bat (punkt wejscia)
echo.
echo   Uwaga: auth.ts nie wymaga zmian (uzywa env variables).
echo   Sprawdz pliki recznie dla pewnosci.
echo.
pause
