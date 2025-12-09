import { Request, Response, NextFunction } from 'express';
import { createErrorResponse } from '../utils/response';

export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json(
    createErrorResponse(`Rota não encontrada: ${req.method} ${req.path}`)
  );
}

