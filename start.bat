@echo off
echo Starting Investment Dashboard...
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js found. Installing dependencies...
echo.

echo Installing root dependencies...
call "C:\Program Files\nodejs\npm.cmd" install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install root dependencies
    pause
    exit /b 1
)

echo Installing server dependencies...
cd server
call "C:\Program Files\nodejs\npm.cmd" install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install server dependencies
    pause
    exit /b 1
)

echo Installing client dependencies...
cd ../client
call "C:\Program Files\nodejs\npm.cmd" install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install client dependencies
    pause
    exit /b 1
)

cd ..

echo.
echo Dependencies installed successfully!
echo.

echo Checking for server/.env file...
if not exist "server\.env" (
    echo ERROR: server/.env file not found!
    echo Please copy server/env.example to server/.env and add your API keys
    pause
    exit /b 1
)

echo Environment file found. Starting development servers...
echo.

echo Checking for Finnhub API key...
findstr /C:"FINNHUB_API_KEY=" "server\.env" >nul
if %errorlevel% neq 0 (
    echo ERROR: FINNHUB_API_KEY not found in server/.env!
    echo Please add your Finnhub API key to server/.env
    pause
    exit /b 1
)

echo API key found. Proceeding...
echo.

echo Opening dashboard in browser in 5 seconds...
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo Starting both frontend and backend servers...
call "C:\Program Files\nodejs\npm.cmd" run dev

pause 