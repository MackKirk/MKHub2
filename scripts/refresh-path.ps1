# Script para atualizar o PATH na sessão atual sem reiniciar

Write-Host "Atualizando PATH para incluir Node.js..." -ForegroundColor Yellow

# Caminhos comuns do Node.js no Windows
$nodePaths = @(
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "$env:LOCALAPPDATA\Programs\nodejs"
)

$pathUpdated = $false
foreach ($path in $nodePaths) {
    if (Test-Path $path) {
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "User") -split ';'
        if ($currentPath -notcontains $path) {
            [Environment]::SetEnvironmentVariable("Path", "$env:Path;$path", "Process")
            Write-Host "Adicionado ao PATH: $path" -ForegroundColor Green
            $pathUpdated = $true
        }
    }
}

if ($pathUpdated) {
    Write-Host ""
    Write-Host "PATH atualizado! Testando Node.js..." -ForegroundColor Green
    node --version
    npm --version
    Write-Host ""
    Write-Host "Agora você pode executar:" -ForegroundColor Cyan
    Write-Host "  .\scripts\dev.ps1 -Mode full" -ForegroundColor White
} else {
    Write-Host "Node.js não encontrado nos caminhos padrão." -ForegroundColor Yellow
    Write-Host "Reinicie o terminal ou adicione manualmente o caminho do Node.js ao PATH." -ForegroundColor Yellow
}

