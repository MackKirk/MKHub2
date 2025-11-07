# Script simples para iniciar o backend e verificar erros

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Iniciando Backend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se estamos no diretório raiz
if (-not (Test-Path "app\main.py")) {
    Write-Host "Erro: Execute este script a partir do diretório raiz do projeto" -ForegroundColor Red
    exit 1
}

# Verificar .env
if (-not (Test-Path ".env")) {
    Write-Host "AVISO: Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host "Execute: .\scripts\setup-env.ps1" -ForegroundColor Yellow
    Write-Host ""
}

# Verificar venv
if (-not (Test-Path ".venv")) {
    Write-Host "Criando ambiente virtual..." -ForegroundColor Yellow
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao criar venv" -ForegroundColor Red
        exit 1
    }
}

# Ativar venv
Write-Host "Ativando ambiente virtual..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Verificar se uvicorn está instalado
Write-Host "Verificando dependências..." -ForegroundColor Yellow
python -c "import uvicorn" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Instalando dependências..." -ForegroundColor Yellow
    pip install -q -r requirements.txt
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Iniciando backend..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend será iniciado em: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Documentação: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Iniciar backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

