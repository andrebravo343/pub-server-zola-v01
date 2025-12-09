import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { CustomError } from './errorHandler';

// Estender o tipo Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Middleware de autenticação JWT
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new CustomError('Token de autenticação não fornecido', 401);
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    const decoded = verifyToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    throw new CustomError('Token inválido ou expirado', 401);
  }
}

/**
 * Middleware para verificar tipo de usuário
 */
export function requireUserType(...allowedTypes: ('talent' | 'company' | 'admin')[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new CustomError('Autenticação necessária', 401);
    }

    if (!allowedTypes.includes(req.user.userType)) {
      throw new CustomError('Acesso negado. Tipo de usuário não autorizado', 403);
    }

    next();
  };
}

/**
 * Middleware combinado: autenticação + tipo de usuário
 */
export function requireAuth(...allowedTypes: ('talent' | 'company' | 'admin')[]) {
  return [authenticate, requireUserType(...allowedTypes)];
}

