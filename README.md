# 🚀 ZOLANGOLA Server

Servidor backend Express.js com TypeScript e MySQL para a plataforma ZOLANGOLA.

## 📋 Estrutura do Projeto

```
server/
├── src/
│   ├── config/          # Configurações (database, env)
│   ├── controllers/      # Controladores das rotas
│   ├── services/         # Lógica de negócio
│   ├── models/           # Modelos de dados
│   ├── routes/           # Definição de rotas
│   ├── middlewares/      # Middlewares (auth, validação, etc)
│   ├── utils/            # Funções utilitárias
│   ├── types/            # Tipos TypeScript
│   ├── database/         # Migrations e seeds
│   ├── app.ts            # Configuração do Express
│   └── server.ts         # Ponto de entrada
├── .env.example          # Exemplo de variáveis de ambiente
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Como Executar

### Pré-requisitos

- Node.js 18+
- MySQL 8.0+
- npm ou yarn

### Instalação

1. Instalar dependências:
```bash
npm install
```

2. Configurar variáveis de ambiente:
```bash
cp .env.example .env
# Editar .env com suas configurações
```

3. Criar o banco de dados:
```sql
CREATE DATABASE zolangola_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

4. Executar migrations (quando criadas):
```bash
npm run migrate
```

5. Executar em desenvolvimento:
```bash
npm run dev
```

6. Build para produção:
```bash
npm run build
npm start
```

## 📡 Endpoints

### Health Check
- `GET /health` - Verifica se o servidor está rodando

### API Base
- `/api/v1/site` - Endpoints do site institucional
- `/api/v1/candidato` - Endpoints do painel do candidato
- `/api/v1/empresa` - Endpoints do painel da empresa
- `/api/v1/admin` - Endpoints do painel administrativo

## 🔐 Autenticação

O servidor usa JWT (JSON Web Tokens) para autenticação.

**Headers necessários:**
```
Authorization: Bearer <token>
```

## 🛠️ Scripts Disponíveis

- `npm run dev` - Executa em modo desenvolvimento com hot reload
- `npm run build` - Compila TypeScript para JavaScript
- `npm start` - Executa o servidor em produção
- `npm run typecheck` - Verifica tipos TypeScript
- `npm run migrate` - Executa migrations do banco de dados
- `npm run seed` - Popula o banco com dados iniciais

## 📝 Variáveis de Ambiente

Consulte `.env.example` para todas as variáveis disponíveis.

## 🗄️ Banco de Dados

O servidor usa MySQL. Consulte `DATABASE.md` na raiz do projeto para a estrutura completa das tabelas.

## 📚 Documentação

- [README Principal](../README.md)
- [Guia de Branches](../BRANCHES.md)
- [Estrutura do Banco de Dados](../DATABASE.md)

---

**Desenvolvido com ❤️ pelo Lab. SOFTHARD**

