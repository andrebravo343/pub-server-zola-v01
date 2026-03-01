# 🗄️ Configuração do Vercel Blob Storage

Este guia explica como configurar o Vercel Blob Storage para uploads de arquivos.

## 📋 O que é Vercel Blob Storage?

O Vercel Blob Storage é um serviço de armazenamento de arquivos da Vercel que:
- ✅ Persiste arquivos entre deployments
- ✅ Escala automaticamente
- ✅ Oferece URLs públicas para arquivos
- ✅ Integra perfeitamente com funções serverless

## 🚀 Configuração

### 1. Criar Blob Store na Vercel

1. Acesse o [Dashboard da Vercel](https://vercel.com/dashboard)
2. Vá em **Storage** > **Create Database**
3. Selecione **Blob**
4. Escolha um nome para o store (ex: `zolangola-uploads`)
5. Selecione a região mais próxima dos seus usuários
6. Clique em **Create**

### 2. Obter Token de Acesso

1. No dashboard do Blob Store criado
2. Vá em **Settings** > **Tokens**
3. Clique em **Create Token**
4. Dê um nome (ex: `zolangola-server-token`)
5. Selecione permissões: **Read and Write**
6. Copie o token gerado

### 3. Configurar Variável de Ambiente

Na Vercel:
1. Vá em seu projeto > **Settings** > **Environment Variables**
2. Adicione:
   ```
   Nome: BLOB_READ_WRITE_TOKEN
   Valor: [cole o token copiado]
   Ambiente: Production, Preview, Development
   ```
3. Clique em **Save**

## 🔧 Como Funciona

### Estrutura de Pastas Mantida

O sistema mantém a mesma estrutura de pastas:
```
uploads/
├── profile-pictures/
│   └── [arquivos de foto de perfil]
├── company-documents/
│   └── [documentos de empresas]
└── talent-documents/
    └── [documentos de talentos]
```

### URLs Mantidas

As URLs retornadas ao frontend permanecem as mesmas:
- `/uploads/profile-pictures/filename.jpg`
- `/uploads/company-documents/filename.pdf`
- `/uploads/talent-documents/filename.pdf`

### Funcionamento Automático

- **Em Produção (Vercel):** Usa automaticamente o Blob Storage se `BLOB_READ_WRITE_TOKEN` estiver configurado
- **Em Desenvolvimento Local:** Usa filesystem tradicional (pasta `uploads/`)

## 📝 Migração de Arquivos Existentes

Se você já tem arquivos no filesystem e quer migrar para o Blob:

1. **Opção 1: Upload Manual**
   - Use o dashboard da Vercel para fazer upload dos arquivos
   - Mantenha a estrutura de pastas: `uploads/folder/filename`

2. **Opção 2: Script de Migração**
   ```typescript
   // Criar script de migração (exemplo)
   import { BlobService } from './src/services/blob.service';
   import fs from 'fs';
   import path from 'path';

   async function migrateFiles() {
     const folders = ['profile-pictures', 'company-documents', 'talent-documents'];
     
     for (const folder of folders) {
       const folderPath = path.join('uploads', folder);
       const files = fs.readdirSync(folderPath);
       
       for (const file of files) {
         const filePath = path.join(folderPath, file);
         const buffer = fs.readFileSync(filePath);
         
         await BlobService.uploadFile(
           { buffer, originalname: file, mimetype: 'application/octet-stream' },
           folder as any,
           file
         );
         
         console.log(`Migrado: ${folder}/${file}`);
       }
     }
   }
   ```

## 🔍 Verificação

Após configurar, teste fazendo upload de um arquivo:

1. Faça upload via API
2. Verifique se o arquivo aparece no Blob Store da Vercel
3. Acesse a URL retornada: `https://seu-projeto.vercel.app/uploads/...`
4. Verifique se o arquivo é servido corretamente

## ⚠️ Importante

- **Limites:** Verifique os limites do plano da Vercel
- **Custos:** O Blob Storage tem limites gratuitos, depois há cobrança
- **Backup:** Considere fazer backup periódico dos arquivos importantes
- **Cache:** Arquivos são servidos com cache de 1 ano por padrão

## 🛠️ Troubleshooting

### Erro: "Blob store not found"
- Verifique se o token está correto
- Confirme que o Blob Store foi criado no mesmo projeto/equipe

### Erro: "Unauthorized"
- Verifique se o token tem permissões de Read and Write
- Confirme que a variável `BLOB_READ_WRITE_TOKEN` está configurada

### Arquivos não aparecem
- Verifique os logs da Vercel
- Confirme que o upload foi bem-sucedido (status 200)
- Verifique o Blob Store no dashboard

### URLs não funcionam
- Verifique se a rota `/uploads/:folder/:filename` está configurada
- Confirme que o arquivo existe no Blob Store
- Verifique os logs para erros de proxy

## 📚 Recursos

- [Documentação Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- [API Reference](https://vercel.com/docs/storage/vercel-blob/using-blob-sdk)

