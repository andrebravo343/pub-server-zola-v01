import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface JWTPayload {
  userId: string;
  userType: 'talent' | 'company' | 'admin';
  email: string;
}

/**
 * Gera um token JWT
 */
export function generateToken(payload: JWTPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(
    payload,
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Gera um refresh token
 */
export function generateRefreshToken(payload: JWTPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jwt.sign as any)(
    payload,
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
}

/**
 * Verifica e decodifica um token JWT
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  } catch (error) {
    throw new Error('Token inválido ou expirado');
  }
}

/**
 * Verifica e decodifica um refresh token
 */
export function verifyRefreshToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
  } catch (error) {
    throw new Error('Refresh token inválido ou expirado');
  }
}
