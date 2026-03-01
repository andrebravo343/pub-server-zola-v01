# 📋 Plano de Migração: MySQL → Firebase Firestore

## 🎯 Objetivo
Migrar completamente o banco de dados de MySQL para Firebase Firestore, mantendo toda a lógica de negócio no servidor e evitando o uso de índices no Firestore.

---

## 📊 Análise da Estrutura Atual

### Tabelas MySQL Identificadas (25 tabelas)

#### 1. **Usuários e Autenticação**
- `users` - Usuários base
- `talent_users` - Perfis de talentos
- `company_users` - Perfis de empresas
- `admin_users` - Perfis de administradores
- `refresh_tokens` - Tokens de refresh
- `password_reset_tokens` - Tokens de reset de senha
- `oauth_tokens` - Tokens OAuth (Google, LinkedIn)
- `two_factor_codes` - Códigos 2FA

#### 2. **Perfis de Talentos**
- `talent_profiles` - Perfil completo do talento
- `talent_experience` - Experiência profissional
- `talent_education` - Formação acadêmica
- `talent_skills` - Competências
- `talent_languages` - Idiomas
- `talent_documents` - Documentos

#### 3. **Perfis de Empresas**
- `company_profiles` - Perfil completo da empresa

#### 4. **Vagas e Candidaturas**
- `jobs` - Vagas de emprego
- `applications` - Candidaturas
- `application_status_history` - Histórico de status (Kanban)

#### 5. **Cursos e Certificados**
- `courses` - Cursos disponíveis
- `course_enrollments` - Inscrições em cursos
- `certificates` - Certificados emitidos

#### 6. **Subscrições e Pagamentos**
- `subscription_plans` - Planos de subscrição
- `subscriptions` - Subscrições ativas
- `payments` - Transações de pagamento

#### 7. **Outros**
- `interviews` - Entrevistas agendadas
- `notifications` - Notificações do sistema
- `audit_logs` - Logs de auditoria
- `news` - Notícias (tabela adicional)

---

## 🏗️ Estrutura Proposta no Firestore

### Coleções Principais

```
firestore/
├── users/                    # Coleção de usuários base
│   └── {userId}/
│       ├── (dados do usuário)
│       └── subcollections...
│
├── talents/                  # Coleção de talentos
│   └── {talentId}/
│       ├── profile/          # Subcoleção: perfil completo
│       ├── experience/       # Subcoleção: experiências
│       ├── education/         # Subcoleção: formação
│       ├── skills/           # Subcoleção: competências
│       ├── languages/        # Subcoleção: idiomas
│       └── documents/        # Subcoleção: documentos
│
├── companies/                # Coleção de empresas
│   └── {companyId}/
│       └── profile/          # Subcoleção: perfil completo
│
├── admins/                   # Coleção de administradores
│   └── {adminId}/
│       └── (dados do admin)
│
├── jobs/                     # Coleção de vagas
│   └── {jobId}/
│       └── applications/     # Subcoleção: candidaturas
│
├── courses/                  # Coleção de cursos
│   └── {courseId}/
│       └── enrollments/     # Subcoleção: inscrições
│
├── certificates/             # Coleção de certificados
│   └── {certificateId}/
│
├── subscriptions/            # Coleção de subscrições
│   └── {subscriptionId}/
│
├── subscription_plans/       # Coleção de planos
│   └── {planId}/
│
├── payments/                 # Coleção de pagamentos
│   └── {paymentId}/
│
├── interviews/               # Coleção de entrevistas
│   └── {interviewId}/
│
├── notifications/            # Coleção de notificações
│   └── {notificationId}/
│
├── audit_logs/               # Coleção de logs de auditoria
│   └── {logId}/
│
├── news/                     # Coleção de notícias
│   └── {newsId}/
│
├── refresh_tokens/           # Coleção de refresh tokens
│   └── {tokenId}/
│
├── password_reset_tokens/    # Coleção de tokens de reset
│   └── {tokenId}/
│
└── oauth_tokens/             # Coleção de tokens OAuth
    └── {tokenId}/
```

### Estratégia de Estruturação

1. **Documentos Principais**: Cada entidade principal (user, talent, company, job, etc.) será um documento na coleção correspondente.

2. **Subcoleções**: Relacionamentos 1:N serão implementados como subcoleções:
   - `talents/{talentId}/experience/{expId}`
   - `talents/{talentId}/education/{eduId}`
   - `jobs/{jobId}/applications/{appId}`

3. **Sem Índices**: Todas as consultas serão feitas no servidor usando filtros simples. A lógica de busca/filtragem será implementada em memória quando necessário.

