/**
 * Serviço para verificar tokens do Firebase Auth
 */

import admin from 'firebase-admin';
import { CustomError } from '../../middlewares/errorHandler';

export interface FirebaseProfile {
  uid: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

class FirebaseAuthService {
  private initialized: boolean = false;

  /**
   * Inicializar Firebase Admin SDK
   */
  private initialize(): void {
    if (this.initialized) return;

    // Verificar se já foi inicializado
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }
    
    // Verificar se temos as credenciais necessárias
    // Usar apenas variáveis de ambiente - sem fallbacks hardcoded para segurança
    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
    const privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase Admin não configurado. Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY');
      this.initialized = true; // Marcar como inicializado para não tentar novamente
      return;
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.initialized = true;
    } catch (error) {
      console.error('Erro ao inicializar Firebase Admin:', error);
      this.initialized = true; // Marcar como inicializado para não tentar novamente
    }
  }

  /**
   * Verificar ID Token do Firebase e retornar perfil
   */
  async verifyToken(idToken: string): Promise<FirebaseProfile> {
    this.initialize();

    if (admin.apps.length === 0) {
      throw new CustomError('Firebase Admin não está configurado', 500);
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      return {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name || '',
        picture: decodedToken.picture,
        email_verified: decodedToken.email_verified,
      };
    } catch (error: any) {
      if (error instanceof CustomError) {
        throw error;
      }

      // Erros específicos do Firebase
      if (error.code === 'auth/id-token-expired') {
        throw new CustomError('Token do Firebase expirado', 401);
      }

      if (error.code === 'auth/id-token-revoked') {
        throw new CustomError('Token do Firebase revogado', 401);
      }

      if (error.code === 'auth/argument-error') {
        throw new CustomError('Token do Firebase inválido', 401);
      }

      throw new CustomError('Erro ao verificar token do Firebase', 401);
    }
  }

  /**
   * Verificar se Firebase está configurado
   */
  isConfigured(): boolean {
    this.initialize();
    return admin.apps.length > 0;
  }
}

// Exportar instância singleton
export const firebaseAuthService = new FirebaseAuthService();

