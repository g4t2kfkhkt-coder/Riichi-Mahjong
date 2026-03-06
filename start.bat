@echo off
setlocal
cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT=8765"

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if %errorlevel% equ 0 (
    echo [INFO] Port %PORT% is already in use. Opening browser only...
    start "" "http://%HOST%:%PORT%/index.html"
    exit /b 0
)

echo [INFO] Starting local server: http://%HOST%:%PORT%/index.html
start "Riichi Mahjong Local Server" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -BindAddress "%HOST%" -Port %PORT% -RootPath "%~dp0"
timeout /t 2 >nul
start "" "http://%HOST%:%PORT%/index.html"

echo [OK] Browser opened.
echo [TIP] Close the PowerShell server window to stop the local service.
exit /b 0
