/**
 * Tipos relacionados a Autenticação
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  userType: 'talent' | 'company' | 'admin';
  // Campos adicionais conforme o tipo de usuário
  firstName?: string;
  lastName?: string;
  companyName?: string;
  nif?: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    userType: 'talent' | 'company' | 'admin';
  };
}

