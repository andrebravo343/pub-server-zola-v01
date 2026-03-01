import { Request, Response, NextFunction } from 'express';
import { createErrorResponse } from '../utils/response';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Tratar erros de CORS especificamente
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({
      success: false,
      error: 'CORS não permitido',
      message: 'Origem não permitida pela política CORS',
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  let message = err.message || 'Erro interno do servidor';

  // Log do erro (sempre logar em produção para debugging)
  console.error('Erro na API:', {
    message: err.message,
    statusCode,
    path: req.path,
    method: req.method,
    url: req.url,
    origin: req.headers.origin,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Não expor detalhes de erro de banco de dados em produção
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    // Se for erro de banco de dados, retornar mensagem genérica
    if (err.message?.includes('Access denied') || err.message?.includes('database') || err.message?.includes('MySQL')) {
      message = 'Erro de conexão com o banco de dados. Verifique as configurações.';
    } else {
      message = 'Erro interno do servidor';
    }
  }

  res.status(statusCode).json(createErrorResponse(message));
}

