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

echo ========================================
echo KILLING EXISTING PROCESSES
echo ========================================

echo Killing all Node.js processes first...
taskkill /f /im node.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo Node.js processes cleared.

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
    timeout /t 3 /nobreak >nul
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
    timeout /t 3 /nobreak >nul
) else (
    echo Port 5000 is free
)

echo Double-checking ports are free...
timeout /t 2 /nobreak >nul
netstat -ano | findstr ":3000\|:5000" >nul 2>&1
if %errorlevel% equ 0 (
    echo WARNING: Ports may still be in use. Trying to kill again...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 3 /nobreak >nul
) else (
    echo Ports are confirmed free.
)

echo.
echo ========================================
echo INSTALLING DEPENDENCIES
echo ========================================

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
echo ========================================
echo ENVIRONMENT CHECK
echo ========================================

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

echo ========================================
echo STARTING SERVERS
echo ========================================

echo Opening dashboard in browser in 5 seconds...
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo Starting both frontend and backend servers...
echo.
echo Frontend will be available at: http://localhost:3000
echo Backend API will be available at: http://localhost:5000
echo.
echo Starting servers with concurrent execution...
call "C:\Program Files\nodejs\npm.cmd" run dev

echo.
echo If the servers don't start properly, try running manually:
echo npm run dev
echo.
pause 