# Quick Restart Script for Investment Dashboard
Write-Host "Restarting Investment Dashboard..." -ForegroundColor Green
Write-Host ""

# Kill all Node.js processes
Write-Host "Killing existing Node.js processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill processes on specific ports
$ports = @(3000, 5000)
foreach ($port in $ports) {
    Write-Host "Freeing port $port..." -ForegroundColor Yellow
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($processes) {
        foreach ($pid in $processes) {
            try {
                Stop-Process -Id $pid -Force
                Write-Host "Killed process on port $port" -ForegroundColor Green
            } catch {
                Write-Host "Could not kill process on port $port" -ForegroundColor Red
            }
        }
    }
}

# Wait a moment for processes to fully terminate
Start-Sleep -Seconds 3

Write-Host "Starting servers..." -ForegroundColor Green
npm run dev