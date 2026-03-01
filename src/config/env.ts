// dotenv deve ser carregado apenas uma vez, no server.ts
// Não carregar aqui para evitar redundância

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiVersion: process.env.API_VERSION || 'v1',

  // JWT
  jwt: {
    // Usar apenas variáveis de ambiente - sem fallbacks hardcoded para segurança
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // CORS
  cors: {
    origin: (() => {
      const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';
      const defaultOrigins = [
        'http://localhost:5173', 
        'http://localhost:5174', 
        'http://localhost:5175', 
        'http://localhost:5176', 
        'http://localhost:5177', // Site público
        'http://localhost:3000',
        'https://zolangola.com',
        'https://www.zolangola.com',
        'https://admin.zolangola.com',
        'https://empresa.zolangola.com',
        'https://candidato.zolangola.com',
        'https://admin-zolangola.vercel.app',
        'https://empresa-zolangola.vercel.app',
        'https://candidato-zolangola.vercel.app',
        'https://site-zolangola.vercel.app',
        'https://69.10.55.154',
        'https://softhard.it.ao',
        'https://www.softhard.it.ao',
      ];
      
      // Se CORS_ORIGIN estiver definido, usar ele + localhost em desenvolvimento
      if (process.env.CORS_ORIGIN) {
        const envOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
        // Em desenvolvimento, sempre incluir localhost
        if (isDevelopment) {
          return [...new Set([...defaultOrigins, ...envOrigins])];
        }
        return envOrigins;
      }
      
      return defaultOrigins;
    })(),
  },

  // Rate Limiting
  rateLimit: (() => {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isDevelopment = nodeEnv === 'development';
    
    return {
      // Em desenvolvimento, limites muito mais altos para evitar bloqueios durante desenvolvimento
      windowMs: parseInt(
        process.env.RATE_LIMIT_WINDOW_MS || (isDevelopment ? '60000' : '900000'),
        10
      ), // 1 minuto em dev, 15 minutos em prod
      maxRequests: parseInt(
        process.env.RATE_LIMIT_MAX_REQUESTS || (isDevelopment ? '1000' : '100'),
        10
      ), // 1000 requisições/min em dev, 100 requisições/15min em prod
    };
  })(),

  // File Upload
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB
    uploadPath: process.env.UPLOAD_PATH || './uploads',
  },

  // Email
  smtp: {
    host: process.env.SMTP_HOST?.trim() || 'mail.softhard.it.ao',
    port: parseInt(process.env.SMTP_PORT?.trim() || '465', 10),
    user: process.env.SMTP_USER?.trim() || 'laboratorio@softhard.it.ao',
    // Suportar tanto SMTP_PASSWORD quanto SMTP_PASS (compatibilidade)
    // Usar apenas variáveis de ambiente - sem fallbacks hardcoded para segurança
    password: (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim(),
    from: process.env.SMTP_FROM?.trim() || 'noreply@zolangola.com',
  },

  // Admin
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@zolangola.com',
    // Usar apenas variáveis de ambiente - sem fallbacks hardcoded para segurança
    password: process.env.ADMIN_PASSWORD || '',
  },
};

export default config;
