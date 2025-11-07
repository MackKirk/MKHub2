# Script de Desenvolvimento - MK Hub
# Permite escolher entre modo rápido (frontend+backend separados) ou integrado (simula Render)

param(
    [string]$Mode = "fast"
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Ambiente de Desenvolvimento" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se estamos no diretório raiz
if (-not (Test-Path "app\main.py")) {
    Write-Host "Erro: Execute este script a partir do diretório raiz do projeto" -ForegroundColor Red
    exit 1
}

# Escolher modo
if ($Mode -eq "fast") {
    Write-Host "Modo: RÁPIDO (Frontend + Backend separados)" -ForegroundColor Green
    Write-Host "Frontend: http://localhost:5173 (Vite dev server)" -ForegroundColor Cyan
    Write-Host "Backend:  http://localhost:8000 (FastAPI)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Iniciando backend e frontend em janelas separadas..." -ForegroundColor Yellow
    Write-Host ""
    
    # Verificar se Node.js está instalado
    try {
        $nodeVersion = node --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Node.js não encontrado"
        }
        Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
    } catch {
        Write-Host "ERRO: Node.js não encontrado!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Para usar o modo rápido, você precisa instalar Node.js:" -ForegroundColor Yellow
        Write-Host "  1. Baixe em: https://nodejs.org/" -ForegroundColor White
        Write-Host "  2. Instale e reinicie o terminal" -ForegroundColor White
        Write-Host ""
        Write-Host "OU use o modo integrado que não precisa do Node.js rodando:" -ForegroundColor Yellow
        Write-Host "  .\scripts\dev-full.ps1" -ForegroundColor Cyan
        Write-Host ""
        exit 1
    }
    
    # Criar scripts temporários para cada serviço
    $backendScript = Join-Path $env:TEMP "mkhub-backend.ps1"
    $frontendScript = Join-Path $env:TEMP "mkhub-frontend.ps1"
    
    # Script do backend
    @"
cd '$PWD'
& .\scripts\dev-backend.ps1
"@ | Out-File -FilePath $backendScript -Encoding UTF8
    
    # Script do frontend
    @"
cd '$PWD'
& .\scripts\dev-frontend.ps1
"@ | Out-File -FilePath $frontendScript -Encoding UTF8
    
    # Iniciar backend em janela separada
    Write-Host "Iniciando backend em nova janela..." -ForegroundColor Yellow
    $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-File", $backendScript -PassThru
    
    # Aguardar um pouco para o backend iniciar
    Start-Sleep -Seconds 3
    
    # Iniciar frontend em janela separada
    Write-Host "Iniciando frontend em nova janela..." -ForegroundColor Yellow
    $frontendProcess = Start-Process powershell -ArgumentList "-NoExit", "-File", $frontendScript -PassThru
    
    Write-Host ""
    Write-Host "✓ Backend e frontend iniciados em janelas separadas!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Acesse:" -ForegroundColor Cyan
    Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
    Write-Host "  Backend:  http://localhost:8000" -ForegroundColor White
    Write-Host ""
    Write-Host "Para parar os serviços, feche as janelas do PowerShell ou pressione Ctrl+C aqui." -ForegroundColor Yellow
    Write-Host ""
    
    # Aguardar até que o usuário pressione Ctrl+C
    try {
        while ($true) {
            Start-Sleep -Seconds 1
            # Verificar se os processos ainda estão rodando
            if (-not (Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue)) {
                Write-Host "Backend parou." -ForegroundColor Yellow
                break
            }
            if (-not (Get-Process -Id $frontendProcess.Id -ErrorAction SilentlyContinue)) {
                Write-Host "Frontend parou." -ForegroundColor Yellow
                break
            }
        }
    } catch {
        # Ctrl+C foi pressionado
    } finally {
        # Limpar scripts temporários
        Remove-Item $backendScript -ErrorAction SilentlyContinue
        Remove-Item $frontendScript -ErrorAction SilentlyContinue
        
        # Tentar parar processos se ainda estiverem rodando
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host ""
        Write-Host "Serviços parados." -ForegroundColor Green
    }
    
} elseif ($Mode -eq "full") {
    Write-Host "Modo: INTEGRADO (Build frontend + Backend - simula Render)" -ForegroundColor Green
    Write-Host "Executando script dev-full.ps1..." -ForegroundColor Yellow
    Write-Host ""
    
    # Simplesmente chamar o script dev-full.ps1
    & .\scripts\dev-full.ps1
    
} else {
    Write-Host "Modo inválido: $Mode" -ForegroundColor Red
    Write-Host "Modos disponíveis: fast, full" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Uso:" -ForegroundColor Cyan
    Write-Host "  .\scripts\dev.ps1          # Modo rápido (padrão)" -ForegroundColor White
    Write-Host "  .\scripts\dev.ps1 -Mode fast  # Modo rápido (frontend + backend separados)" -ForegroundColor White
    Write-Host "  .\scripts\dev.ps1 -Mode full   # Modo integrado (build + backend)" -ForegroundColor White
    Write-Host ""
    Write-Host "Ou use os scripts específicos diretamente:" -ForegroundColor Cyan
    Write-Host "  .\scripts\dev-backend.ps1   # Apenas backend" -ForegroundColor White
    Write-Host "  .\scripts\dev-frontend.ps1   # Apenas frontend" -ForegroundColor White
    Write-Host "  .\scripts\dev-full.ps1       # Modo integrado" -ForegroundColor White
    exit 1
}
