# LinkAndGears Web Server - PowerShell Startup Script

# Check if virtual environment exists, if not create it
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv
}

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Start the development server
Write-Host "Starting development server on http://127.0.0.1:8000" -ForegroundColor Green
uvicorn backend.main:app --reload