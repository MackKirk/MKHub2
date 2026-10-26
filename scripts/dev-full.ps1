# Script para modo integrado (build frontend + portal + backend - simula Render)
# Uso:
#   .\scripts\dev-full.ps1           → npm run build (frontend + portal) + uvicorn
#   .\scripts\dev-full.ps1 -Dev      → Vite hub (:5173) + Vite portal (:5174) + uvicorn --reload
#
# Em -Dev:
#   Hub staff:      http://localhost:5173
#   Customer portal: http://localhost:5174/portal/
# Ctrl+C encerra o backend e os processos Vite.

[CmdletBinding()]
param(
    [switch]$Dev
)

$ErrorActionPreference = "Stop"

$modeLabel = if ($Dev) { "Desenvolvimento (Vite HMR + API)" } else { "Integrado (Simula Render)" }
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - $modeLabel" -ForegroundColor Cyan
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

function Ensure-NpmDeps {
    param(
        [Parameter(Mandatory = $true)][string]$DirName,
        [Parameter(Mandatory = $true)][string]$Label
    )
    Write-Host "Verificando dependências do $Label..." -ForegroundColor Yellow
    if (-not (Test-Path $DirName)) {
        Write-Host "Erro: pasta '$DirName' não encontrada." -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path "$DirName\node_modules")) {
        Write-Host "Instalando dependências do $Label (isso pode levar alguns minutos)..." -ForegroundColor Yellow
        Set-Location $DirName
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Erro ao instalar dependências do $Label" -ForegroundColor Red
            Write-Host "Verifique se Node.js está instalado: https://nodejs.org/" -ForegroundColor Yellow
            Set-Location ..
            exit 1
        }
        Set-Location ..
        Write-Host "Dependências do $Label instaladas!" -ForegroundColor Green
    } else {
        Write-Host "Dependências do $Label já instaladas" -ForegroundColor Green
    }
    Write-Host ""
}

Ensure-NpmDeps -DirName "frontend" -Label "frontend (hub)"
Ensure-NpmDeps -DirName "portal" -Label "portal (customer)"

$viteRootProcess = $null
$portalViteProcess = $null

if ($Dev) {
    Write-Host "Modo -Dev: sem npm run build; iniciando Vite hub + portal (HMR)..." -ForegroundColor Yellow
    $frontendPath = (Resolve-Path "frontend").Path
    $portalPath = (Resolve-Path "portal").Path
    # Janelas separadas para logs; encerradas com taskkill /T ao sair do uvicorn
    $viteCmd = "Set-Location -LiteralPath '$frontendPath'; npm run dev"
    $viteRootProcess = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $viteCmd) `
        -PassThru
    Write-Host "Vite hub iniciado (PID $($viteRootProcess.Id))." -ForegroundColor Green

    $portalCmd = "Set-Location -LiteralPath '$portalPath'; npm run dev"
    $portalViteProcess = Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $portalCmd) `
        -PassThru
    Write-Host "Vite portal iniciado (PID $($portalViteProcess.Id))." -ForegroundColor Green
    Write-Host "Aguarde alguns segundos antes de abrir o browser." -ForegroundColor Green
    Write-Host ""
} else {
    # Build do frontend (hub)
    Write-Host "Construindo frontend / hub (isso pode levar alguns minutos)..." -ForegroundColor Yellow
    Set-Location frontend
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao construir frontend" -ForegroundColor Red
        Write-Host "Verifique os erros acima" -ForegroundColor Yellow
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "Frontend construído com sucesso!" -ForegroundColor Green
    Write-Host ""

    # Build do portal (customer)
    Write-Host "Construindo portal (customer)..." -ForegroundColor Yellow
    Set-Location portal
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao construir portal" -ForegroundColor Red
        Write-Host "Verifique os erros acima" -ForegroundColor Yellow
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "Portal construído com sucesso!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "Iniciando backend..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
if ($Dev) {
    Write-Host "Hub (staff):      http://localhost:5173" -ForegroundColor Cyan
    Write-Host "Portal (cliente): http://localhost:5174/portal/" -ForegroundColor Cyan
    Write-Host "API/docs:         http://localhost:8000  e  /docs" -ForegroundColor Cyan
} else {
    Write-Host "Hub (staff):      http://localhost:8000" -ForegroundColor Cyan
    Write-Host "Portal (cliente): http://localhost:8000/portal/" -ForegroundColor Cyan
    Write-Host "Documentação:     http://localhost:8000/docs" -ForegroundColor Cyan
}
$stopHint = if ($Dev) { " e os Vite (hub + portal)" } else { "" }
Write-Host "Pressione Ctrl+C para parar o backend$stopHint." -ForegroundColor Yellow
Write-Host ""

try {
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
} finally {
    foreach ($proc in @($viteRootProcess, $portalViteProcess)) {
        if ($null -ne $proc -and -not $proc.HasExited) {
            Write-Host ""
            Write-Host "Encerrando Vite (processo $($proc.Id))..." -ForegroundColor Yellow
            taskkill /PID $proc.Id /T /F 2>$null | Out-Null
        }
    }
}