4. **IDs**: Manteremos UUIDs como IDs de documentos (como no MySQL).

---

## 📁 Arquivos que Precisam ser Alterados/Criados

### 🔴 Arquivos a REMOVER (⚠️ SÓ APÓS MIGRAÇÃO COMPLETA DOS DADOS)
```
src/config/database.ts                    # Configuração MySQL (manter até migração)
src/utils/database.ts                     # Utilitários MySQL (manter até migração)
src/database/                             # Pasta inteira (manter até migração)
src/scripts/migrate-to-production.ts      # Script de migração MySQL (manter)
src/scripts/test-production-connection.ts # Script de teste MySQL (manter)
```

**⚠️ IMPORTANTE:** Estes arquivos só devem ser removidos **DEPOIS** de:
1. Migração completa dos dados
2. Validação de todos os dados migrados
3. Testes completos em produção
4. Período de observação (sugestão: 1-2 semanas)

### 🟡 Arquivos a MODIFICAR

#### **Configuração**
- `src/config/env.ts` - **Adicionar** variáveis Firebase (manter MySQL por enquanto)
- `src/app.ts` - Adicionar inicialização Firestore (manter MySQL também)
- `package.json` - **Manter** `mysql2` até migração completa, manter `firebase-admin`

#### **Models**
- `src/models/User.model.ts` - Adaptar para suportar Firestore (com flag de ambiente)

#### **Services**
- `src/services/auth.service.ts` - Adaptar para suportar Firestore (com flag de ambiente)
- `src/services/oauth/firebase.service.ts` - Expandir para incluir Firestore

#### **Controllers (33 arquivos)**
Todos os controllers que usam `query`, `queryOne`, `execute`:

**Talent:**
- `src/controllers/talent/agenda.controller.ts`
- `src/controllers/talent/applications.controller.ts`
- `src/controllers/talent/certificates.controller.ts`
- `src/controllers/talent/courses.controller.ts`
- `src/controllers/talent/dashboard.controller.ts`
- `src/controllers/talent/jobs.controller.ts`
- `src/controllers/talent/notifications.controller.ts`
- `src/controllers/talent/settings.controller.ts`

**Company:**
- `src/controllers/company/applications.controller.ts`
- `src/controllers/company/candidates.controller.ts`
- `src/controllers/company/dashboard.controller.ts`
- `src/controllers/company/jobs.controller.ts`
- `src/controllers/company/kanban.controller.ts`
- `src/controllers/company/notifications.controller.ts`
- `src/controllers/company/reports.controller.ts`
- `src/controllers/company/subscriptions.controller.ts`

**Admin:**
- `src/controllers/admin/applications.controller.ts`
- `src/controllers/admin/spontaneous.controller.ts`

**Public:**
- `src/controllers/public/candidates.controller.ts`
- `src/controllers/public/jobs.controller.ts`
- `src/controllers/public/news.controller.ts`
- `src/controllers/public/spontaneous.controller.ts`

**Geral:**
- `src/controllers/auth.controller.ts`
- `src/controllers/badges.controller.ts`
- `src/controllers/courses.controller.ts`
- `src/controllers/dashboard.controller.ts`
- `src/controllers/invite.controller.ts`
- `src/controllers/jobs.controller.ts`
- `src/controllers/news.controller.ts`
- `src/controllers/notifications.controller.ts`
- `src/controllers/profile.controller.ts`
- `src/controllers/profiles.controller.ts`
- `src/controllers/reports.controller.ts`

#### **Utils**
- `src/utils/companyHelper.ts` - Adaptar para Firestore
- `src/utils/talentHelper.ts` - Adaptar para Firestore
- `src/utils/profileCompleteness.ts` - Adaptar para Firestore

### 🟢 Arquivos a CRIAR

#### **Configuração Firebase**
```
src/config/firebase.ts                    # Configuração do Firestore
```

#### **Services Firebase**
```
src/services/firebase/
├── firestore.service.ts                  # Serviço base do Firestore
├── users.service.ts                      # CRUD de usuários
├── talents.service.ts                     # CRUD de talentos
├── companies.service.ts                   # CRUD de empresas
├── jobs.service.ts                        # CRUD de vagas
├── applications.service.ts                # CRUD de candidaturas
├── courses.service.ts                     # CRUD de cursos
├── certificates.service.ts                # CRUD de certificados
├── subscriptions.service.ts               # CRUD de subscrições
├── payments.service.ts                    # CRUD de pagamentos
├── notifications.service.ts               # CRUD de notificações
└── audit.service.ts                       # CRUD de logs de auditoria
```

