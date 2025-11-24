# Sincronização BambooHR → MKHub

Este diretório contém scripts para sincronizar dados do BambooHR para o MKHub.

## Configuração

### 1. Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```bash
# BambooHR Configuration
BAMBOOHR_SUBDOMAIN=mackkirkroofing
BAMBOOHR_API_KEY=0c2d212010d38ddefba5add05fc2a2c50a1c4aa2
```

**Nota:** O `BAMBOOHR_SUBDOMAIN` é a parte antes de `.bamboohr.com` na URL do seu BambooHR. 
Por exemplo, se você acessa `https://mackkirkroofing.bamboohr.com`, o subdomain é `mackkirkroofing`.

### 2. Dependências

As dependências necessárias já estão no `requirements.txt`:
- `httpx` - para requisições HTTP
- `sqlalchemy` - para acesso ao banco de dados
- Outras dependências do projeto

## Scripts Disponíveis

### 1. `sync_bamboohr_employees.py`

Sincroniza funcionários do BambooHR para o MKHub.

**Uso:**
```bash
# Dry run (não faz alterações)
python scripts/sync_bamboohr_employees.py --dry-run

# Sincronizar todos os funcionários
python scripts/sync_bamboohr_employees.py

# Sincronizar apenas os primeiros 10 funcionários (para teste)
python scripts/sync_bamboohr_employees.py --limit 10

# Não atualizar funcionários existentes
python scripts/sync_bamboohr_employees.py --no-update-existing
```

**O que faz:**
- Cria usuários no MKHub baseado nos funcionários do BambooHR
- Cria/atualiza perfis de funcionários (EmployeeProfile)
- Mapeia dados pessoais, informações de emprego, contatos de emergência, etc.
- Usa email como chave de mapeamento entre sistemas

### 2. `sync_bamboohr_training.py`

Sincroniza registros de treinamento do BambooHR.

**Uso:**
```bash
# Dry run
python scripts/sync_bamboohr_training.py --dry-run

# Sincronizar treinamentos de todos os funcionários
python scripts/sync_bamboohr_training.py

# Sincronizar treinamentos de um funcionário específico
python scripts/sync_bamboohr_training.py --employee-id 123

# Limitar a 10 funcionários
python scripts/sync_bamboohr_training.py --limit 10
```

**O que faz:**
- Cria cursos de treinamento no MKHub baseado nos tipos de treinamento do BambooHR
- Cria registros de progresso (TrainingProgress) para cada treinamento completado
- Cria certificados quando aplicável

### 3. `sync_bamboohr_documents.py`

Sincroniza documentos e fotos de perfil dos funcionários.

**Uso:**
```bash
# Dry run
python scripts/sync_bamboohr_documents.py --dry-run

# Sincronizar documentos de todos os funcionários
python scripts/sync_bamboohr_documents.py

# Sincronizar documentos de um funcionário específico
python scripts/sync_bamboohr_documents.py --employee-id 123

# Não sincronizar fotos de perfil
python scripts/sync_bamboohr_documents.py --no-photos

# Limitar a 10 funcionários
python scripts/sync_bamboohr_documents.py --limit 10
```

**O que faz:**
- Baixa documentos dos funcionários do BambooHR
- Salva documentos no storage do MKHub (local ou Azure Blob)
- Cria registros de documentos (EmployeeDocument)
- Sincroniza fotos de perfil dos funcionários

### 4. `sync_bamboohr_all.py` (Script Master)

Executa todas as sincronizações em sequência.

**Uso:**
```bash
# Dry run completo
python scripts/sync_bamboohr_all.py --dry-run

# Sincronizar tudo
python scripts/sync_bamboohr_all.py

# Pular sincronização de treinamentos
python scripts/sync_bamboohr_all.py --skip-training

# Sincronizar apenas funcionários e documentos
python scripts/sync_bamboohr_all.py --skip-training

# Limitar a 10 funcionários
python scripts/sync_bamboohr_all.py --limit 10
```

**Opções:**
- `--dry-run`: Não faz alterações, apenas mostra o que seria feito
- `--skip-employees`: Pula sincronização de funcionários
- `--skip-training`: Pula sincronização de treinamentos
- `--skip-documents`: Pula sincronização de documentos
- `--no-photos`: Não sincroniza fotos de perfil
- `--limit N`: Limita a N funcionários (útil para testes)

