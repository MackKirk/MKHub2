# Configuração de Secrets

Este arquivo contém as instruções para configurar as credenciais necessárias para desenvolvimento local.

## Como configurar

### Opção 1: Usar o script setup-env.ps1

Execute o script e forneça as credenciais quando solicitado:

```powershell
.\scripts\setup-env.ps1
```

### Opção 2: Configurar manualmente

1. Copie `.env.example` para `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Edite o `.env` e configure as seguintes variáveis:

#### Database (PostgreSQL do Render)
```
DATABASE_URL=postgresql+psycopg2://user:password@host:5432/dbname
```

**Como obter:** No painel do Render, vá ao serviço PostgreSQL > Connection > copie a **External Connection String**

#### Azure Blob Storage
```
AZURE_BLOB_CONNECTION=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_BLOB_CONTAINER=documents
```

**Como obter:** No portal do Azure, vá ao Storage Account > Access Keys > copie a **Connection string**

#### JWT Secret
```
JWT_SECRET=seu-secret-aleatorio-aqui
```

**Como gerar:** Use qualquer string aleatória longa (32+ caracteres). O script `setup-env.ps1` gera automaticamente.

## Compartilhamento com outros desenvolvedores

**NUNCA compartilhe credenciais via git ou email não criptografado!**

Use um método seguro como:
- 1Password, LastPass, ou similar
- Mensagem privada/criptografada
- Compartilhamento seguro de senhas da equipe

## Variáveis de ambiente (alternativa)

Você também pode configurar via variáveis de ambiente do sistema antes de executar o script:

```powershell
$env:RENDER_DB_URL = "postgresql+psycopg2://..."
$env:AZURE_BLOB_CONNECTION = "DefaultEndpointsProtocol=https;..."
$env:AZURE_BLOB_CONTAINER = "documents"
.\scripts\setup-env.ps1
```

