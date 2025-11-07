# Script para testar se o backend inicia corretamente

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Teste do Backend" -ForegroundColor Cyan
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
    exit 1
}

# Verificar venv
if (-not (Test-Path ".venv")) {
    Write-Host "Erro: Ambiente virtual não encontrado!" -ForegroundColor Red
    Write-Host "Execute: .\scripts\dev-backend.ps1 (ele cria o venv automaticamente)" -ForegroundColor Yellow
    exit 1
}

# Ativar venv
Write-Host "Ativando ambiente virtual..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Testar importação do app
Write-Host "Testando importação do app..." -ForegroundColor Yellow
try {
    python -c "from app.main import app; print('✓ App importado com sucesso!')"
    if ($LASTEXITCODE -ne 0) {
        throw "Erro ao importar app"
    }
} catch {
    Write-Host "Erro ao importar o app. Verifique se todas as dependências estão instaladas." -ForegroundColor Red
    Write-Host "Execute: pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "✓ Backend está pronto para iniciar!" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar o backend, execute:" -ForegroundColor Cyan
Write-Host "  .\scripts\dev-backend.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Ou use o modo integrado:" -ForegroundColor Cyan
Write-Host "  .\scripts\dev.ps1 -Mode full" -ForegroundColor White
Write-Host ""