## Fluxo Recomendado

### Primeira Sincronização

1. **Teste com dry-run:**
   ```bash
   python scripts/sync_bamboohr_all.py --dry-run --limit 5
   ```

2. **Sincronize funcionários primeiro:**
   ```bash
   python scripts/sync_bamboohr_employees.py --limit 5
   ```

3. **Verifique os dados no sistema**

4. **Sincronize tudo:**
   ```bash
   python scripts/sync_bamboohr_all.py
   ```

### Sincronizações Regulares

Para manter os dados atualizados, execute periodicamente:

```bash
# Sincronização completa (atualiza dados existentes)
python scripts/sync_bamboohr_all.py
```

## Mapeamento de Dados

### Funcionários

| BambooHR | MKHub |
|----------|-------|
| `id` | Usado para buscar, mapeado via email |
| `firstName`, `lastName` | `EmployeeProfile.first_name`, `EmployeeProfile.last_name` |
| `workEmail` | `User.email_personal`, `EmployeeProfile.work_email` |
| `hireDate` | `EmployeeProfile.hire_date` |
| `jobTitle` | `EmployeeProfile.job_title` |
| `department` | `EmployeeProfile.division` |
| `mobilePhone` | `EmployeeProfile.mobile_phone` |
| `address1`, `city`, `state`, `zipCode` | `EmployeeProfile.address_line1`, `city`, `province`, `postal_code` |
| `emergencyContactName` | `EmployeeProfile.emergency_contact_name` |
| E mais... | Ver código para mapeamento completo |

### Treinamentos

- Tipos de treinamento do BambooHR → Cursos no MKHub
- Registros de treinamento completado → Progresso de treinamento
- Datas de conclusão → `TrainingProgress.completed_at`

### Documentos

- Arquivos do BambooHR → `FileObject` + `EmployeeDocument`
- Fotos de perfil → `EmployeeProfile.profile_photo_file_id`
- Categorias de documentos → `EmployeeDocument.doc_type`

## Troubleshooting

### Erro: "BambooHR API key is required"

Verifique se `BAMBOOHR_API_KEY` está configurado no `.env`.

### Erro: "User not found for BambooHR employee ID"

Isso significa que o funcionário não foi sincronizado ainda. Execute primeiro:
```bash
python scripts/sync_bamboohr_employees.py
```

### Erro de conexão com BambooHR

Verifique:
- Se o `BAMBOOHR_SUBDOMAIN` está correto
- Se a API key é válida
- Se há conectividade com a internet

### Documentos não são baixados

Alguns documentos podem estar protegidos ou não acessíveis via API. Verifique as permissões da API key no BambooHR.

## Notas Importantes

1. **Senhas:** Usuários criados recebem senhas temporárias. Eles precisarão usar "Esqueci minha senha" para definir uma senha.

2. **Duplicatas:** O sistema usa email como chave de mapeamento. Se um funcionário já existe (mesmo email), ele será atualizado ao invés de criado.

3. **Storage:** Documentos são salvos no storage configurado (local ou Azure Blob). Certifique-se de que o storage está configurado corretamente.

4. **Performance:** Para muitos funcionários, a sincronização pode demorar. Use `--limit` para testar com poucos registros primeiro.

5. **Dry Run:** Sempre teste com `--dry-run` primeiro para ver o que será feito sem fazer alterações.

## API BambooHR

Os scripts usam a API REST do BambooHR com autenticação HTTP Basic Auth.

Documentação: https://documentation.bamboohr.com/docs/getting-started

Endpoints usados:
- `GET /api/v1/employees/directory` - Lista de funcionários
- `GET /api/v1/employees/{id}` - Detalhes do funcionário
- `GET /api/v1/employees/{id}/photo` - Foto do funcionário
- `GET /api/v1/employees/{id}/files/view` - Lista de arquivos
- `GET /api/v1/employees/{id}/files/{fileId}` - Download de arquivo
- `GET /api/v1/employees/{id}/training` - Treinamentos do funcionário

