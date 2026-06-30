# MK Hub Mobile - Backend + emulador Android + Expo
# Uso (na raiz do projeto):
#   .\scripts\dev-mobile.ps1
#   .\scripts\dev-mobile.ps1 -Avd Medium_Phone_API_36.1
#   .\scripts\dev-mobile.ps1 -SkipBackend

param(
    [string]$Avd = "Pixel_9_Pro",
    [switch]$SkipBackend,
    [string]$ApiBaseUrl = "http://10.0.2.2:8000",
    [int]$Port = 8081
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MK Hub - Mobile (Android + Expo)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "app\main.py")) {
    Write-Host "Erro: Execute este script a partir do diretorio raiz do projeto" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "mobile\mk-hub-mobile\package.json")) {
    Write-Host "Erro: App mobile nao encontrado em mobile\mk-hub-mobile" -ForegroundColor Red
    exit 1
}

try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Node.js nao encontrado" }
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Erro: Node.js nao encontrado. Instale em https://nodejs.org/" -ForegroundColor Red
    exit 1
}

$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot -and $env:LOCALAPPDATA) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) {
        $sdkRoot = $defaultSdk
    }
}

if (-not $sdkRoot -or -not (Test-Path $sdkRoot)) {
    Write-Host "Erro: Android SDK nao encontrado." -ForegroundColor Red
    Write-Host "Instale o Android Studio ou defina ANDROID_HOME." -ForegroundColor Yellow
    exit 1
}

$adb = Join-Path $sdkRoot "platform-tools\adb.exe"
$emulatorExe = Join-Path $sdkRoot "emulator\emulator.exe"

if (-not (Test-Path $adb)) {
    Write-Host "Erro: adb nao encontrado em $adb" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $emulatorExe)) {
    Write-Host "Erro: emulator nao encontrado em $emulatorExe" -ForegroundColor Red
    exit 1
}

Write-Host "Android SDK: $sdkRoot" -ForegroundColor Green

$avds = & $emulatorExe -list-avds 2>&1
if ($LASTEXITCODE -ne 0 -or -not $avds) {
    Write-Host "Erro: Nenhum emulador (AVD) configurado no Android Studio." -ForegroundColor Red
    exit 1
}

if ($Avd -notin $avds) {
    Write-Host "AVD '$Avd' nao encontrado. Disponiveis:" -ForegroundColor Yellow
    $avds | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
    $Avd = ($avds | Select-Object -First 1).ToString().Trim()
    Write-Host "Usando: $Avd" -ForegroundColor Yellow
}

if (-not (Test-Path "mobile\mk-hub-mobile\node_modules")) {
    Write-Host "Instalando dependencias do app mobile..." -ForegroundColor Yellow
    Push-Location "mobile\mk-hub-mobile"
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao instalar dependencias mobile" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Host "Dependencias mobile: OK" -ForegroundColor Green
}

if (-not (Test-Path ".env")) {
    Write-Host "AVISO: .env nao encontrado na raiz - backend pode falhar." -ForegroundColor Yellow
    Write-Host "  Copy-Item .env.example .env" -ForegroundColor Yellow
    Write-Host ""
}

function Test-EmulatorReady {
    param([string]$AdbPath)
    $devices = & $AdbPath devices 2>&1 | Out-String
    if ($devices -notmatch "emulator-\d+\s+device") {
        return $false
    }
    $boot = & $AdbPath shell getprop sys.boot_completed 2>&1
    return ($boot -match "1")
}

