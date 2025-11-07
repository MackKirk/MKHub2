# Script para modo integrado (build frontend + backend - simula Render)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Modo Integrado (Simula Render)" -ForegroundColor Cyan
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

# Verificar se node está instalado
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Erro: Node.js não encontrado. Instale Node.js primeiro." -ForegroundColor Red
    exit 1
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

# Instalar dependências Python
Write-Host "Verificando dependências Python..." -ForegroundColor Yellow
pip install --upgrade pip -q
Write-Host "Instalando dependências do requirements.txt..." -ForegroundColor Yellow
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao instalar dependências Python" -ForegroundColor Red
    Write-Host "Tentando instalar psycopg2-binary separadamente..." -ForegroundColor Yellow
    pip install psycopg2-binary --no-cache-dir
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Reinstalando dependências..." -ForegroundColor Yellow
        pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Erro ao instalar dependências Python" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Erro ao instalar dependências Python" -ForegroundColor Red
        exit 1
    }
}
Write-Host "Dependências Python instaladas!" -ForegroundColor Green
Write-Host ""

# Verificar se node_modules existe no frontend
Write-Host "Verificando dependências do frontend..." -ForegroundColor Yellow
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Instalando dependências do frontend (isso pode levar alguns minutos)..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao instalar dependências do frontend" -ForegroundColor Red
        Write-Host "Verifique se Node.js está instalado: https://nodejs.org/" -ForegroundColor Yellow
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "Dependências do frontend instaladas!" -ForegroundColor Green
} else {
    Write-Host "Dependências do frontend já instaladas" -ForegroundColor Green
}
Write-Host ""

# Build do frontend
Write-Host "Construindo frontend (isso pode levar alguns minutos)..." -ForegroundColor Yellow
Set-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao construir frontend" -ForegroundColor Red
    Write-Host "Verifique os erros acima" -ForegroundColor Yellow
    Set-Location ..
    exit 1
}
Set-Location ..
Write-Host ""

Write-Host "Frontend construído com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Iniciando backend..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Documentação: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Yellow
Write-Host ""

# Iniciar backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

