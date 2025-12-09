/**
 * Script para migrar todos os dados do banco de dados local para produção
 * 
 * Uso: npm run migrate:production
 * ou: ts-node src/scripts/migrate-to-production.ts
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as os from 'os';
import * as https from 'https';

// Carregar variáveis de ambiente
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

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: any; // SslOptions do mysql2 ou undefined
  connectionLimit?: number;
}

/**
 * Obter configuração do banco local
 */
function getLocalConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'zolangola_db',
  };
}

/**
 * Obter configuração do banco de produção
 */
function getProductionConfig(): DatabaseConfig | null {
  const prodHost = process.env.MYSQL_HOST_PROD;
  const prodDatabase = process.env.MYSQL_DATABASE_PROD;
  const prodUser = process.env.MYSQL_USER_PROD;
  const prodPassword = process.env.MYSQL_PASSWORD_PROD;

  // Verificar se todas as variáveis necessárias estão configuradas
  if (!prodHost || !prodDatabase || !prodUser || !prodPassword) {
    return null;
  }

  const config: DatabaseConfig = {
    host: prodHost,
    port: parseInt(process.env.MYSQL_PORT_PROD || '3306'),
    user: prodUser,
    password: prodPassword,
    database: prodDatabase,
  };

  // Configurar SSL se necessário (mas não forçar se não suportado)
  const sslConfig = process.env.MYSQL_SSL_PROD;
  if (sslConfig === 'true' || sslConfig === '1') {
    config.ssl = { rejectUnauthorized: false };
  }
  // Se não configurado, não adicionar propriedade ssl (deixa undefined)

  // Connection limit
  if (process.env.MYSQL_CONNECTION_LIMIT) {
    config.connectionLimit = parseInt(process.env.MYSQL_CONNECTION_LIMIT);
  }

  return config;
}

/**
 * Obter lista de todas as tabelas do banco
 */
async function getTables(connection: mysql.Connection): Promise<string[]> {
  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME 
     FROM information_schema.TABLES 
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`
  );
  return rows.map(row => row.TABLE_NAME);
}

/**
 * Obter estrutura CREATE TABLE
 */
async function getCreateTable(connection: mysql.Connection, tableName: string): Promise<string> {
  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    `SHOW CREATE TABLE \`${tableName}\``
  );
  return rows[0]['Create Table'];
}

/**
 * Desabilitar foreign key checks
 */
async function disableForeignKeyChecks(connection: mysql.Connection): Promise<void> {
  await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
}

/**
 * Habilitar foreign key checks
 */
async function enableForeignKeyChecks(connection: mysql.Connection): Promise<void> {
  await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * Obter dados de uma tabela
 */
async function getTableData(connection: mysql.Connection, tableName: string): Promise<any[]> {
  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    `SELECT * FROM \`${tableName}\``
  );
  return rows;
}

/**
 * Inserir dados em uma tabela
 */
async function insertTableData(
  connection: mysql.Connection,
  tableName: string,
  data: any[]
): Promise<void> {
  if (data.length === 0) {
    return;
  }

  // Obter colunas da tabela
  const [columns] = await connection.execute<mysql.RowDataPacket[]>(
    `SHOW COLUMNS FROM \`${tableName}\``
  );
  const columnNames = columns.map(col => col.Field);
  const columnsStr = columnNames.map(col => `\`${col}\``).join(', ');

  // Executar em lotes menores para evitar problemas
  const batchSize = 100;
  const placeholderRow = `(${columnNames.map(() => '?').join(', ')})`;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const batchValues: any[] = [];
    const batchPlaceholders: string[] = [];

    // Preparar cada linha do batch
    for (const row of batch) {
      const rowValues: any[] = [];
      for (const col of columnNames) {
        // Tratar valores NULL, undefined, e tipos especiais
        let value = row[col];
        if (value === undefined) {
          value = null;
        } else if (value instanceof Date) {
          // Converter Date para string MySQL
          value = value.toISOString().slice(0, 19).replace('T', ' ');
        } else if (Buffer.isBuffer(value)) {
          // Manter buffers como estão
          value = value;
        } else if (typeof value === 'object' && value !== null && !(value instanceof Date) && !Buffer.isBuffer(value)) {
          // Converter objetos para JSON string
          try {
            value = JSON.stringify(value);
          } catch {
            value = String(value);
          }
        }
        rowValues.push(value);
      }
      batchValues.push(...rowValues);
      batchPlaceholders.push(placeholderRow);
    }

    // Construir e executar query
    const batchQuery = `INSERT INTO \`${tableName}\` (${columnsStr}) VALUES ${batchPlaceholders.join(', ')}`;
    
    try {
      await connection.execute(batchQuery, batchValues);
    } catch (error: any) {
      // Se falhar em batch, tentar inserir um por um para identificar o problema
      if (batch.length > 1 && error.message.includes('mysqld_stmt_execute')) {
        console.log(`   ⚠️  Erro no batch, tentando inserir um por um...`);
        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          const singleValues: any[] = [];
          for (const col of columnNames) {
            let value = row[col];
            if (value === undefined) {
              value = null;
            } else if (value instanceof Date) {
              value = value.toISOString().slice(0, 19).replace('T', ' ');
            } else if (Buffer.isBuffer(value)) {
              value = value;
            } else if (typeof value === 'object' && value !== null && !(value instanceof Date) && !Buffer.isBuffer(value)) {
              try {
                value = JSON.stringify(value);
              } catch {
                value = String(value);
              }
            }
            singleValues.push(value);
          }
          const singleQuery = `INSERT INTO \`${tableName}\` (${columnsStr}) VALUES (${columnNames.map(() => '?').join(', ')})`;
          try {
            await connection.execute(singleQuery, singleValues);
          } catch (singleError: any) {
            console.error(`   ❌ Erro ao inserir registro ${j + 1}:`, singleError.message);
            console.error(`   Valores problemáticos:`, JSON.stringify(singleValues.slice(0, 5)));
            throw singleError;
          }
        }
      } else {
        throw error;
      }
    }
  }
}

