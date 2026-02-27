@echo off
chcp 65001 >nul
title Agent Tester - Setup
echo ============================================================
echo   AGENT TESTER - INSTALACJA
echo   Universe MapMaker Testing Agent
echo   Wersja: 2026-02-25 (v4)
echo ============================================================
echo.

:: Check prerequisites
echo [1/7] Sprawdzanie wymaganych narzedzi...
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [BRAK] Node.js - zainstaluj z https://nodejs.org/
    set MISSING=1
) else (
    for /f "tokens=*" %%v in ('node --version') do echo   [OK] Node.js %%v
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [BRAK] npm - instaluje sie z Node.js
    set MISSING=1
) else (
    for /f "tokens=*" %%v in ('npm --version') do echo   [OK] npm %%v
)

where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [BRAK] Git - zainstaluj z https://git-scm.com/
    set MISSING=1
) else (
    for /f "tokens=*" %%v in ('git --version') do echo   [OK] %%v
)

where claude >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [BRAK] Claude Code - zainstaluj: npm install -g @anthropic-ai/claude-code
    set MISSING=1
) else (
    echo   [OK] Claude Code
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo   [OK] Google Chrome
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo   [OK] Google Chrome (x86^)
) else (
    echo   [BRAK] Google Chrome - zainstaluj z https://www.google.com/chrome/
    set MISSING=1
)

echo.
if defined MISSING (
    echo   UWAGA: Brakuje niektorych narzedzi. Zainstaluj je i uruchom ponownie.
    echo.
    pause
    exit /b 1
)

:: Check MUIFrontend
echo [2/7] Sprawdzanie repo MUIFrontend...
set MUIFRONTEND=%USERPROFILE%\MUIFrontend
if not exist "%MUIFRONTEND%\package.json" (
    echo   Repo MUIFrontend nie znalezione w %MUIFRONTEND%
    echo   Klonowanie...
    git clone https://github.com/MapMakeronline/MUIFrontend.git "%MUIFRONTEND%"
    if %ERRORLEVEL% neq 0 (
        echo   BLAD: Nie udalo sie sklonowac repo. Sprawdz dostep do GitHub.
        pause
        exit /b 1
    )
)
echo   [OK] MUIFrontend: %MUIFRONTEND%

:: Install npm dependencies
echo.
echo [3/7] Instalowanie zaleznosci npm...
cd /d "%MUIFRONTEND%"
call npm install
call npx playwright install chromium
echo   [OK] Zaleznosci zainstalowane

:: Copy agent files
echo.
echo [4/7] Kopiowanie plikow agenta...
set AGENT_DIR=%USERPROFILE%\.claude\agents\tester
set PLUGIN_DIR=%USERPROFILE%\.claude\plugins\tester-agent\agents

:: Create directories
if not exist "%AGENT_DIR%\config" mkdir "%AGENT_DIR%\config"
if not exist "%AGENT_DIR%\scripts" mkdir "%AGENT_DIR%\scripts"
if not exist "%AGENT_DIR%\scripts\_deprecated" mkdir "%AGENT_DIR%\scripts\_deprecated"
if not exist "%AGENT_DIR%\monitor" mkdir "%AGENT_DIR%\monitor"
if not exist "%AGENT_DIR%\bin" mkdir "%AGENT_DIR%\bin"
if not exist "%AGENT_DIR%\data" mkdir "%AGENT_DIR%\data"
if not exist "%AGENT_DIR%\test-files" mkdir "%AGENT_DIR%\test-files"
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"

:: Copy agent
xcopy /E /I /Y "%~dp0agent\*" "%AGENT_DIR%" >nul
echo   [OK] Agent: %AGENT_DIR%

:: Copy plugin
copy /Y "%~dp0plugin\agents\tester.md" "%PLUGIN_DIR%\tester.md" >nul
echo   [OK] Plugin: %PLUGIN_DIR%

:: Copy E2E files
echo.
echo [5/7] Kopiowanie plikow E2E...
set E2E_DIR=%MUIFRONTEND%\e2e

if not exist "%E2E_DIR%\helpers" mkdir "%E2E_DIR%\helpers"
if not exist "%E2E_DIR%\scripts" mkdir "%E2E_DIR%\scripts"
if not exist "%E2E_DIR%\learned-procedures" mkdir "%E2E_DIR%\learned-procedures"
if not exist "%E2E_DIR%\generated" mkdir "%E2E_DIR%\generated"

