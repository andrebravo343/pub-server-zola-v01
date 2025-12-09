import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execute, queryOne } from '../utils/database';
import { testConnection } from '../config/database';

// Carregar variáveis de ambiente
dotenv.config();

async function runMigrations() {
  try {
    console.log('🔄 Iniciando migrations...');

    // Testar conexão
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Não foi possível conectar ao banco de dados');
    }

    // Lista de migrations em ordem
    const migrations = [
      '000_create_users_table.sql',
      '001_create_auth_tables.sql',
      '002_create_admin_invites_table.sql',
      '003_add_profile_picture_to_admin_users.sql',
      '004_create_news_table.sql',
    ];

    for (const migration of migrations) {
      console.log(`📝 Executando: ${migration}`);
      
      // Verificação especial para migração 003
      if (migration === '003_add_profile_picture_to_admin_users.sql') {
        const colExists = await queryOne<{ count: number }>(
          `SELECT COUNT(*) as count 
           FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'admin_users'
             AND COLUMN_NAME = 'profile_picture_url'`
        );
        
        if (colExists && colExists.count > 0) {
          console.log(`ℹ️  ${migration}: Coluna profile_picture_url já existe - Pulando...`);
          console.log(`✅ ${migration} executado com sucesso (já existia)`);
          continue;
        }
      }
      
      const sql = readFileSync(
        join(__dirname, 'migrations', migration),
        'utf-8'
      );

      // Executar cada statement separadamente
      // Remover comentários primeiro
      const cleanSql = sql
        .split('\n')
        .map(line => {
          const commentIndex = line.indexOf('--');
          return commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
        })
        .filter(line => line.length > 0)
        .join('\n');

      const statements = cleanSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        try {
          if (statement.length > 0) {
            await execute(statement);
          }
        } catch (error: any) {
          // Ignorar erros de coluna/tabela já existente
          if (
            error.code === 'ER_DUP_FIELDNAME' || // Coluna duplicada
            error.code === 'ER_TABLE_EXISTS_ERROR' || // Tabela já existe
            error.code === 'ER_DUP_KEYNAME' || // Índice duplicado
            error.code === 'ER_DUP_ENTRY' || // Entrada duplicada
            error.sqlMessage?.includes('Duplicate column') ||
            error.sqlMessage?.includes('already exists') ||
            error.sqlMessage?.includes('Duplicate key') ||
            error.message?.includes('column_already_exists')
          ) {
            console.log(`ℹ️  ${migration}: ${error.sqlMessage || error.message} - Ignorando (já existe)`);
            continue;
          }
          // Se for outro erro, relançar
          console.error(`❌ Erro em ${migration}:`, error.message);
          throw error;
        }
      }

      console.log(`✅ ${migration} executado com sucesso`);
    }

    console.log('✅ Todas as migrations foram executadas com sucesso!');
    process.exit(0);
  } catch (error: any) {
    // Se for erro de coluna/tabela já existente, não é crítico
    if (
      error.code === 'ER_DUP_FIELDNAME' ||
      error.code === 'ER_TABLE_EXISTS_ERROR' ||
      error.code === 'ER_DUP_KEYNAME'
    ) {
      console.log(`ℹ️  ${error.sqlMessage || error.message} - Continuando...`);
      console.log('✅ Migrations concluídas (algumas já existiam)');
      process.exit(0);
    }
    console.error('❌ Erro ao executar migrations:', error);
    process.exit(1);
  }
}

runMigrations();

