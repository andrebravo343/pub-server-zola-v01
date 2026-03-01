# 📂 Mapeamento Detalhado de Arquivos - Migração Firebase

## 📊 Resumo por Categoria

| Categoria | Remover | Modificar | Criar | Total |
|-----------|---------|-----------|-------|-------|
| Config | 1 | 2 | 1 | 4 |
| Models | 0 | 1 | 8 | 9 |
| Services | 0 | 2 | 12 | 14 |
| Controllers | 0 | 33 | 0 | 33 |
| Utils | 1 | 3 | 3 | 7 |
| Database | 5 | 0 | 0 | 5 |
| Scripts | 2 | 0 | 0 | 2 |
| **TOTAL** | **11** | **41** | **24** | **76** |

---

## 🗑️ ARQUIVOS A REMOVER (11 arquivos) ⚠️ SÓ APÓS MIGRAÇÃO COMPLETA

**⚠️ IMPORTANTE:** Estes arquivos devem ser mantidos até:
1. Migração completa dos dados do MySQL para Firestore
2. Validação de todos os dados migrados
3. Testes completos em produção
4. Período de observação (1-2 semanas)

### Configuração
- ⚠️ `src/config/database.ts` (manter até migração)

### Utils
- ⚠️ `src/utils/database.ts` (manter até migração)

### Database (pasta inteira)
- ⚠️ `src/database/migrate.ts` (manter até migração)
- ⚠️ `src/database/run-news-migration.ts` (manter até migração)
- ⚠️ `src/database/schema.sql` (manter como referência)
- ⚠️ `src/database/seed.ts` (manter até migração)
- ⚠️ `src/database/migrations/` (manter como referência)

### Scripts
- ⚠️ `src/scripts/migrate-to-production.ts` (manter até migração)
- ⚠️ `src/scripts/test-production-connection.ts` (manter até migração)

---

## ✏️ ARQUIVOS A MODIFICAR (41 arquivos)

### 🔧 Configuração (2 arquivos)

#### `src/config/env.ts`
**Mudanças:**
- **Adicionar** variáveis Firebase (manter MySQL por enquanto)
- Adicionar flag `USE_FIRESTORE` para alternar entre MySQL e Firestore
- Atualizar comentários

#### `src/app.ts`
**Mudanças:**
- Adicionar inicialização do Firestore
- Manter `testConnection()` do MySQL (até migração completa)
- Adicionar rota para testar conexão Firestore

---

### 📦 Models (1 arquivo)

#### `src/models/User.model.ts`
**Mudanças:**
- Adaptar para suportar Firestore (com flag `USE_FIRESTORE`)
- Manter suporte a MySQL durante transição
- Manter mesma interface pública
- Adaptar métodos: `create`, `findById`, `findByEmail`, `update`, `delete`, `emailExists`

---

### 🔌 Services (2 arquivos)

#### `src/services/auth.service.ts`
**Mudanças:**
- Adaptar para suportar Firestore (com flag `USE_FIRESTORE`)
- Manter suporte a MySQL durante transição
- Adaptar métodos que usam banco de dados
- Manter mesma interface pública

#### `src/services/oauth/firebase.service.ts`
**Mudanças:**
- Expandir para incluir operações Firestore (se necessário)
- Manter verificação de tokens

---

### 🎮 Controllers (33 arquivos)

#### Talent Controllers (8 arquivos)
1. `src/controllers/talent/agenda.controller.ts`
2. `src/controllers/talent/applications.controller.ts`
3. `src/controllers/talent/certificates.controller.ts`
4. `src/controllers/talent/courses.controller.ts`
5. `src/controllers/talent/dashboard.controller.ts`
6. `src/controllers/talent/jobs.controller.ts`
7. `src/controllers/talent/notifications.controller.ts`
8. `src/controllers/talent/settings.controller.ts`

**Mudanças em cada:**
- Substituir imports: `query`, `queryOne`, `execute` por services Firestore
- Adaptar todas as queries SQL para chamadas Firestore
- Manter mesma interface de API

#### Company Controllers (8 arquivos)
1. `src/controllers/company/applications.controller.ts`
2. `src/controllers/company/candidates.controller.ts`
3. `src/controllers/company/dashboard.controller.ts`
4. `src/controllers/company/jobs.controller.ts`
5. `src/controllers/company/kanban.controller.ts`
6. `src/controllers/company/notifications.controller.ts`
7. `src/controllers/company/reports.controller.ts`
8. `src/controllers/company/subscriptions.controller.ts`

