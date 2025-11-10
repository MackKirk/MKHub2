# Script para rodar apenas o frontend em desenvolvimento

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Frontend (Desenvolvimento)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se estamos no diretório raiz
if (-not (Test-Path "frontend\package.json")) {
    Write-Host "Erro: Execute este script a partir do diretório raiz do projeto" -ForegroundColor Red
    exit 1
}

# Verificar se node está instalado
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Erro: Node.js não encontrado. Instale Node.js primeiro." -ForegroundColor Red
    exit 1
}

# Verificar se npm está instalado
try {
    $npmVersion = npm --version
    Write-Host "npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "Erro: npm não encontrado. Instale npm primeiro." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Verificar se node_modules existe
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Instalando dependências do frontend..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao instalar dependências" -ForegroundColor Red
        exit 1
    }
    Set-Location ..
} else {
    Write-Host "Dependências do frontend já instaladas" -ForegroundColor Green
}

Write-Host ""
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Backend esperado em: http://localhost:8000" -ForegroundColor Yellow
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Yellow
Write-Host ""

# Iniciar frontend
Set-Location frontend
npm run dev

