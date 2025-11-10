# Script auxiliar para instalar dependências Python corretamente

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Instalacao de Dependencias" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se venv existe
if (-not (Test-Path ".venv")) {
    Write-Host "Erro: Ambiente virtual nao encontrado. Execute dev.ps1 primeiro." -ForegroundColor Red
    exit 1
}

# Ativar venv
Write-Host "Ativando ambiente virtual..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Atualizar pip, setuptools e wheel primeiro
Write-Host "Atualizando pip, setuptools e wheel..." -ForegroundColor Yellow
python -m pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao atualizar pip/setuptools" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Instalar psycopg2-binary primeiro (pode ser problemático)
Write-Host "Instalando psycopg2-binary..." -ForegroundColor Yellow
pip install psycopg2-binary==2.9.9 --no-cache-dir
if ($LASTEXITCODE -ne 0) {
    Write-Host "Aviso: Erro ao instalar psycopg2-binary" -ForegroundColor Yellow
    Write-Host "Tentando instalar versao mais recente..." -ForegroundColor Yellow
    pip install psycopg2-binary --no-cache-dir --upgrade
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro: Nao foi possivel instalar psycopg2-binary" -ForegroundColor Red
        Write-Host "Isso pode ser necessario apenas se voce usar PostgreSQL." -ForegroundColor Yellow
        Write-Host "Se estiver usando SQLite, pode continuar." -ForegroundColor Yellow
        $continue = Read-Host "Deseja continuar mesmo assim? (S/N)"
        if ($continue -ne "S" -and $continue -ne "s") {
            exit 1
        }
    }
}

Write-Host ""

# Instalar outras dependências
Write-Host "Instalando outras dependencias..." -ForegroundColor Yellow
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao instalar dependencias" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[OK] Dependencias instaladas com sucesso!" -ForegroundColor Green
Write-Host ""

