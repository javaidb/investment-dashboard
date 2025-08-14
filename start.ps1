# Investment Dashboard Startup Script (PowerShell)
Write-Host "Starting Investment Dashboard..." -ForegroundColor Green
Write-Host ""

# Check Node.js installation
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "KILLING EXISTING PROCESSES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Kill all Node.js processes
Write-Host "Killing all Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js processes, killing them..." -ForegroundColor Yellow
    $nodeProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    
    # Double-check they're gone
    $remainingNodes = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($remainingNodes) {
        Write-Host "Warning: $($remainingNodes.Count) Node.js processes still running, force killing..." -ForegroundColor Red
        $remainingNodes | Stop-Process -Force
        Start-Sleep -Seconds 3
    }
} else {
    Write-Host "No Node.js processes found to kill." -ForegroundColor Green
}

# Kill processes on specific ports
$ports = @(3000, 5000)
foreach ($port in $ports) {
    Write-Host "Checking port $port..." -ForegroundColor Yellow
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($processes) {
        Write-Host "Found processes on port $port, killing them..." -ForegroundColor Yellow
        foreach ($pid in $processes) {
            try {
                Stop-Process -Id $pid -Force
                Write-Host "Killed process $pid on port $port" -ForegroundColor Green
            } catch {
                Write-Host "Failed to kill process $pid on port $port" -ForegroundColor Red
            }
        }
        Start-Sleep -Seconds 3
    } else {
        Write-Host "Port $port is free" -ForegroundColor Green
    }
}

# Double-check ports are free
Write-Host "Double-checking ports are free..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$stillInUse = Get-NetTCPConnection -LocalPort 3000,5000 -ErrorAction SilentlyContinue
if ($stillInUse) {
    Write-Host "WARNING: Ports may still be in use. Trying to kill again..." -ForegroundColor Red
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 3
} else {
    Write-Host "Ports are confirmed free." -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INSTALLING DEPENDENCIES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Install dependencies
Write-Host "Installing root dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install root dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Installing server dependencies..." -ForegroundColor Yellow
Set-Location server
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install server dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Installing client dependencies..." -ForegroundColor Yellow
Set-Location ../client
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install client dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Set-Location ..

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ENVIRONMENT CHECK" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check for .env file
Write-Host "Checking for server/.env file..." -ForegroundColor Yellow
if (-not (Test-Path "server\.env")) {
    Write-Host "ERROR: server/.env file not found!" -ForegroundColor Red
    Write-Host "Please copy server/env.example to server/.env and add your API keys" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Environment file found." -ForegroundColor Green

# Check for optional API keys (not required for core functionality)
Write-Host "Checking for optional API keys..." -ForegroundColor Yellow
$envContent = Get-Content "server\.env" -Raw
if ($envContent -match "ALPHA_VANTAGE_API_KEY=\w+") {
    Write-Host "Alpha Vantage API key found (enables search functionality)" -ForegroundColor Green
} else {
    Write-Host "Alpha Vantage API key not found (search functionality disabled)" -ForegroundColor Yellow
}

Write-Host "Proceeding with available configuration..." -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STARTING SERVERS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Open browser
Write-Host "Opening dashboard in browser in 5 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Start-Process "http://localhost:3000"

Write-Host "Starting both frontend and backend servers..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Frontend will be available at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend API will be available at: http://localhost:5000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting servers with concurrent execution..." -ForegroundColor Yellow

# Start the servers
npm run dev

Write-Host ""
Write-Host "If the servers don't start properly, try running manually:" -ForegroundColor Yellow
Write-Host "npm run dev" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit" 