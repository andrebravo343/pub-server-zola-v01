/**
 * Script para migrar todos os dados do banco de dados local para produção
 * Com suporte aprimorado para TiDB Cloud
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
  ssl?: any;
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

  const sslConfig = process.env.MYSQL_SSL_PROD;
  if (sslConfig === 'true' || sslConfig === '1') {
    config.ssl = { rejectUnauthorized: false };
  }

  if (process.env.MYSQL_CONNECTION_LIMIT) {
    config.connectionLimit = parseInt(process.env.MYSQL_CONNECTION_LIMIT);
  }

  return config;
}

/**
 * Ajustar CREATE TABLE para compatibilidade com TiDB
 */
function adjustCreateTableForTiDB(createTableSQL: string): string {
  let adjustedSQL = createTableSQL;

  // 1. Remover ENGINE=InnoDB se existir (TiDB usa InnoDB por padrão)
  adjustedSQL = adjustedSQL.replace(/ENGINE=InnoDB/gi, '');

  // 2. Ajustar índices FULLTEXT
  // Padrão MySQL: FULLTEXT KEY `idx_name` (`col1`,`col2`,`col3`)
  // TiDB requer: Um índice FULLTEXT por coluna
  
  // Encontrar todos os índices FULLTEXT
  const fulltextRegex = /FULLTEXT\s+KEY\s+`([^`]+)`\s*\(([^)]+)\)/gi;
  const fulltextMatches = [...adjustedSQL.matchAll(fulltextRegex)];

  if (fulltextMatches.length > 0) {
    console.log(`   ⚠️  Ajustando ${fulltextMatches.length} índice(s) FULLTEXT para TiDB...`);

    for (const match of fulltextMatches) {
      const fullMatch = match[0];
      const indexName = match[1];
      const columns = match[2];

      // Separar colunas
      const columnList = columns.split(',').map(col => col.trim().replace(/`/g, ''));

      if (columnList.length > 1) {
        // Múltiplas colunas - criar um índice para cada
        const newIndexes = columnList.map((col, idx) => {
          return `FULLTEXT KEY \`${indexName}_${idx}\` (\`${col}\`)`;
        }).join(',\n  ');

        adjustedSQL = adjustedSQL.replace(fullMatch, newIndexes);
        console.log(`   ✓ Índice FULLTEXT '${indexName}' dividido em ${columnList.length} índices`);
      } else {
        // Uma única coluna - manter como está
        console.log(`   ✓ Índice FULLTEXT '${indexName}' já está correto`);
      }
    }
  }

  // 3. Remover ROW_FORMAT se existir (TiDB pode não suportar todas as opções)
  adjustedSQL = adjustedSQL.replace(/ROW_FORMAT=\w+/gi, '');

  // 4. Limpar espaços extras
  adjustedSQL = adjustedSQL.replace(/,\s*,/g, ',');
  adjustedSQL = adjustedSQL.replace(/\s+/g, ' ').trim();

  return adjustedSQL;
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

  const [columns] = await connection.execute<mysql.RowDataPacket[]>(
    `SHOW COLUMNS FROM \`${tableName}\``
  );
  const columnNames = columns.map(col => col.Field);
  const columnsStr = columnNames.map(col => `\`${col}\``).join(', ');

  const batchSize = 100;
  const placeholderRow = `(${columnNames.map(() => '?').join(', ')})`;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const batchValues: any[] = [];
    const batchPlaceholders: string[] = [];

    for (const row of batch) {
      const rowValues: any[] = [];
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
        rowValues.push(value);
      }
      batchValues.push(...rowValues);
      batchPlaceholders.push(placeholderRow);
    }

    const batchQuery = `INSERT INTO \`${tableName}\` (${columnsStr}) VALUES ${batchPlaceholders.join(', ')}`;
    
    try {
      await connection.execute(batchQuery, batchValues);
    } catch (error: any) {
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

    // 2. Ajustar SQL para TiDB
    const adjustedSQL = adjustCreateTableForTiDB(createTableSQL);

    // 3. Criar tabela no banco de produção (DROP IF EXISTS primeiro)
    await prodConn.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
    
    try {
      await prodConn.execute(adjustedSQL);
      console.log(`   ✓ Tabela criada no banco de produção`);
    } catch (createError: any) {
      console.error(`   ❌ Erro ao criar tabela:`, createError.message);
      console.log(`   📝 SQL gerado (primeiras 500 chars):`);
      console.log(`   ${adjustedSQL.substring(0, 500)}...`);
      throw createError;
    }

    // 4. Migrar dados se não for para pular
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

  await disableForeignKeyChecks(prodConn);

  try {
    for (const table of tables) {
      await migrateTable(localConn, prodConn, table, { skipData: options.skipData });
    }
  } finally {
    await enableForeignKeyChecks(prodConn);
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🚀 Iniciando migração do banco de dados local para produção (TiDB Cloud)...\n');

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

  console.log('🌐 Informações de Rede:');
  const localIPs = getLocalIPs();
  if (localIPs.length > 0) {
    console.log(`   IPs Locais: ${localIPs.join(', ')}`);
  }
  
  console.log('   Obtendo IP público...');
  const publicIP = await getPublicIP();
  if (publicIP) {
    console.log(`   IP Público: ${publicIP}`);
    console.log(`   ⚠️  Configure este IP no TiDB Cloud > Network Access\n`);
  } else {
    console.log('   ⚠️  Não foi possível obter IP público automaticamente\n');
  }

  console.log('📦 Configuração Local:');
  console.log(`   Host: ${localConfig.host}`);
  console.log(`   Database: ${localConfig.database}`);
  console.log(`   User: ${localConfig.user}\n`);

  console.log('📦 Configuração Produção (TiDB Cloud):');
  console.log(`   Host: ${prodConfig.host}`);
  console.log(`   Database: ${prodConfig.database}`);
  console.log(`   User: ${prodConfig.user}`);
  console.log(`   SSL: ${prodConfig.ssl ? 'Habilitado' : 'Desabilitado'}\n`);

  if (process.argv.includes('--yes') || process.argv.includes('-y')) {
    console.log('⚠️  Modo automático ativado (--yes)\n');
  } else {
    console.log('⚠️  ATENÇÃO: Esta operação irá:');
    console.log('   1. Apagar TODAS as tabelas do banco de produção');
    console.log('   2. Recriar todas as tabelas com a estrutura do banco local');
    console.log('   3. Ajustar índices FULLTEXT para compatibilidade com TiDB');
    console.log('   4. Copiar TODOS os dados do banco local para produção\n');
    
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
    console.log('\n🔌 Conectando ao banco local...');
    localConn = await mysql.createConnection(localConfig);
    console.log('✅ Conectado ao banco local');

    console.log('\n🔌 Conectando ao banco de produção (TiDB Cloud)...');
    try {
      prodConn = await mysql.createConnection(prodConfig);
      console.log('✅ Conectado ao banco de produção');
    } catch (sslError: any) {
      if (prodConfig.ssl && (sslError.message.includes('secure connection') || sslError.message.includes('SSL'))) {
        console.log('   ⚠️  Erro com SSL, tentando sem SSL...');
        const prodConfigNoSSL: DatabaseConfig = { ...prodConfig };
        delete prodConfigNoSSL.ssl;
        prodConn = await mysql.createConnection(prodConfigNoSSL);
        console.log('✅ Conectado ao banco de produção (sem SSL)');
      } else {
        throw sslError;
      }
    }

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

    const startTime = Date.now();
    await migrateAllTables(localConn, prodConn);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Migração concluída com sucesso em ${duration}s!`);
    console.log('\n📊 Resumo:');
    const tables = await getTables(localConn);
    console.log(`   - ${tables.length} tabelas migradas`);
    
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
    
    if (errorMsg.includes('access denied') || errorMsg.includes('er_access_denied')) {
      console.error('\n🔐 Erro de Acesso - Configure o Network Access no TiDB Cloud\n');
      console.error('✅ SOLUÇÃO:');
      console.error('   1. Acesse: https://tidbcloud.com/console/clusters');
      console.error('   2. Selecione seu cluster');
      console.error('   3. Vá em "Network Access"');
      if (publicIP) {
        console.error(`   4. Adicione este IP: ${publicIP}`);
      } else {
        console.error(`   4. Adicione o IP público da sua máquina`);
      }
      console.error('   5. Ou use 0.0.0.0/0 para permitir qualquer IP (apenas para teste)\n');
    }
    
    console.error(error.stack);
    process.exit(1);
  } finally {
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

if (require.main === module) {
  main().catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

export { main as migrateToProduction };