import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { CustomError } from './errorHandler';

/**
 * Middleware para validar requisições usando express-validator
 */
export function validateRequest(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err) => {
      if ('msg' in err) {
        return err.msg;
      }
      return 'Erro de validação';
    });

    throw new CustomError(errorMessages.join(', '), 400);
  }

  next();
}

