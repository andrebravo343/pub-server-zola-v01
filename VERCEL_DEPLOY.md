# 🚀 Guia de Deploy na Vercel - ZOLANGOLA Server

Este guia explica como fazer deploy do servidor ZOLANGOLA na Vercel.

## 📋 Pré-requisitos

1. Conta na [Vercel](https://vercel.com)
2. Repositório Git (GitHub, GitLab ou Bitbucket)
3. Banco de dados MySQL acessível publicamente
4. Todas as variáveis de ambiente configuradas

## 🔧 Configuração

### 1. Estrutura de Arquivos

O projeto já está configurado com:
- ✅ `vercel.json` - Configuração da Vercel
- ✅ `api/index.ts` - Handler serverless
- ✅ Scripts de build atualizados

### 2. Variáveis de Ambiente

Configure todas as variáveis de ambiente na Vercel:

1. Acesse seu projeto na Vercel
2. Vá em **Settings** > **Environment Variables**
3. Adicione todas as variáveis listadas em `ENV_EXAMPLE.md`
4. Selecione os ambientes apropriados (Production, Preview, Development)
5. Clique em **Save**

**Variáveis Críticas:**
- `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`
- `LINKEDIN_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`
- `FIREBASE_PRIVATE_KEY`

### 3. Deploy

#### Opção A: Via GitHub (Recomendado)

1. Conecte seu repositório GitHub à Vercel
2. A Vercel detectará automaticamente o projeto
3. Configure:
   - **Framework Preset:** Other
   - **Build Command:** `npm run vercel-build`
   - **Output Directory:** (deixe vazio)
   - **Install Command:** `npm install`
4. Adicione todas as variáveis de ambiente
5. Clique em **Deploy**

#### Opção B: Via Vercel CLI

```bash
# Instalar Vercel CLI
npm install -g vercel

# Fazer login
vercel login

# Deploy
vercel

# Deploy para produção
vercel --prod
```

## 🔍 Verificação

Após o deploy, verifique:

1. **Health Check:**
   ```
   https://seu-projeto.vercel.app/health
   ```

2. **API Endpoints:**
   ```
   https://seu-projeto.vercel.app/api/v1/auth/login
   ```

3. **Logs:**
   - Acesse o dashboard da Vercel
   - Vá em **Deployments** > Seu deployment > **Functions** > **api/index.ts**
   - Verifique os logs para erros

## ⚠️ Problemas Comuns

### Erro: "Cannot connect to database"

**Solução:**
- Verifique se o banco MySQL está acessível publicamente
- Confirme as credenciais nas variáveis de ambiente
- Verifique se o firewall permite conexões da Vercel
- Considere usar um serviço de banco compatível com serverless (PlanetScale, Railway, etc.)

### Erro: "Function timeout"

**Solução:**
- O `vercel.json` já configura `maxDuration: 30` segundos
- Para funções mais longas, considere otimizar queries ou usar background jobs

### Erro: "Module not found"

**Solução:**
- Verifique se todas as dependências estão em `package.json`
- Execute `npm install` localmente para verificar
- Verifique se o build está gerando os arquivos corretamente

### Erro: "CORS"

**Solução:**
- Configure `CORS_ORIGIN` com todas as URLs do frontend
- Inclua a URL da Vercel se necessário
- Verifique se está usando `credentials: true` no frontend

## 📊 Monitoramento

### Logs em Tempo Real

```bash
vercel logs --follow
```

### Métricas

- Acesse o dashboard da Vercel
- Vá em **Analytics** para ver métricas de performance
- Monitore **Functions** para uso de recursos

## 🔄 Atualizações

A cada push para a branch principal, a Vercel fará deploy automático.

Para deploy manual:
```bash
vercel --prod
```

## 🛠️ Comandos Úteis

```bash
# Ver informações do projeto
vercel inspect

# Ver logs
vercel logs

# Remover deployment
vercel remove

# Listar variáveis de ambiente
vercel env ls

# Adicionar variável de ambiente
vercel env add NOME_VARIAVEL production
```

## 📝 Notas Importantes

1. **Serverless:** A Vercel usa funções serverless, então:
   - Conexões de banco são reutilizadas quando possível
   - Cada requisição pode iniciar uma nova instância
   - Evite estado global que depende entre requisições

2. **Cold Start:** A primeira requisição pode ser mais lenta (cold start)
   - Isso é normal em serverless
   - Requisições subsequentes serão mais rápidas

3. **Limites:**
   - Função: 30 segundos (configurado)
   - Memória: 1024 MB (padrão)
   - Região: `iad1` (configurado no vercel.json)

4. **Uploads:**
   - A pasta `uploads/` não persiste entre deployments
   - Considere usar serviços externos (S3, Cloudinary, etc.)

## 🎯 Próximos Passos

1. Configure um domínio customizado (opcional)
2. Configure CI/CD para testes automáticos
3. Configure monitoramento e alertas
4. Otimize queries de banco de dados
5. Configure cache quando apropriado

## 📚 Recursos

- [Documentação Vercel](https://vercel.com/docs)
- [Vercel + Express](https://vercel.com/kb/guide/using-express-with-vercel)
- [Serverless Functions](https://vercel.com/docs/functions)

