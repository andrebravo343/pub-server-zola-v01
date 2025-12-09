import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execute } from '../utils/database';
import { testConnection } from '../config/database';

// Carregar variáveis de ambiente
dotenv.config();

async function runNewsMigration() {
  try {
    console.log('🔄 Executando migração da tabela news...');

    // Testar conexão
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Não foi possível conectar ao banco de dados');
    }

    // Executar migração 004
    const migration = '004_create_news_table.sql';
    console.log(`📝 Executando: ${migration}`);
    
    const sql = readFileSync(
      join(__dirname, 'migrations', migration),
      'utf-8'
    );

    // Executar cada statement separadamente
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await execute(statement);
    }

    console.log(`✅ ${migration} executado com sucesso!`);
    console.log('✅ Tabela news criada!');
    process.exit(0);
  } catch (error: any) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('ℹ️  Tabela news já existe. Nada a fazer.');
      process.exit(0);
    } else {
      console.error('❌ Erro ao executar migração:', error);
      process.exit(1);
    }
  }
}

runNewsMigration();