**Mudanças em cada:**
- Substituir imports: `query`, `queryOne`, `execute` por services Firestore
- Adaptar todas as queries SQL para chamadas Firestore
- Manter mesma interface de API

#### Admin Controllers (2 arquivos)
1. `src/controllers/admin/applications.controller.ts`
2. `src/controllers/admin/spontaneous.controller.ts`

**Mudanças em cada:**
- Substituir imports: `query`, `queryOne`, `execute` por services Firestore
- Adaptar todas as queries SQL para chamadas Firestore

#### Public Controllers (4 arquivos)
1. `src/controllers/public/candidates.controller.ts`
2. `src/controllers/public/jobs.controller.ts`
3. `src/controllers/public/news.controller.ts`
4. `src/controllers/public/spontaneous.controller.ts`

**Mudanças em cada:**
- Substituir imports: `query`, `queryOne`, `execute` por services Firestore
- Adaptar todas as queries SQL para chamadas Firestore

#### General Controllers (11 arquivos)
1. `src/controllers/auth.controller.ts`
2. `src/controllers/badges.controller.ts`
3. `src/controllers/courses.controller.ts`
4. `src/controllers/dashboard.controller.ts`
5. `src/controllers/invite.controller.ts`
6. `src/controllers/jobs.controller.ts`
7. `src/controllers/news.controller.ts`
8. `src/controllers/notifications.controller.ts`
9. `src/controllers/profile.controller.ts`
10. `src/controllers/profiles.controller.ts`
11. `src/controllers/reports.controller.ts`

**Mudanças em cada:**
- Substituir imports: `query`, `queryOne`, `execute` por services Firestore
- Adaptar todas as queries SQL para chamadas Firestore

---

### 🛠️ Utils (3 arquivos)

#### `src/utils/companyHelper.ts`
**Mudanças:**
- Substituir `queryOne`, `execute` por services Firestore
- Adaptar lógica de negócio

#### `src/utils/talentHelper.ts`
**Mudanças:**
- Substituir `queryOne`, `execute` por services Firestore
- Adaptar lógica de negócio

#### `src/utils/profileCompleteness.ts`
**Mudanças:**
- Substituir `queryOne` por services Firestore
- Adaptar cálculos de completude

---

### 📄 Outros (1 arquivo)

#### `package.json`
**Mudanças:**
- **Manter** dependência: `mysql2` (até migração completa)
- Manter dependência: `firebase-admin` ✅
- Adicionar script: `migrate:mysql-to-firestore` (novo script de migração)
- Manter scripts MySQL (até migração)
- Atualizar keywords (manter `mysql` até migração)

---

## ➕ ARQUIVOS A CRIAR (25 arquivos - incluindo script de migração)

### 🔧 Configuração (1 arquivo)

#### `src/config/firebase.ts`
**Conteúdo:**
- Inicialização do Firebase Admin SDK
- Configuração do Firestore
- Exportar instância do Firestore DB

---

### 📦 Models Firestore (8 arquivos)

#### `src/models/firestore/User.model.ts`
- Model de usuário base
- Métodos CRUD

#### `src/models/firestore/Talent.model.ts`
- Model de talento
- Relacionamentos com subcoleções

#### `src/models/firestore/Company.model.ts`
- Model de empresa
- Relacionamentos

#### `src/models/firestore/Job.model.ts`
- Model de vaga
- Relacionamentos com candidaturas

#### `src/models/firestore/Application.model.ts`
- Model de candidatura
- Status e histórico

#### `src/models/firestore/Course.model.ts`
- Model de curso
- Inscrições

#### `src/models/firestore/Certificate.model.ts`
- Model de certificado

#### `src/models/firestore/Subscription.model.ts`
- Model de subscrição

---

### 🔌 Services Firestore (12 arquivos)

#### `src/services/firebase/firestore.service.ts`
- Serviço base do Firestore
- Helpers comuns (get, set, update, delete)
- Tratamento de erros

#### `src/services/firebase/users.service.ts`
- CRUD de usuários
- Busca por email, ID
- Validações