/**
 * Migrar uma tabela específica
 */
async function migrateTable(
  localConn: mysql.Connection,
  prodConn: mysql.Connection,
  tableName: string,
  options: { skipData?: boolean; truncate?: boolean } = {}
): Promise<void> {
  console.log(`\n📋 Migrando tabela: ${tableName}`);

  try {
    // 1. Obter estrutura CREATE TABLE
    const createTableSQL = await getCreateTable(localConn, tableName);
    console.log(`   ✓ Estrutura obtida`);

    // 2. Criar tabela no banco de produção (DROP IF EXISTS primeiro)
    await prodConn.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
    await prodConn.execute(createTableSQL);
    console.log(`   ✓ Tabela criada no banco de produção`);

    // 3. Migrar dados se não for para pular
    if (!options.skipData) {
      const data = await getTableData(localConn, tableName);
      console.log(`   ✓ ${data.length} registros encontrados`);

      if (data.length > 0) {
        await insertTableData(prodConn, tableName, data);
        console.log(`   ✓ ${data.length} registros inseridos`);
      }
    }

    console.log(`   ✅ Tabela ${tableName} migrada com sucesso!`);
  } catch (error: any) {
    console.error(`   ❌ Erro ao migrar tabela ${tableName}:`, error.message);
    throw error;
  }
}

/**
 * Migrar todas as tabelas
 */
