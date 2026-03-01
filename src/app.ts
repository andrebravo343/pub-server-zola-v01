import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';

// Importar rotas
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import companyRoutes from './routes/company.routes';
import talentRoutes from './routes/talent.routes';
import publicRoutes from './routes/public.routes';

const app: Application = express();

// Security Middleware
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Permitir popups do Firebase
}));

// CORS
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], 
  })
);

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
// Nota: Em ambiente serverless (Vercel), arquivos não persistem entre deployments
// Considere usar serviços externos (S3, Cloudinary, etc.) para produção
if (!process.env.VERCEL) {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
}

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

// 404 Handler
app.use(notFoundHandler);

// Error Handler (deve ser o último middleware)
app.use(errorHandler);

export default app;

