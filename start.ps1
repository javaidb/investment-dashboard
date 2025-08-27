# Investment Dashboard Startup Script (PowerShell)
# Enhanced version with robust port and process management

Write-Host "Starting Investment Dashboard..." -ForegroundColor Green
Write-Host ""

# Enhanced function to kill processes by port
function Kill-ProcessByPort {
    param([int]$Port)
    
    Write-Host "Checking port $Port..." -ForegroundColor Yellow
    
    # Try netstat first (more reliable)
    $netstatResult = netstat -ano | Select-String ":$Port " | Where-Object { $_ -match "LISTENING" }
    
    if ($netstatResult) {
        foreach ($line in $netstatResult) {
            if ($line -match '\s+(\d+)$') {
                $processId = $matches[1]
                try {
                    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "Killing process '$($process.ProcessName)' (PID: $processId) on port $Port" -ForegroundColor Yellow
                        Stop-Process -Id $processId -Force
                        Start-Sleep -Seconds 1
                    }
                } catch {
                    Write-Host "Failed to kill PID $processId on port $Port" -ForegroundColor Red
                }
            }
        }
    }
    
    # Fallback to Get-NetTCPConnection if available
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($connections) {
            foreach ($conn in $connections) {
                try {
                    $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "Killing process '$($process.ProcessName)' (PID: $($conn.OwningProcess)) on port $Port" -ForegroundColor Yellow
                        Stop-Process -Id $conn.OwningProcess -Force
                        Start-Sleep -Seconds 1
                    }
                } catch {
                    Write-Host "Failed to kill PID $($conn.OwningProcess) on port $Port" -ForegroundColor Red
                }
            }
        }
    } catch {
        # Get-NetTCPConnection might not be available on some systems
    }
    
    # Final check
    Start-Sleep -Seconds 2
    $stillActive = netstat -ano | Select-String ":$Port " | Where-Object { $_ -match "LISTENING" }
    if ($stillActive) {
        Write-Host "WARNING: Port $Port may still be in use" -ForegroundColor Red
        return $false
    } else {
        Write-Host "Port $Port is now free" -ForegroundColor Green
        return $true
    }
}

# Enhanced function to kill Node.js processes
function Kill-NodeProcesses {
    Write-Host "Killing Node.js processes..." -ForegroundColor Yellow
    
    # Kill by process name
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Host "Found $($nodeProcesses.Count) Node.js processes" -ForegroundColor Yellow
        foreach ($proc in $nodeProcesses) {
            try {
                Write-Host "Killing Node.js process PID: $($proc.Id)" -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force
            } catch {
                Write-Host "Failed to kill Node.js process PID: $($proc.Id)" -ForegroundColor Red
            }
        }
        Start-Sleep -Seconds 3
    }
    
    # Also kill any npm or npx processes
    $npmProcesses = Get-Process -Name "npm", "npx" -ErrorAction SilentlyContinue
    if ($npmProcesses) {
        Write-Host "Found $($npmProcesses.Count) npm/npx processes" -ForegroundColor Yellow
        $npmProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    # Check for remaining Node processes
    $remainingNodes = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($remainingNodes) {
        Write-Host "WARNING: $($remainingNodes.Count) Node.js processes still running after cleanup" -ForegroundColor Red
        return $false
    } else {
        Write-Host "All Node.js processes cleared" -ForegroundColor Green
        return $true
    }
}

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
Write-Host "CLEANING PROCESSES AND PORTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Kill Node.js processes first
$nodeCleanSuccess = Kill-NodeProcesses

# Kill processes on dashboard ports
$ports = @(3000, 5000)
$portCleanSuccess = $true
foreach ($port in $ports) {
    $result = Kill-ProcessByPort -Port $port
    if (-not $result) {
        $portCleanSuccess = $false
    }
}

# If cleanup failed, try more aggressive approach
if (-not $nodeCleanSuccess -or -not $portCleanSuccess) {
    Write-Host ""
    Write-Host "Performing aggressive cleanup..." -ForegroundColor Red
    
    # Try taskkill for stubborn processes
    taskkill /F /IM node.exe /T 2>$null
    taskkill /F /IM npm.cmd /T 2>$null
    taskkill /F /IM npx.cmd /T 2>$null
    
    Start-Sleep -Seconds 3
    
    # Final port check
    foreach ($port in $ports) {
        $stillActive = netstat -ano | Select-String ":$port " | Where-Object { $_ -match "LISTENING" }
        if ($stillActive) {
            Write-Host "CRITICAL: Port $port is still in use after aggressive cleanup!" -ForegroundColor Red
            Write-Host "You may need to restart your computer or manually kill processes" -ForegroundColor Red
        }
    }
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
Write-Host "Starting servers..." -ForegroundColor Yellow
npm run dev 