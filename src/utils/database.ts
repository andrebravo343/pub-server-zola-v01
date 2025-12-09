import { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/database';

/**
 * Executa uma query e retorna os resultados
 */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  try {
    // Garantir que params seja sempre um array
    const queryParams = params || [];
    const [rows] = await pool.execute(sql, queryParams);
    return rows as T[];
  } catch (error) {
    console.error('Erro na query:', error);
    throw error;
  }
}

/**
 * Executa uma query e retorna apenas o primeiro resultado
 */
export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  // Garantir que params seja sempre um array
  const queryParams = params || [];
  const results = await query<T>(sql, queryParams);
  return results.length > 0 ? results[0] : null;
}

/**
 * Executa uma query de inserção/atualização e retorna o resultado
 */
export async function execute(
  sql: string,
  params?: any[]
): Promise<any> {
  try {
    // Garantir que params seja sempre um array
    const queryParams = params || [];
    const [result] = await pool.execute(sql, queryParams);
    return result;
  } catch (error) {
    console.error('Erro na execução:', error);
    throw error;
  }
}

/**
 * Inicia uma transação
 */
export async function beginTransaction(): Promise<PoolConnection> {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  return connection;
}

/**
 * Commit de uma transação
 */
export async function commit(connection: PoolConnection): Promise<void> {
  await connection.commit();
  connection.release();
}

/**
 * Rollback de uma transação
 */
export async function rollback(connection: PoolConnection): Promise<void> {
  await connection.rollback();
  connection.release();
}

/**
 * Escapa valores para prevenir SQL injection
 */
export function escape(value: any): string {
  return pool.escape(value);
}