function Wait-EmulatorReady {
    param(
        [string]$AdbPath,
        [int]$TimeoutSeconds = 180
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $dots = 0
    while ((Get-Date) -lt $deadline) {
        if (Test-EmulatorReady -AdbPath $AdbPath) {
            return $true
        }
        $dots = ($dots + 1) % 4
        Write-Host ("Aguardando emulador" + ("." * $dots)) -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
    return $false
}

function Stop-MetroOnPort {
    param([int]$ListenPort)
    $pids = @()

    try {
        $connections = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            if ($conn.OwningProcess -gt 0) {
                $pids += $conn.OwningProcess
            }
        }
    } catch {
        # fallback para ambientes sem Get-NetTCPConnection
    }

    if (-not $pids) {
        $netstat = netstat -ano 2>&1 | Out-String
        foreach ($line in ($netstat -split "`n")) {
            if ($line -match ":$ListenPort\s+.*LISTENING\s+(\d+)\s*$") {
                $pids += [int]$Matches[1]
            }
        }
    }

    foreach ($procId in ($pids | Select-Object -Unique)) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -match "^(node|expo)$") {
            Write-Host "Encerrando Metro/Expo antigo (PID $procId) na porta $ListenPort..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }

    Start-Sleep -Seconds 1
}

$backendProcess = $null
$expoProcess = $null
$backendScript = Join-Path $env:TEMP "mkhub-mobile-backend.ps1"
$expoScript = Join-Path $env:TEMP "mkhub-mobile-expo.ps1"

try {
    if (-not $SkipBackend) {
        Write-Host ""
        Write-Host "Iniciando backend em nova janela..." -ForegroundColor Yellow

        $backendLines = @(
            "Set-Location '$($PWD.Path)'"
            "& .\scripts\start-backend.ps1"
        )
        ($backendLines -join [Environment]::NewLine) | Out-File -FilePath $backendScript -Encoding UTF8

        $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-File", $backendScript -PassThru
        Write-Host "Backend: http://localhost:8000 (emulador usa $ApiBaseUrl)" -ForegroundColor Cyan
        Start-Sleep -Seconds 3
    } else {
        Write-Host "Pulando backend (-SkipBackend). API esperada em $ApiBaseUrl" -ForegroundColor Yellow
    }

    Write-Host ""
    if (Test-EmulatorReady -AdbPath $adb) {
        Write-Host "Emulador Android ja esta pronto." -ForegroundColor Green
    } else {
        Write-Host "Iniciando emulador: $Avd ..." -ForegroundColor Yellow
        Start-Process -FilePath $emulatorExe -ArgumentList "-avd", $Avd | Out-Null

        if (-not (Wait-EmulatorReady -AdbPath $adb)) {
            Write-Host "Erro: emulador nao ficou pronto a tempo." -ForegroundColor Red
            exit 1
        }
        Write-Host "Emulador pronto." -ForegroundColor Green
    }

    $mobileDir = Join-Path $PWD.Path "mobile\mk-hub-mobile"
    Write-Host ""
    Stop-MetroOnPort -ListenPort $Port
    Write-Host "Iniciando Expo em nova janela..." -ForegroundColor Yellow

    $expoLines = @(
        "`$env:CI = 'true'"
        "`$env:ANDROID_HOME = '$sdkRoot'"
        "`$env:PATH = '$sdkRoot\platform-tools;$sdkRoot\emulator;' + `$env:PATH"
        "`$env:EXPO_PUBLIC_API_BASE_URL = '$ApiBaseUrl'"
        "Set-Location '$mobileDir'"
        "Write-Host 'Expo: http://localhost:$Port' -ForegroundColor Cyan"
        "Write-Host 'API (emulador): $ApiBaseUrl' -ForegroundColor Cyan"
        "Write-Host 'Pressione a no menu para reabrir no Android' -ForegroundColor Yellow"
        "Write-Host ''"
        "npx expo start --android --port $Port"
    )
    ($expoLines -join [Environment]::NewLine) | Out-File -FilePath $expoScript -Encoding UTF8

    $expoProcess = Start-Process powershell -ArgumentList "-NoExit", "-File", $expoScript -PassThru

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Ambiente mobile iniciado!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Backend:   http://localhost:8000" -ForegroundColor White
    Write-Host "  API (AVD): $ApiBaseUrl" -ForegroundColor White
    Write-Host "  Expo:      http://localhost:$Port" -ForegroundColor White
    Write-Host "  Emulador:  $Avd" -ForegroundColor White
    Write-Host ""
    Write-Host "Feche as janelas do backend/Expo ou pressione Ctrl+C aqui para encerrar." -ForegroundColor Yellow
    Write-Host ""

    while ($true) {
        Start-Sleep -Seconds 1
        if ($backendProcess -and -not (Get-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue)) {
            Write-Host "Janela do backend foi fechada." -ForegroundColor Yellow
            break
        }
        if (-not (Get-Process -Id $expoProcess.Id -ErrorAction SilentlyContinue)) {
            Write-Host "Janela do Expo foi fechada." -ForegroundColor Yellow
            break
        }
    }
} catch {
    Write-Host "Erro: $_" -ForegroundColor Red
    exit 1
} finally {
    Remove-Item $backendScript -ErrorAction SilentlyContinue
    Remove-Item $expoScript -ErrorAction SilentlyContinue

    if ($backendProcess) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($expoProcess) {
        Stop-Process -Id $expoProcess.Id -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "Script encerrado. O emulador continua aberto - feche manualmente se quiser." -ForegroundColor Green
}