async function migrateAllTables(
  localConn: mysql.Connection,
  prodConn: mysql.Connection,
  options: { skipData?: boolean; tables?: string[] } = {}
): Promise<void> {
  const tables = options.tables || await getTables(localConn);
  
  console.log(`\n📊 Total de tabelas para migrar: ${tables.length}`);
  console.log(`📋 Tabelas: ${tables.join(', ')}\n`);

  // Desabilitar foreign key checks
  await disableForeignKeyChecks(prodConn);

  try {
    for (const table of tables) {
      await migrateTable(localConn, prodConn, table, { skipData: options.skipData });
    }
  } finally {
    // Reabilitar foreign key checks
    await enableForeignKeyChecks(prodConn);
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🚀 Iniciando migração do banco de dados local para produção...\n');

  // Verificar configuração de produção
  const prodConfig = getProductionConfig();
  if (!prodConfig) {
    console.error('❌ Erro: Variáveis de ambiente de produção não configuradas!');
    console.error('\nConfigure as seguintes variáveis de ambiente:');
    console.error('  - MYSQL_HOST_PROD');
    console.error('  - MYSQL_DATABASE_PROD');
    console.error('  - MYSQL_USER_PROD');
    console.error('  - MYSQL_PASSWORD_PROD');
    console.error('  - MYSQL_PORT_PROD (opcional, padrão: 3306)');
    console.error('  - MYSQL_SSL_PROD (opcional, "true" ou "1")');
    process.exit(1);
  }

  const localConfig = getLocalConfig();

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
    console.log(`   ⚠️  Configure este IP no cPanel > Remote MySQL\n`);
  } else {
    console.log('   ⚠️  Não foi possível obter IP público automaticamente\n');
  }

  console.log('📦 Configuração Local:');
  console.log(`   Host: ${localConfig.host}`);
  console.log(`   Database: ${localConfig.database}`);
  console.log(`   User: ${localConfig.user}\n`);

  console.log('📦 Configuração Produção:');
  console.log(`   Host: ${prodConfig.host}`);
  console.log(`   Database: ${prodConfig.database}`);
  console.log(`   User: ${prodConfig.user}`);
  console.log(`   SSL: ${prodConfig.ssl ? 'Habilitado' : 'Desabilitado'}\n`);

  // Confirmar antes de continuar
  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    console.log('⚠️  Modo automático ativado (--yes)\n');
  } else {
    console.log('⚠️  ATENÇÃO: Esta operação irá:');
    console.log('   1. Apagar TODAS as tabelas do banco de produção');
    console.log('   2. Recriar todas as tabelas com a estrutura do banco local');
    console.log('   3. Copiar TODOS os dados do banco local para produção\n');
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>(resolve => {
      readline.question('Deseja continuar? (sim/não): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'sim' && answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('❌ Migração cancelada pelo usuário.');
      process.exit(0);
    }
  }

  let localConn: mysql.Connection | null = null;
  let prodConn: mysql.Connection | null = null;

  try {
    // Conectar aos bancos
    console.log('\n🔌 Conectando ao banco local...');
    localConn = await mysql.createConnection(localConfig);
    console.log('✅ Conectado ao banco local');

    console.log('\n🔌 Conectando ao banco de produção...');
    try {
      prodConn = await mysql.createConnection(prodConfig);
      console.log('✅ Conectado ao banco de produção');
    } catch (sslError: any) {
      // Se falhar com SSL, tentar sem SSL
      if (prodConfig.ssl && (sslError.message.includes('secure connection') || sslError.message.includes('SSL'))) {
        console.log('   ⚠️  Servidor não suporta SSL, tentando sem SSL...');
        const prodConfigNoSSL: DatabaseConfig = { ...prodConfig };
        delete prodConfigNoSSL.ssl; // Remover SSL ao invés de definir como false
        prodConn = await mysql.createConnection(prodConfigNoSSL);
        console.log('✅ Conectado ao banco de produção (sem SSL)');
      } else {
        throw sslError;
      }
    }

    // Verificar se o banco de produção existe
    const [databases] = await prodConn.execute<mysql.RowDataPacket[]>(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [prodConfig.database]
    );

    if (databases.length === 0) {
      console.log(`\n📦 Criando banco de dados ${prodConfig.database}...`);
      await prodConn.execute(`CREATE DATABASE IF NOT EXISTS \`${prodConfig.database}\``);
      await prodConn.execute(`USE \`${prodConfig.database}\``);
      console.log('✅ Banco de dados criado');
    } else {
      await prodConn.execute(`USE \`${prodConfig.database}\``);
    }

    // Migrar todas as tabelas
    const startTime = Date.now();
    await migrateAllTables(localConn, prodConn);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Migração concluída com sucesso em ${duration}s!`);
    console.log('\n📊 Resumo:');
    const tables = await getTables(localConn);
    console.log(`   - ${tables.length} tabelas migradas`);
    
    // Contar total de registros
    let totalRecords = 0;
    for (const table of tables) {
      const [count] = await prodConn!.execute<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM \`${table}\``
      );
      totalRecords += count[0].count;
    }
    console.log(`   - ${totalRecords} registros copiados`);

  } catch (error: any) {
    console.error('\n❌ Erro durante a migração:', error.message);
    
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('secure connection') || errorMsg.includes('ssl')) {
      console.error('\n💡 Erro de SSL detectado!');
      console.error('   Configure MYSQL_SSL_PROD=false no .env e tente novamente.\n');
    } else if (errorMsg.includes('access denied') || errorMsg.includes('er_access_denied')) {
      console.error('\n🔐 Erro de Acesso Negado - Configuração de IP Necessária\n');
      console.error('📌 Explicação:');
      console.error(`   - Servidor MySQL (destino): ${prodConfig.host} (IP do cPanel)`);
      if (publicIP) {
        console.error(`   - Sua máquina (origem): ${publicIP} (IP que precisa ser autorizado)`);
      }
      console.error(`   - O MySQL bloqueou porque seu IP não está autorizado\n`);
      
      console.error('✅ SOLUÇÃO: Configure acesso remoto no cPanel:\n');
      console.error('   1. Acesse: cPanel > Remote MySQL');
      if (publicIP) {
        console.error(`   2. Adicione este IP de origem: ${publicIP}`);
        console.error(`   3. Ou adicione os IPs locais: ${localIPs.join(', ')}`);
        console.error(`   4. Ou use '%' para permitir qualquer IP (apenas para teste)\n`);
      } else {
        console.error(`   2. Adicione o IP público da sua máquina`);
        console.error(`   3. Ou use '%' para permitir qualquer IP (apenas para teste)\n`);
      }
    }
    
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Fechar conexões
    if (localConn) {
      await localConn.end();
      console.log('\n🔌 Conexão local fechada');
    }
    if (prodConn) {
      await prodConn.end();
      console.log('🔌 Conexão produção fechada');
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

export { main as migrateToProduction };

