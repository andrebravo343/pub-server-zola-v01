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
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  // Log do erro em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    console.error('Erro:', {
      message: err.message,
      stack: err.stack,
      statusCode,
      path: req.path,
      method: req.method,
    });
  }

  res.status(statusCode).json(createErrorResponse(message));
}

