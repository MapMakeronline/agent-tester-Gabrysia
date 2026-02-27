@echo off
echo ========================================
echo   Universe MapMaker - Test Monitor
echo ========================================
echo.
echo Uruchamiam serwer na http://localhost:8080
echo Nacisnij Ctrl+C aby zatrzymac
echo.

cd /d "%~dp0"

REM Sprobuj Python najpierw
python -m http.server 8080 2>nul
if %errorlevel% neq 0 (
    python3 -m http.server 8080 2>nul
    if %errorlevel% neq 0 (
        REM Fallback do npx serve
        npx serve -l 8080
    )
)
pause
