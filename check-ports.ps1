# Port and Process Checker for Investment Dashboard
# Quick utility to check what's running on dashboard ports

Write-Host "Investment Dashboard - Port Status Check" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""

# Function to check a specific port
function Check-Port {
    param([int]$Port, [string]$Service)
    
    Write-Host "Checking port $Port ($Service)..." -ForegroundColor Yellow
    
    # Check using netstat
    $netstatResult = netstat -ano | findstr ":$Port "
    $listeningPorts = $netstatResult | findstr "LISTENING"
    
    if ($listeningPorts) {
        Write-Host "Port $Port is IN USE" -ForegroundColor Red
        
        $listeningPorts | ForEach-Object {
            if ($_ -match '\s+(\d+)\s*$') {
                $processId = $matches[1]
                try {
                    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                    if ($process) {
                        $processName = $process.ProcessName
                        $startTime = $process.StartTime.ToString("HH:mm:ss")
                        Write-Host "  Process: $processName [ID:$processId] started at $startTime" -ForegroundColor Gray
                    }
                } catch {
                    Write-Host "  Unknown process [ID:$processId]" -ForegroundColor Gray
                }
            }
        }
    } else {
        Write-Host "Port $Port is FREE" -ForegroundColor Green
    }
    
    Write-Host ""
}

# Check dashboard ports
Check-Port -Port 3000 -Service "Frontend"
Check-Port -Port 5000 -Service "Backend API"

# Check for Node.js processes
Write-Host "Node.js Processes:" -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js processes:" -ForegroundColor Yellow
    foreach ($proc in $nodeProcesses) {
        $startTime = $proc.StartTime.ToString("HH:mm:ss")
        $cpuTime = [math]::Round($proc.TotalProcessorTime.TotalSeconds, 1)
        Write-Host "  Process ID $($proc.Id) | Started: $startTime | CPU: ${cpuTime}s" -ForegroundColor Gray
    }
} else {
    Write-Host "No Node.js processes found" -ForegroundColor Green
}

Write-Host ""

# Check for npm/npx processes
$npmProcesses = Get-Process -Name "npm", "npx" -ErrorAction SilentlyContinue
if ($npmProcesses) {
    Write-Host "NPM/NPX Processes:" -ForegroundColor Yellow
    foreach ($proc in $npmProcesses) {
        $startTime = $proc.StartTime.ToString("HH:mm:ss")
        Write-Host "  $($proc.ProcessName) Process ID $($proc.Id) | Started: $startTime" -ForegroundColor Gray
    }
    Write-Host ""
}

# Show quick actions
Write-Host "Quick Actions:" -ForegroundColor Cyan
Write-Host "1. Kill all Node.js processes: Get-Process -Name 'node' | Stop-Process -Force" -ForegroundColor Gray
Write-Host "2. Kill process on port 3000: netstat -ano | findstr :3000" -ForegroundColor Gray
Write-Host "3. Kill process on port 5000: netstat -ano | findstr :5000" -ForegroundColor Gray
Write-Host "4. Start dashboard: .\start.ps1" -ForegroundColor Gray
Write-Host ""

# Check if dashboard should be accessible
$frontendRunning = netstat -ano | findstr ":3000 " | findstr "LISTENING"
$backendRunning = netstat -ano | findstr ":5000 " | findstr "LISTENING"

if ($frontendRunning -and $backendRunning) {
    Write-Host "Dashboard should be accessible at: http://localhost:3000" -ForegroundColor Green
} elseif ($frontendRunning) {
    Write-Host "Frontend is running but backend is not" -ForegroundColor Yellow
} elseif ($backendRunning) {
    Write-Host "Backend is running but frontend is not" -ForegroundColor Yellow
} else {
    Write-Host "Dashboard is not running" -ForegroundColor Red
}