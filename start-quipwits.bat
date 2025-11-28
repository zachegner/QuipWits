@echo off
:: QuipWits Server Launcher for Windows
:: Double-click this file to start the game server

title QuipWits Game Server

echo.
echo ==========================================
echo       QUIPWITS GAME SERVER LAUNCHER
echo ==========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo Download the LTS version and run the installer.
    echo.
    pause
    exit /b 1
)

:: Get the directory where this script is located
cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies... This may take a minute.
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
    echo.
)

echo Starting QuipWits server...
echo.
echo ==========================================
echo TIP: To stop the server, press Ctrl+C
echo ==========================================
echo.

:: Run the server
node server/index.js

:: If we get here, the server has stopped
echo.
echo Server stopped.
pause
