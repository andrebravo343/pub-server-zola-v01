/**
 * Script para testar conexão com banco de produção
 * 
 * Uso: ts-node src/scripts/test-production-connection.ts
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as os from 'os';
import * as https from 'https';

dotenv.config();

/**
 * Obter IP público da máquina
 */
async function getPublicIP(): Promise<string | null> {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.ip);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Obter IPs locais da máquina
 */
function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (nets) {
      for (const net of nets) {
        // Ignorar IPv6 e loopback
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
  }
  
  return ips;
}

async function testConnection() {
  console.log('🔍 Testando conexão com banco de produção...\n');

  const host = process.env.MYSQL_HOST_PROD;
  const database = process.env.MYSQL_DATABASE_PROD;
  const user = process.env.MYSQL_USER_PROD;
  const password = process.env.MYSQL_PASSWORD_PROD;
  const port = parseInt(process.env.MYSQL_PORT_PROD || '3306');

  if (!host || !database || !user || !password) {
    console.error('❌ Variáveis de ambiente não configuradas!');
    console.error('\nConfigure:');
    console.error('  - MYSQL_HOST_PROD');
    console.error('  - MYSQL_DATABASE_PROD');
    console.error('  - MYSQL_USER_PROD');
    console.error('  - MYSQL_PASSWORD_PROD');
    process.exit(1);
  }

  // Obter informações de IP
  console.log('🌐 Informações de Rede:');
  const localIPs = getLocalIPs();
  if (localIPs.length > 0) {
    console.log(`   IPs Locais: ${localIPs.join(', ')}`);
  }
  
  console.log('   Obtendo IP público...');
  const publicIP = await getPublicIP();
  if (publicIP) {
    console.log(`   IP Público: ${publicIP}`);
    console.log(`   ⚠️  Configure este IP no cPanel para acesso remoto MySQL\n`);
  } else {
    console.log('   ⚠️  Não foi possível obter IP público automaticamente\n');
  }

  console.log('📦 Configuração de Conexão:');
  console.log(`   Servidor MySQL (destino): ${host}:${port}`);
  console.log(`   Database: ${database}`);
  console.log(`   User: ${user}`);
  console.log(`   IP de Origem (sua máquina): ${publicIP || 'Não detectado'}`);
  
  const sslConfig = process.env.MYSQL_SSL_PROD;
  const useSSL = sslConfig === 'true' || sslConfig === '1';
  
  if (useSSL) {
    console.log(`   SSL: Habilitado (tentando com SSL)\n`);
  } else {
    console.log(`   SSL: Desabilitado\n`);
  }

  // Tentar conexão sem SSL primeiro
  let config: any = {
    host,
    port,
    user,
    password,
    database,
  };
  
  if (useSSL) {
    config.ssl = { rejectUnauthorized: false };
  } else {
    config.ssl = false;
  }

  try {
    console.log('🔌 Tentando conectar...\n');
    
    // Primeiro, tentar conectar sem especificar o database (para verificar usuário/senha)
    console.log('📋 Passo 1: Verificando autenticação do usuário...');
    const testConfig: any = {
      host,
      port,
      user,
      password,
    };
    if (useSSL) {
      testConfig.ssl = { rejectUnauthorized: false };
    } else {
      testConfig.ssl = false;
    }
    
    let testConn: mysql.Connection;
    try {
      testConn = await mysql.createConnection(testConfig);
      console.log('   ✅ Usuário e senha estão corretos!\n');
      
      // Verificar se o banco existe
      console.log(`📋 Passo 2: Verificando se o banco '${database}' existe...`);
      const [databases] = await testConn.execute<mysql.RowDataPacket[]>(
        `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
        [database]
      );
      
      if (databases.length === 0) {
        await testConn.end();
        throw new Error(`Banco de dados '${database}' não existe no servidor!`);
      }
      console.log(`   ✅ Banco de dados '${database}' existe\n`);
      
      // Verificar permissões do usuário no banco
      console.log(`📋 Passo 3: Verificando permissões do usuário '${user}' no banco '${database}'...`);
      
      // Tentar usar o banco para verificar acesso
      try {
        await testConn.execute(`USE \`${database}\``);
        console.log(`   ✅ Usuário tem acesso ao banco '${database}'\n`);
      } catch (useError: any) {
        if (useError.message.includes('Access denied')) {
          console.log(`   ⚠️  PROBLEMA ENCONTRADO: Usuário '${user}' não tem acesso ao banco '${database}'`);
          console.log(`\n   💡 SOLUÇÃO:`);
          console.log(`      1. No cPanel, vá em "MySQL Databases"`);
          console.log(`      2. Na seção "Add User To Database" ou "Adicionar Usuário ao Banco"`);
          console.log(`      3. Selecione o usuário: ${user}`);
          console.log(`      4. Selecione o banco: ${database}`);
          console.log(`      5. Clique em "Add" ou "Adicionar"`);
          console.log(`      6. Marque "ALL PRIVILEGES" ou pelo menos: SELECT, INSERT, UPDATE, DELETE, CREATE, DROP`);
          console.log(`      7. Clique em "Make Changes" ou "Fazer Alterações"\n`);
          await testConn.end();
          throw new Error(`Usuário '${user}' não está associado ao banco '${database}' no cPanel`);
        } else {
          throw useError;
        }
      }
      
      await testConn.end();
      
      // Agora tentar conectar com o database especificado
      console.log(`📋 Passo 4: Conectando ao banco '${database}'...`);
    } catch (authError: any) {
      if (authError.message.includes('Access denied')) {
        throw authError; // Re-lançar para tratamento específico abaixo
      }
      // Se for outro erro (banco não existe, etc), também lançar
      throw authError;
    }
    
    // Conexão final com database
    let connection: mysql.Connection;
    try {
      connection = await mysql.createConnection(config);
    } catch (sslError: any) {
      // Se falhar com SSL, tentar sem SSL
      if (useSSL && (sslError.message.includes('secure connection') || sslError.message.includes('SSL'))) {
        console.log('   ⚠️  Servidor não suporta SSL, tentando sem SSL...');
        config.ssl = false;
        connection = await mysql.createConnection(config);
      } else {
        throw sslError;
      }
    }
    console.log('✅ Conexão estabelecida com sucesso!\n');

    // Testar query simples
    console.log('📊 Testando query...');
    const [rows] = await connection.execute('SELECT 1 as test, DATABASE() as current_db, NOW() as server_time');
    console.log('✅ Query executada com sucesso!');
    console.log('   Resultado:', rows);

    // Listar tabelas se existirem
    console.log('\n📋 Verificando tabelas...');
    const [tables] = await connection.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [database]
    );
    const tableCount = tables[0].count;
    console.log(`   ${tableCount} tabela(s) encontrada(s)`);

    if (tableCount > 0) {
      const [tableList] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
        [database]
      );
      console.log('   Tabelas:', tableList.map(t => t.TABLE_NAME).join(', '));
    }

    await connection.end();
    console.log('\n✅ Teste concluído com sucesso!');
    console.log('✅ Banco de produção está pronto para receber dados.\n');

  } catch (error: any) {
    console.error('\n❌ Erro ao conectar:', error.message);
    
    // Analisar o erro para dar dicas específicas
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('access denied')) {
      console.error('\n🔐 Erro de Acesso Negado\n');
      
      // Verificar se menciona usuário específico
      if (errorMsg.includes(`'${user}'@`)) {
        console.error('📌 Diagnóstico:\n');
        console.error('   O MySQL reconheceu o usuário, mas negou acesso ao banco.\n');
        console.error('   Como você já configurou "%" no Remote MySQL, o problema é:\n');
        console.error('   ⚠️  USUÁRIO NÃO ASSOCIADO AO BANCO DE DADOS\n');
        console.error('   ✅ SOLUÇÃO NO cPanel:\n');
        console.error(`   1. Acesse: cPanel > "MySQL Databases"`);
        console.error(`   2. Role até "Add User To Database" ou "Adicionar Usuário ao Banco"`);
        console.error(`   3. Selecione User: ${user}`);
        console.error(`   4. Selecione Database: ${database}`);
        console.error(`   5. Clique em "Add"`);
        console.error(`   6. Marque "ALL PRIVILEGES"`);
        console.error(`   7. Clique em "Make Changes"`);
        console.error(`   8. Aguarde alguns segundos e tente novamente\n`);
        
        console.error('   Outras verificações:\n');
        console.error(`   - Verifique se o usuário '${user}' existe (cPanel > MySQL Databases > Current Users)`);
        console.error(`   - Verifique se o banco '${database}' existe (cPanel > MySQL Databases > Current Databases)`);
        console.error(`   - Verifique se a senha está correta (pode alterar em cPanel se necessário)\n`);
      } else {
        console.error('   Erro genérico de acesso negado.\n');
        console.error('   Verifique usuário, senha e associação usuário-banco no cPanel.\n');
      }
    } else {
      console.error('\n💡 Dicas para resolver:');
      console.error('   1. Verifique se as credenciais estão corretas');
      console.error('   2. Verifique se o banco de dados existe no cPanel');
      console.error('   3. Verifique se o usuário tem permissões no banco');
      console.error('   4. Verifique se o host e porta estão corretos');
      
      if (publicIP) {
        console.error(`\n   5. ⚠️  Configure acesso remoto no cPanel:`);
        console.error(`      - Acesse: cPanel > Remote MySQL`);
        console.error(`      - Adicione este IP de origem: ${publicIP}`);
        console.error(`      - Ou adicione os IPs locais: ${localIPs.join(', ')}`);
        console.error(`      - Ou use '%' para permitir qualquer IP (menos seguro)\n`);
      }
    }
    
    if (errorMsg.includes('ssl') || errorMsg.includes('secure connection')) {
      console.error('   6. Se o erro for SSL, configure MYSQL_SSL_PROD=false no .env\n');
    }
    
    process.exit(1);
  }
}

testConnection().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

