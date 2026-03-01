# Variáveis de Ambiente - ZOLANGOLA Server

Copie as variáveis abaixo e configure-as na Vercel (Settings > Environment Variables) ou em um arquivo `.env` local.

## 📋 Variáveis Necessárias

### SERVIDOR
```env
NODE_ENV=production
PORT=3000
API_VERSION=v1
```

### BANCO DE DADOS MYSQL
```env
MYSQL_HOST=seu-host-mysql.com
MYSQL_PORT=3306
MYSQL_USER=seu-usuario
MYSQL_PASSWORD=sua-senha-segura
MYSQL_DATABASE=nome-do-banco
MYSQL_CONNECTION_LIMIT=10
```

### JWT (JSON Web Tokens)
```env
JWT_SECRET=seu-jwt-secret-aqui-gerar-valor-aleatorio
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=seu-refresh-secret-aqui-gerar-valor-aleatorio
JWT_REFRESH_EXPIRES_IN=30d
```

**💡 Dica:** Para gerar secrets seguros:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### CORS (Cross-Origin Resource Sharing)
```env
CORS_ORIGIN=https://zolangola.com,https://admin.zolangola.com,https://empresa.zolangola.com,https://candidato.zolangola.com
```

### SMTP (Email)
```env
SMTP_HOST=smtp.exemplo.com
SMTP_PORT=465
SMTP_USER=seu-email@exemplo.com
SMTP_PASSWORD=sua-senha-smtp
SMTP_FROM=noreply@zolangola.com
```

### ADMIN
```env
ADMIN_EMAIL=admin@zolangola.com
ADMIN_PASSWORD=senha-admin-segura
```

### FIREBASE (OAuth)
```env
FIREBASE_PROJECT_ID=seu-projeto-firebase
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nSua-chave-privada-aqui\n-----END PRIVATE KEY-----\n
```

### GOOGLE OAUTH
```env
GOOGLE_CLIENT_ID=seu-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-google-client-secret
```

### LINKEDIN OAUTH
```env
LINKEDIN_CLIENT_ID=seu-linkedin-client-id
LINKEDIN_CLIENT_SECRET=seu-linkedin-client-secret
LINKEDIN_REDIRECT_URI=https://admin-zolangola.vercel.app/api/oauth/linkedin/callback
```

### UPLOAD DE ARQUIVOS
```env
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
```

### VERCEL BLOB STORAGE (Opcional - apenas para produção)
```env
# Token de acesso ao Vercel Blob Storage
# Obtenha em: https://vercel.com/dashboard/stores
BLOB_READ_WRITE_TOKEN=vercel_blob_xxx
```
**Nota:** Se `BLOB_READ_WRITE_TOKEN` ou `VERCEL` estiver configurado, os uploads usarão automaticamente o Vercel Blob Storage. Caso contrário, usará filesystem local.

### RATE LIMITING
```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### FRONTEND URL
```env
FRONTEND_URL=https://admin.zolangola.com
```

## 🚀 Configuração na Vercel

1. Acesse seu projeto na Vercel
2. Vá em **Settings** > **Environment Variables**
3. Adicione cada variável acima
4. Selecione os ambientes (Production, Preview, Development)
5. Clique em **Save**

## ⚠️ Importante

- **NUNCA** commite arquivos `.env` no Git
- Use valores diferentes para produção e desenvolvimento
- Gere secrets aleatórios e seguros para JWT
- Configure CORS com as URLs corretas do seu frontend

