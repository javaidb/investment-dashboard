@echo off
echo Starting Investment Dashboard...
echo.

echo Activating Python virtual environment...
call venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo ERROR: Failed to activate virtual environment
    echo Make sure the virtual environment exists at venv\
    pause
    exit /b 1
)

echo Virtual environment activated. Installing dependencies...
echo.

echo Installing root dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install root dependencies
    pause
    exit /b 1
)

echo Installing server dependencies...
cd server
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install server dependencies
    pause
    exit /b 1
)

echo Installing client dependencies...
cd ../client
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install client dependencies
    pause
    exit /b 1
)

cd ..

echo.
echo Dependencies installed successfully!
echo.
echo IMPORTANT: Before starting the application:
echo 1. Copy server/env.example to server/.env
echo 2. Add your API keys to server/.env
echo 3. See SETUP.md for detailed instructions
echo.
echo Starting development servers...
echo.

echo Opening dashboard in browser in 5 seconds...
timeout /t 5 /nobreak >nul
start http://localhost:3000

call npm run dev

pause 