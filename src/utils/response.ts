/**
 * Padrão de resposta da API ZOLANGOLA
 * Todas as respostas devem seguir este formato
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Criar resposta de sucesso
 */
export function createSuccessResponse<T>(data: T, message?: string): ApiSuccess<T> {
  return { success: true, data, message };
}

/**
 * Criar resposta de erro
 */
export function createErrorResponse(error: string): ApiError {
  return { success: false, error };
}

/**
 * Helper para enviar resposta de sucesso
 */
export function sendSuccess<T>(res: any, data: T, message?: string, statusCode: number = 200): void {
  res.status(statusCode).json(createSuccessResponse(data, message));
}

/**
 * Helper para enviar resposta de erro
 */
export function sendError(res: any, error: string, statusCode: number = 400): void {
  res.status(statusCode).json(createErrorResponse(error));
}
