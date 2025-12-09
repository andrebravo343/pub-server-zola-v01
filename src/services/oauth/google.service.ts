import { OAuth2Client } from 'google-auth-library';
import { CustomError } from '../../middlewares/errorHandler';
import { firebaseAuthService } from './firebase.service';

export interface GoogleProfile {
  sub: string; // Google user ID
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

class GoogleOAuthService {
  private client: OAuth2Client | null = null;
  private initialized: boolean = false;

  /**
   * Inicializar configurações (lazy initialization)
   */
  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
  }

  /**
   * Inicializar cliente OAuth do Google
   */
  private getClient(): OAuth2Client {
    this.initialize();
    
    if (!this.client) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new CustomError('Configuração do Google OAuth não encontrada. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET', 500);
      }

      this.client = new OAuth2Client(clientId, clientSecret);
    }

    return this.client;
  }

  /**
   * Verificar ID Token do Google/Firebase e retornar perfil
   * Tenta primeiro com Firebase, depois com Google Auth Library
   */
  async verifyToken(idToken: string): Promise<GoogleProfile> {
    // Tentar primeiro com Firebase (se configurado)
    if (firebaseAuthService.isConfigured()) {
      try {
        const firebaseProfile = await firebaseAuthService.verifyToken(idToken);
        return {
          sub: firebaseProfile.uid,
          email: firebaseProfile.email,
          name: firebaseProfile.name,
          picture: firebaseProfile.picture,
          email_verified: firebaseProfile.email_verified,
        };
      } catch (firebaseError) {
        // Se Firebase falhar, tentar com Google Auth Library
        // (pode ser um token do Google direto, não do Firebase)
        console.log('Firebase verification failed, trying Google Auth Library...');
      }
    }

    // Tentar com Google Auth Library (fallback)
    try {
      const client = this.getClient();
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new CustomError('Token do Google inválido', 401);
      }

      return {
        sub: payload.sub,
        email: payload.email || '',
        name: payload.name || '',
        picture: payload.picture,
        email_verified: payload.email_verified,
      };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      throw new CustomError('Erro ao verificar token do Google', 401);
    }
  }
}

// Lazy initialization - criar instância apenas quando necessário
let googleOAuthServiceInstance: GoogleOAuthService | null = null;

export function getGoogleOAuthService(): GoogleOAuthService {
  if (!googleOAuthServiceInstance) {
    googleOAuthServiceInstance = new GoogleOAuthService();
  }
  return googleOAuthServiceInstance;
}

// Exportar instância para compatibilidade (será inicializada lazy)
export const googleOAuthService = new GoogleOAuthService();

