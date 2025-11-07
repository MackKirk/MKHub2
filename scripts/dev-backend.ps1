# Script para rodar apenas o backend em desenvolvimento

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Backend (Desenvolvimento)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se estamos no diretório raiz
if (-not (Test-Path "app\main.py")) {
    Write-Host "Erro: Execute este script a partir do diretório raiz do projeto" -ForegroundColor Red
    exit 1
}

# Verificar se .env existe
if (-not (Test-Path ".env")) {
    Write-Host "AVISO: Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host "Copie .env.example para .env e configure as variáveis:" -ForegroundColor Yellow
    Write-Host "  Copy-Item .env.example .env" -ForegroundColor Yellow
    Write-Host ""
}

# Verificar/criar venv
if (-not (Test-Path ".venv")) {
    Write-Host "Criando ambiente virtual Python..." -ForegroundColor Yellow
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao criar venv" -ForegroundColor Red
        exit 1
    }
}

# Ativar venv
Write-Host "Ativando ambiente virtual..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Atualizar pip e setuptools primeiro
Write-Host "Atualizando pip e setuptools..." -ForegroundColor Yellow
python -m pip install --upgrade pip setuptools wheel -q
if ($LASTEXITCODE -ne 0) {
    Write-Host "Aviso: Erro ao atualizar pip/setuptools, continuando..." -ForegroundColor Yellow
}

# Instalar dependências
Write-Host "Verificando dependências Python..." -ForegroundColor Yellow
pip install --upgrade pip -q
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao instalar dependências" -ForegroundColor Red
    Write-Host "Tentando instalar psycopg2-binary separadamente..." -ForegroundColor Yellow
    pip install psycopg2-binary --no-cache-dir
    if ($LASTEXITCODE -eq 0) {
        pip install -r requirements.txt
    } else {
        Write-Host "Erro ao instalar dependências" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Yellow
Write-Host ""

# Iniciar backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