#### **Models Firestore**
```
src/models/firestore/
├── User.model.ts                         # Model de usuário
├── Talent.model.ts                        # Model de talento
├── Company.model.ts                       # Model de empresa
├── Job.model.ts                           # Model de vaga
├── Application.model.ts                  # Model de candidatura
├── Course.model.ts                        # Model de curso
└── ... (outros models)
```

#### **Utils Firestore**
```
src/utils/firestore/
├── query-builder.ts                       # Builder de queries (sem índices)
├── filters.ts                             # Filtros e busca em memória
└── validators.ts                          # Validadores de dados
```

---

## 🔧 Estratégia de Implementação

### ⚠️ IMPORTANTE: MySQL será mantido até migração completa dos dados

**Estratégia de Migração Segura:**
1. Criar estrutura Firebase em paralelo (sem remover MySQL)
2. Implementar serviços Firestore
3. Criar script de migração de dados
4. Migrar dados do MySQL para Firestore
5. Testar com dados reais
6. **Só depois** remover MySQL

---

### Fase 1: Setup e Infraestrutura Firebase (MySQL ainda ativo)
1. ✅ Criar `src/config/firebase.ts` com inicialização do Firestore
2. ✅ Criar `src/services/firebase/firestore.service.ts` (serviço base)
3. ✅ Criar `src/utils/firestore/query-builder.ts` (helper para queries)
4. ✅ **MANTER** `package.json` com `mysql2` (não remover ainda)
5. ✅ Adicionar variáveis de ambiente Firebase (manter MySQL também)

### Fase 2: Models e Services Base Firebase (MySQL ainda ativo)
1. ✅ Criar models Firestore para todas as entidades
2. ✅ Criar services Firestore para CRUD básico
3. ✅ Implementar lógica de busca/filtragem em memória
4. ✅ **MANTER** models e services MySQL funcionando

### Fase 3: Script de Migração de Dados
1. ✅ Criar `src/scripts/migrate-mysql-to-firestore.ts`
2. ✅ Implementar migração de todas as tabelas:
   - `users` → `users/`
   - `talent_users` + `talent_profiles` → `talents/`
   - `company_users` + `company_profiles` → `companies/`
   - `admin_users` → `admins/`
   - `jobs` → `jobs/`
   - `applications` → `jobs/{jobId}/applications/`
   - `application_status_history` → `jobs/{jobId}/applications/{appId}/history/`
   - `talent_experience` → `talents/{talentId}/experience/`
   - `talent_education` → `talents/{talentId}/education/`
   - `talent_skills` → `talents/{talentId}/skills/`
   - `talent_languages` → `talents/{talentId}/languages/`
   - `talent_documents` → `talents/{talentId}/documents/`
   - `courses` → `courses/`
   - `course_enrollments` → `courses/{courseId}/enrollments/`
   - `certificates` → `certificates/`
   - `subscription_plans` → `subscription_plans/`
   - `subscriptions` → `subscriptions/`
   - `payments` → `payments/`
   - `interviews` → `interviews/`
   - `notifications` → `notifications/`
   - `audit_logs` → `audit_logs/`
   - `news` → `news/`
   - `refresh_tokens` → `refresh_tokens/`
   - `password_reset_tokens` → `password_reset_tokens/`
   - `oauth_tokens` → `oauth_tokens/`
   - `two_factor_codes` → `two_factor_codes/`
3. ✅ Implementar validação de dados migrados (contagens, integridade)
4. ✅ Implementar relatório detalhado de migração
5. ✅ Implementar modo dry-run (teste sem escrever)
6. ✅ Testar migração em ambiente de desenvolvimento
7. ✅ Fazer backup completo antes de migração em produção

### Fase 4: Migração de Dados (Executar Script)
1. ✅ Fazer backup completo do MySQL
2. ✅ Executar script de migração
3. ✅ Validar dados migrados
4. ✅ Comparar contagens (MySQL vs Firestore)
5. ✅ Testar funcionalidades críticas com dados reais

### Fase 5: Migração de Código (Dual Mode - MySQL + Firestore)
1. ✅ Criar flag de ambiente: `USE_FIRESTORE=true/false`
2. ✅ Adaptar `User.model.ts` para usar Firestore quando flag ativa
3. ✅ Adaptar `auth.service.ts` para usar Firestore quando flag ativa
4. ✅ Adaptar controllers gradualmente
5. ✅ Testar em modo dual (comparar resultados)

### Fase 6: Switch Completo para Firestore
1. ✅ Ativar Firestore em produção (`USE_FIRESTORE=true`)
2. ✅ Monitorar erros e performance
3. ✅ Validar todas as funcionalidades
4. ✅ Manter MySQL como backup por período de transição

