import { v4 as uuidv4 } from 'uuid';

/**
 * Gera um UUID v4
 */
export function generateUUID(): string {
  return uuidv4();
}

