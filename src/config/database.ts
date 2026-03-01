import mysql from 'mysql2/promise';
// dotenv será carregado apenas no server.ts

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

// Determinar se estamos em desenvolvimento ou produção
const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';

const config: DatabaseConfig = {
  // Suportar tanto MYSQL_* quanto DB_* para compatibilidade
  // Usar apenas variáveis de ambiente - sem fallbacks hardcoded para segurança
  host: process.env.MYSQL_HOST_PROD || process.env.DB_HOST || (isDevelopment ? 'localhost' : ''),
  port: parseInt(process.env.MYSQL_PORT_PROD || process.env.DB_PORT || '3306', 10),
  user: process.env.MYSQL_USER_PROD || process.env.DB_USER || (isDevelopment ? 'root' : ''),
  password: process.env.MYSQL_PASSWORD_PROD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQL_DATABASE_PROD || process.env.DB_NAME || (isDevelopment ? 'zolangola_db' : ''),
  connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || process.env.DB_CONNECTION_LIMIT || '10', 10),
};

// Pool de conexões MySQL
// Configuração otimizada para serverless (Vercel)
export const pool = mysql.createPool({
  ...config,
  ssl: process.env.MYSQL_SSL_PROD === 'true' ? { rejectUnauthorized: false } : false as any, // Desabilitar SSL - cPanel não aceita SSL (false é necessário, não undefined)
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Configurações específicas para serverless
  connectionLimit: process.env.VERCEL ? 2 : config.connectionLimit, // Limitar conexões em serverless
});

// Testar conexão
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    console.log('Conexão com MySQL estabelecida com sucesso! '+config.host); 
    connection.release();
    return true;
  } catch (error) {
    console.error('Erro ao conectar ao MySQL:', error);
    return false;
  }
}

export default config;