#### `src/services/firebase/talents.service.ts`
- CRUD de talentos
- Gerenciamento de subcoleções (experience, education, skills, etc.)
- Buscas e filtros

#### `src/services/firebase/companies.service.ts`
- CRUD de empresas
- Perfis de empresas

#### `src/services/firebase/jobs.service.ts`
- CRUD de vagas
- Buscas e filtros (em memória)
- Status de vagas

#### `src/services/firebase/applications.service.ts`
- CRUD de candidaturas
- Histórico de status
- Kanban operations

#### `src/services/firebase/courses.service.ts`
- CRUD de cursos
- Inscrições
- Progresso

#### `src/services/firebase/certificates.service.ts`
- CRUD de certificados
- Emissão e revogação

#### `src/services/firebase/subscriptions.service.ts`
- CRUD de subscrições
- Planos
- Status e renovação

#### `src/services/firebase/payments.service.ts`
- CRUD de pagamentos
- Status de transações

#### `src/services/firebase/notifications.service.ts`
- CRUD de notificações
- Marcação de lida/não lida
- Filtros por usuário

#### `src/services/firebase/audit.service.ts`
- CRUD de logs de auditoria
- Registro de ações

---

### 🛠️ Utils Firestore (3 arquivos)

#### `src/utils/firestore/query-builder.ts`
- Builder de queries Firestore
- Helpers para filtros simples
- Paginação

#### `src/utils/firestore/filters.ts`
- Filtros complexos em memória
- Busca textual
- Ordenação

#### `src/utils/firestore/validators.ts`
- Validadores de dados Firestore
- Validação de tipos
- Sanitização

### 📜 Scripts de Migração (1 arquivo)

#### `src/scripts/migrate-mysql-to-firestore.ts`
**Conteúdo:**
- Script para migrar todos os dados do MySQL para Firestore
- Migração de todas as 25 tabelas
- Validação de dados migrados
- Relatório de migração
- Opção de rollback (se necessário)

---

## 📋 Checklist de Implementação

### Fase 1: Setup
- [ ] Criar `src/config/firebase.ts`
- [ ] Criar `src/services/firebase/firestore.service.ts`
- [ ] Criar `src/utils/firestore/query-builder.ts`
- [ ] Atualizar `package.json`
- [ ] Atualizar `src/config/env.ts`

### Fase 2: Models Base
- [ ] Criar `src/models/firestore/User.model.ts`
- [ ] Criar `src/models/firestore/Talent.model.ts`
- [ ] Criar `src/models/firestore/Company.model.ts`
- [ ] Criar outros models...

### Fase 3: Services Base
- [ ] Criar `src/services/firebase/users.service.ts`
- [ ] Criar `src/services/firebase/talents.service.ts`
- [ ] Criar `src/services/firebase/companies.service.ts`
- [ ] Criar outros services...

### Fase 4: Migração de Código
- [ ] Migrar `src/models/User.model.ts`
- [ ] Migrar `src/services/auth.service.ts`
- [ ] Migrar controllers (33 arquivos)
- [ ] Migrar utils (3 arquivos)

### Fase 5: Migração de Dados
- [ ] Criar `src/scripts/migrate-mysql-to-firestore.ts`
- [ ] Executar migração em desenvolvimento
- [ ] Validar dados migrados
- [ ] Executar migração em produção
- [ ] Validar dados em produção

### Fase 6: Switch para Firestore
- [ ] Ativar flag `USE_FIRESTORE=true` em produção
- [ ] Monitorar erros e performance
- [ ] Validar todas as funcionalidades
- [ ] Período de observação (1-2 semanas)

### Fase 7: Limpeza (Só após validação completa)
- [ ] Remover arquivos MySQL (11 arquivos) ⚠️
- [ ] Remover `mysql2` do `package.json` ⚠️
- [ ] Remover variáveis MySQL ⚠️
- [ ] Atualizar documentação
- [ ] Testes finais

---

## 📊 Estatísticas

- **Total de arquivos afetados**: 76
- **Arquivos a remover**: 11 (14.5%)
- **Arquivos a modificar**: 41 (53.9%)
- **Arquivos a criar**: 24 (31.6%)

- **Linhas de código estimadas a remover**: ~2000
- **Linhas de código estimadas a modificar**: ~3000
- **Linhas de código estimadas a criar**: ~4000

---

**Última atualização**: 2026-01-07

