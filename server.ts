import dotenv from 'dotenv';

// ⚠️ IMPORTANTE: Carregar variáveis de ambiente ANTES de importar qualquer módulo que use process.env
// Isso garante que o .env seja lido antes de qualquer acesso a process.env
dotenv.config();

// Agora podemos importar os módulos que dependem de process.env
import app from './src/app';
import { config } from './src/config/env';
import { testConnection } from './src/config/database';

const PORT = config.port;

// Verificar se está rodando na Vercel (serverless)
const isVercel = !!process.env.VERCEL;

async function startServer() {
  try {
    // Testar conexão com banco de dados
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('⚠️  Não foi possível conectar ao banco de dados.');
      if (!isVercel) {
        // Em ambiente local, encerrar se não conectar
        console.error('Encerrando servidor...');
        process.exit(1);
      } else {
        // Em serverless, apenas logar o erro (a conexão será tentada novamente na próxima requisição)
        console.warn('⚠️  Continuando sem conexão ao banco. A conexão será tentada novamente na próxima requisição.');
      }
    }

    // Verificar e inicializar serviço de email
    try {
      const { emailService } = await import('./src/services/email.service');
      const emailConfigured = await emailService.verifyConnection();
      if (!emailConfigured) {
        console.warn('\n⚠️  Serviço de email não configurado. Emails não serão enviados.');
        if (!isVercel) {
          console.warn('   Configure as variáveis SMTP no arquivo .env\n');
        } else {
          console.warn('   Configure as variáveis SMTP nas configurações da Vercel\n');
        }
      }
    } catch (emailError) {
      console.warn('⚠️  Erro ao verificar serviço de email:', emailError);
    }

    // Em ambiente serverless (Vercel), não iniciar servidor HTTP
    // O handler serverless em api/index.ts cuida disso
    if (isVercel) {
      console.log('✅ Servidor configurado para ambiente Vercel (serverless)');
      return;
    }

    // Iniciar servidor apenas em ambiente local/tradicional
    app.listen(PORT, () => {
      console.log(`
Servidor ZOLANGOLA iniciado com sucesso!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ambiente: ${config.nodeEnv}
Porta: ${PORT}
API: http://localhost:${PORT}/api/${config.apiVersion}
Health Check: http://localhost:${PORT}/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    if (!isVercel) {
      process.exit(1);
    }
    // Em serverless, não fazer exit - deixar a função retornar erro
  }
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();