:: Core files
copy /Y "%~dp0e2e\fixtures.ts" "%E2E_DIR%\" >nul
copy /Y "%~dp0e2e\playwright.config.ts" "%MUIFRONTEND%\" >nul

:: Helpers (auth + reporter)
copy /Y "%~dp0e2e\helpers\sheets-reporter.ts" "%E2E_DIR%\helpers\" >nul
copy /Y "%~dp0e2e\helpers\auth.ts" "%E2E_DIR%\helpers\" >nul 2>nul

:: Scripts
copy /Y "%~dp0e2e\scripts\generate-spec.js" "%E2E_DIR%\scripts\" >nul 2>nul

:: Spec files (11 plikow z testami)
for %%f in ("%~dp0e2e\*.spec.ts") do copy /Y "%%f" "%E2E_DIR%\" >nul

:: Learned procedures
for %%f in ("%~dp0e2e\learned-procedures\*.json") do copy /Y "%%f" "%E2E_DIR%\learned-procedures\" >nul

echo   [OK] E2E: %E2E_DIR%

:: Update paths in AGENT.md and plugin if username differs
echo.
echo [6/7] Dostosowanie sciezek...
set CURRENT_USER=%USERNAME%
echo   Uzytkownik: %CURRENT_USER%
echo   Sciezki w AGENT.md sa domyslnie dla C:\Users\Dom
if not "%CURRENT_USER%"=="Dom" (
    echo   UWAGA: Twoj uzytkownik to %CURRENT_USER%, NIE Dom.
    echo   Uruchamiam update-paths.bat...
    call "%~dp0update-paths.bat"
) else (
    echo   [OK] Sciezki pasuja (Dom^)
)

:: Verify
echo.
echo [7/7] Weryfikacja instalacji...
echo.

if exist "%AGENT_DIR%\AGENT.md" (echo   [OK] AGENT.md) else (echo   [BRAK] AGENT.md)
if exist "%PLUGIN_DIR%\tester.md" (echo   [OK] tester.md plugin) else (echo   [BRAK] tester.md)
if exist "%AGENT_DIR%\scripts\init-session.js" (echo   [OK] init-session.js) else (echo   [BRAK] init-session.js)
if exist "%AGENT_DIR%\scripts\scan-specs.js" (echo   [OK] scan-specs.js) else (echo   [BRAK] scan-specs.js)
if exist "%AGENT_DIR%\monitor\index.html" (echo   [OK] monitor) else (echo   [BRAK] monitor)
if exist "%E2E_DIR%\fixtures.ts" (echo   [OK] fixtures.ts) else (echo   [BRAK] fixtures.ts)
if exist "%E2E_DIR%\helpers\sheets-reporter.ts" (echo   [OK] sheets-reporter.ts) else (echo   [BRAK] sheets-reporter.ts)
if exist "%E2E_DIR%\helpers\auth.ts" (echo   [OK] auth.ts) else (echo   [BRAK] auth.ts)
if exist "%MUIFRONTEND%\playwright.config.ts" (echo   [OK] playwright.config.ts) else (echo   [BRAK] playwright.config.ts)

:: Count spec files
set /a SPECCOUNT=0
for %%f in ("%E2E_DIR%\*.spec.ts") do set /a SPECCOUNT+=1
echo   [OK] %SPECCOUNT% spec files

:: Count learned procedures
set /a LEARNCOUNT=0
for %%f in ("%E2E_DIR%\learned-procedures\*.json") do set /a LEARNCOUNT+=1
echo   [OK] %LEARNCOUNT% learned procedures

echo.
echo ============================================================
echo   INSTALACJA ZAKONCZONA!
echo ============================================================
echo.
echo   Nastepne kroki:
echo.
echo   1. Uruchom Claude Code:  claude
echo   2. W Claude Code wpisz:  @tester
echo   3. Agent sam uruchomi Chrome i zacznie testowac
echo.
echo   Opcjonalnie:
echo   - Skonfiguruj webhook (patrz INSTALL.md, krok 4)
echo   - Zaloguj do GCP: gcloud auth login
echo.
pause
