# Evolve One-Click Installer for Windows PowerShell
# Usage: irm https://raw.githubusercontent.com/JhaSourav07/evolve/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ✦ EVOLVE — Autonomous AI Software Engineer" -ForegroundColor Cyan
Write-Host "  Windows 1-Click Installer" -ForegroundColor Cyan
Write-Host ""

# 1. Check Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "✖ Git is required but not installed. Please install Git for Windows (https://git-scm.com/)." -ForegroundColor Red
    exit 1
}

# 2. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "✖ Node.js is required but not installed. Please install Node.js >= 20.0.0 (https://nodejs.org/)." -ForegroundColor Red
    exit 1
}

$nodeVersion = node -v
$nodeMajor = [int]($nodeVersion -replace 'v', '').Split('.')[0]
if ($nodeMajor -lt 20) {
    Write-Host "✖ Node.js >= 20.0.0 is required (detected $nodeVersion)." -ForegroundColor Red
    exit 1
}
Write-Host "✔ Node.js detected: $nodeVersion" -ForegroundColor Green

# 3. Check / Install pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "→ Installing pnpm..." -ForegroundColor Cyan
    npm install -g pnpm
}
$pnpmVersion = pnpm -v
Write-Host "✔ pnpm detected: $pnpmVersion" -ForegroundColor Green

# 4. Clone or Update
$installDir = Join-Path $HOME ".evolve\repo"
$binDir = Join-Path $HOME ".local\bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

if (Test-Path (Join-Path $installDir ".git")) {
    Write-Host "→ Updating existing Evolve in $installDir..." -ForegroundColor Cyan
    Set-Location $installDir
    git fetch origin main --quiet
    git reset --hard origin/main --quiet
} else {
    Write-Host "→ Cloning Evolve into $installDir..." -ForegroundColor Cyan
    git clone --depth 1 https://github.com/JhaSourav07/evolve.git $installDir --quiet
    Set-Location $installDir
}

# 5. Build
Write-Host "→ Installing dependencies and building packages..." -ForegroundColor Cyan
pnpm install --silent
pnpm run build

# 6. Create evolve.cmd wrapper in binDir
$cmdWrapper = Join-Path $binDir "evolve.cmd"
$wrapperContent = @"
@echo off
node "$installDir\apps\cli\dist\index.js" %*
"@
Set-Content -Path $cmdWrapper -Value $wrapperContent -Encoding ASCII
Write-Host "✔ Created executable wrapper: $cmdWrapper" -ForegroundColor Green

# 7. Add to User PATH if missing
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
    $env:Path = "$env:Path;$binDir"
    Write-Host "✔ Added $binDir to user PATH." -ForegroundColor Green
}

# 8. Check Ollama
Write-Host ""
Write-Host "→ Checking Ollama connection..." -ForegroundColor Cyan
try {
    $res = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "✔ Ollama is running locally." -ForegroundColor Green
} catch {
    Write-Host "⚠ Ollama was not detected on http://localhost:11434." -ForegroundColor Yellow
    Write-Host "  To start Ollama, install it from https://ollama.com and run: ollama run qwen2.5-coder:7b"
}

Write-Host ""
Write-Host "🎉 Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Start using Evolve in any repository:"
Write-Host "  evolve" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Or run a task immediately:"
Write-Host '  evolve chat "Inspect this repository and explain architecture"' -ForegroundColor Cyan
Write-Host ""
