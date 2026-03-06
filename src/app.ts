import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';
import { testConnection } from './config/database';

// Importar rotas
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import companyRoutes from './routes/company.routes';
import talentRoutes from './routes/talent.routes';
import publicRoutes from './routes/public.routes';
import uploadsRoutes from './routes/uploads.routes'; 

const app: Application = express();

// Trust proxy - necessário para Vercel e outros proxies reversos
// Permite que Express confie nos headers X-Forwarded-* do proxy
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Permitir popups do Firebase
}));

// Função auxiliar para normalizar origins (remover trailing slash e normalizar)
const normalizeOrigin = (origin: string): string => {
  return origin.replace(/\/$/, ''); // Remove trailing slash
};

// CORS - Configuração melhorada para preflight requests
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) {
      return callback(null, true);
    }

    // Normalizar origin (remover trailing slash)
    const normalizedOrigin = normalizeOrigin(origin);

    // Em desenvolvimento, sempre permitir localhost
    const isDevelopment = config.nodeEnv === 'development';
    if (isDevelopment && normalizedOrigin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

    // Verificar se origin está na lista permitida
    const allowedOrigins = Array.isArray(config.cors.origin) 
      ? config.cors.origin 
      : [config.cors.origin];
    
    // Normalizar todos os origins permitidos e verificar
    const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);
    
    // Verificar match exato ou com/sem www
    const isAllowed = normalizedAllowedOrigins.some(allowed => {
      const normalizedAllowed = normalizeOrigin(allowed);
      // Match exato
      if (normalizedOrigin === normalizedAllowed) {
        return true;
      }
      // Match com/sem www
      if (normalizedOrigin.replace(/^https?:\/\/(www\.)?/, '') === normalizedAllowed.replace(/^https?:\/\/(www\.)?/, '')) {
        return true;
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // Log para debug em produção
      if (config.nodeEnv === 'production') {
        console.warn('CORS bloqueado:', {
          origin: normalizedOrigin,
          allowedOrigins: normalizedAllowedOrigins,
        });
      }
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204, // Resposta 204 para OPTIONS
};

app.use(cors(corsOptions));

// Tratamento explícito de OPTIONS para evitar redirects
app.options('*', cors(corsOptions));

// Rate Limiting - Limites mais altos em desenvolvimento (configurado em env.ts)
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Muitas requisições deste IP, tente novamente mais tarde.',
      message: 'Muitas requisições deste IP, tente novamente mais tarde.',
    });
  },
});
app.use('/api/', limiter);  

// Middleware para normalizar URLs (remover barras duplas)
app.use((req: Request, _res: Response, next) => {
  // Normalizar path removendo barras duplas
  if (req.path.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Servir arquivos estáticos (uploads)
// Em desenvolvimento local, servir do filesystem
// Em produção (Vercel), usar rota proxy para Vercel Blob
if (!process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN) {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
} else {
  // Em produção, usar rota proxy para servir arquivos do Blob
  app.use(uploadsRoutes);
}
// Rota inicial "/"
app.get('/', async (_req: Request, res: Response) => {
  try {
    const dbConnected = await testConnection();
    res.status(200).json({
      success: true,
      data: {
        message: 'Bem-vindo à API ZOLANGOLA!', 
        version: config.apiVersion,
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
        database: {
          connected: dbConnected,
          status: dbConnected ? 'Conectado com sucesso' : 'Falha na conexão',
        },
      },
    });
  } catch (error) {
    // Se houver erro ao testar conexão, ainda retornar resposta mas indicar erro
    console.error('Erro ao testar conexão com banco de dados:', error);
  res.status(200).json({
    success: true,
    data: {
      message: 'Bem-vindo à API ZOLANGOLA!',
      version: config.apiVersion,
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
        database: {
          connected: false,
          status: 'Erro ao verificar conexão',
        },
    },
  });
  }
});

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    },
  });
});

// API Routes
const apiPrefix = `/api/${config.apiVersion}`;

// Rotas de autenticação (públicas)
app.use(`${apiPrefix}/auth`, authRoutes);

// Rotas públicas (site institucional)
app.use(`${apiPrefix}/public`, publicRoutes);

// Rotas protegidas
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/company`, companyRoutes);
app.use(`${apiPrefix}/talent`, talentRoutes);

// Rotas de compatibilidade (redirecionar URLs antigas sem /api/v1)
app.use('/public', (req: Request, res: Response, _next: NextFunction) => {
  // Redirecionar para a rota correta com /api/v1
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const newPath = `${apiPrefix}/public${req.path}${queryString}`;
  res.redirect(301, newPath);
});

app.use('/auth', (req: Request, res: Response, _next: NextFunction) => {
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const newPath = `${apiPrefix}/auth${req.path}${queryString}`;
  res.redirect(301, newPath);
});

// 404 Handler
app.use(notFoundHandler);

// Error Handler (deve ser o último middleware)
app.use(errorHandler);

export default app;

