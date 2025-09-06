# Stop Investment Dashboard Script
# Safely stops all dashboard-related processes

Write-Host "Stopping Investment Dashboard..." -ForegroundColor Red
Write-Host ""

# Function to kill processes by port
function Kill-ProcessByPort {
    param([int]$Port, [string]$Service)
    
    Write-Host "Stopping $Service on port $Port..." -ForegroundColor Yellow
    
    $netstatResult = netstat -ano | Select-String ":$Port " | Where-Object { $_ -match "LISTENING" }
    
    if ($netstatResult) {
        foreach ($line in $netstatResult) {
            if ($line -match '\s+(\d+)$') {
                $processId = $matches[1]
                try {
                    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                    if ($process) {
                        Write-Host "  Killing $($process.ProcessName) (Process ID: $processId)" -ForegroundColor Yellow
                        Stop-Process -Id $processId -Force
                        Start-Sleep -Seconds 1
                    }
                } catch {
                    Write-Host "  Failed to kill Process ID $processId" -ForegroundColor Red
                }
            }
        }
        
        # Verify port is free
        Start-Sleep -Seconds 2
        $stillActive = netstat -ano | Select-String ":$Port " | Where-Object { $_ -match "LISTENING" }
        if ($stillActive) {
            Write-Host "  ⚠ Port $Port may still be in use" -ForegroundColor Red
        } else {
            Write-Host "  ✓ $Service stopped successfully" -ForegroundColor Green
        }
    } else {
        Write-Host "  ✓ $Service was not running" -ForegroundColor Green
    }
}

# Stop frontend and backend
Kill-ProcessByPort -Port 3000 -Service "Frontend"
Kill-ProcessByPort -Port 5000 -Service "Backend"

Write-Host ""
Write-Host "Stopping all Node.js processes..." -ForegroundColor Yellow

# Kill all Node.js processes
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js processes to stop" -ForegroundColor Yellow
    foreach ($proc in $nodeProcesses) {
        try {
            Write-Host "  Killing Node.js process ID: $($proc.Id)" -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force
        } catch {
            Write-Host "  Failed to kill Node.js process ID: $($proc.Id)" -ForegroundColor Red
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "No Node.js processes found" -ForegroundColor Green
}

# Kill npm/npx processes
$npmProcesses = Get-Process -Name "npm", "npx" -ErrorAction SilentlyContinue
if ($npmProcesses) {
    Write-Host "Stopping npm/npx processes..." -ForegroundColor Yellow
    $npmProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "Final cleanup..." -ForegroundColor Yellow

# Aggressive cleanup if needed
taskkill /F /IM node.exe /T 2>$null
taskkill /F /IM npm.cmd /T 2>$null
taskkill /F /IM npx.cmd /T 2>$null

Start-Sleep -Seconds 2

# Final verification
Write-Host "Verifying shutdown..." -ForegroundColor Yellow
$remainingNodes = Get-Process -Name "node" -ErrorAction SilentlyContinue
$port3000Active = netstat -ano | Select-String ":3000 " | Where-Object { $_ -match "LISTENING" }
$port5000Active = netstat -ano | Select-String ":5000 " | Where-Object { $_ -match "LISTENING" }

if ($remainingNodes) {
    Write-Host "⚠ Warning: $($remainingNodes.Count) Node.js processes still running" -ForegroundColor Red
} else {
    Write-Host "✓ All Node.js processes stopped" -ForegroundColor Green
}

if ($port3000Active -or $port5000Active) {
    Write-Host "⚠ Warning: Some dashboard ports may still be in use" -ForegroundColor Red
    if ($port3000Active) { Write-Host "  Port 3000 still active" -ForegroundColor Red }
    if ($port5000Active) { Write-Host "  Port 5000 still active" -ForegroundColor Red }
} else {
    Write-Host "✓ All dashboard ports are free" -ForegroundColor Green
}

Write-Host ""
Write-Host "Dashboard shutdown complete!" -ForegroundColor Green
Write-Host "Use .\start.ps1 to restart the dashboard" -ForegroundColor Cyan