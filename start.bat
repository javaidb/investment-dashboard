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

echo Checking and killing processes on ports 3000 and 5000...
echo.

echo Checking port 3000...
netstat -ano | findstr :3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo Found process on port 3000, killing it...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        echo Killing process on port 3000 (PID: %%a)
        taskkill /f /pid %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
) else (
    echo Port 3000 is free
)

echo Checking port 5000...
netstat -ano | findstr :5000 >nul 2>&1
if %errorlevel% equ 0 (
    echo Found process on port 5000, killing it...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
        echo Killing process on port 5000 (PID: %%a)
        taskkill /f /pid %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
) else (
    echo Port 5000 is free
)

echo.
echo Ports cleared. Installing dependencies...
echo.

echo Killing any remaining Node.js processes...
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo Node.js processes cleared.
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