### Fase 7: Limpeza e Otimização (Só após validação completa)
1. ✅ **Só agora** remover código MySQL
2. ✅ Remover `mysql2` do `package.json`
3. ✅ Remover arquivos de migração MySQL
4. ✅ Remover variáveis de ambiente MySQL
5. ✅ Atualizar documentação
6. ✅ Testes finais

---

## 🚫 Regras Importantes

### ❌ NÃO USAR ÍNDICES
- Todas as consultas serão feitas sem índices compostos
- Filtros complexos serão processados em memória no servidor
- Queries simples (por ID, por campo único) são permitidas

### ✅ LÓGICA NO SERVIDOR
- Toda a lógica de negócio permanece no servidor
- Firestore é apenas armazenamento
- Validações e transformações no backend

### ✅ ESTRUTURA DE DADOS
- Usar subcoleções para relacionamentos 1:N
- Manter UUIDs como IDs de documentos
- Campos de timestamp como Date objects

---

## 📝 Exemplo de Implementação

### Antes (MySQL):
```typescript
// Buscar usuário por email
const user = await queryOne<User>(
  'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL',
  [email]
);
```

### Depois (Firestore):
```typescript
// Buscar usuário por email
const usersRef = db.collection('users');
const snapshot = await usersRef
  .where('email', '==', email)
  .where('deletedAt', '==', null)
  .limit(1)
  .get();

const user = snapshot.empty ? null : snapshot.docs[0].data();
```

### Busca Complexa (em memória):
```typescript
// Buscar vagas com múltiplos filtros
const allJobs = await jobsService.getAll();
const filtered = allJobs.filter(job => {
  return job.status === 'active' &&
         job.locationType === 'remote' &&
         job.salaryMin >= minSalary;
});
```

---

## 🔐 Variáveis de Ambiente

### Manter (até migração completa):
- `MYSQL_HOST_PROD` ⚠️ (manter até migração)
- `MYSQL_PORT_PROD` ⚠️ (manter até migração)
- `MYSQL_USER_PROD` ⚠️ (manter até migração)
- `MYSQL_PASSWORD_PROD` ⚠️ (manter até migração)
- `MYSQL_DATABASE_PROD` ⚠️ (manter até migração)
- `MYSQL_CONNECTION_LIMIT` ⚠️ (manter até migração)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` ⚠️ (manter até migração)

### Adicionar:
- `FIREBASE_PROJECT_ID` ✅ (já existe)
- `FIREBASE_CLIENT_EMAIL` ✅ (já existe)
- `FIREBASE_PRIVATE_KEY` ✅ (já existe)
- `USE_FIRESTORE` ⚠️ (nova: flag para alternar entre MySQL e Firestore durante transição)

### Remover (só após migração completa):
- Todas as variáveis MySQL acima (só depois de validação completa)

---

## 📊 Resumo de Impacto

- **Arquivos a remover**: ~8 arquivos
- **Arquivos a modificar**: ~40 arquivos
- **Arquivos a criar**: ~20 arquivos
- **Linhas de código estimadas**: ~5000-7000 linhas

---

## ⚠️ Considerações Importantes

1. **Performance**: Buscas complexas em memória podem ser mais lentas com muitos dados. Considerar paginação agressiva.

2. **Custos**: Firestore cobra por leituras/escritas. Monitorar uso.

3. **Transações**: Firestore suporta transações, mas com limitações. Adaptar lógica de transações.

4. **Migração de Dados**: ⚠️ **CRÍTICO** - Criar script de migração de dados existentes do MySQL para Firestore. **MySQL deve ser mantido até migração completa e validação dos dados.**

5. **Backup**: Implementar estratégia de backup do Firestore.

---

## 📅 Próximos Passos

1. ✅ Revisar e aprovar este plano
2. ⏳ Criar estrutura base do Firestore (MySQL ainda ativo)
3. ⏳ Implementar serviços base Firestore
4. ⏳ Criar script de migração de dados MySQL → Firestore
5. ⏳ Executar migração de dados em desenvolvimento
6. ⏳ Validar dados migrados
7. ⏳ Implementar flag `USE_FIRESTORE` para dual mode
8. ⏳ Migrar código gradualmente (testando ambos)
9. ⏳ Ativar Firestore em produção
10. ⏳ Monitorar e validar (período de observação)
11. ⏳ **Só então** remover MySQL

---

**Status**: 📋 Planejamento Completo - Aguardando Aprovação para Implementação

