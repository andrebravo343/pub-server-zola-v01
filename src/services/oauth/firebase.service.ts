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
    const projectId = process.env.FIREBASE_PROJECT_ID || 'zolangola-ao';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-fbsvc@zolangola-ao.iam.gserviceaccount.com';
    const privateKey = process.env.FIREBASE_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDDpxw9APZXEPel\n86Kse4rz754y/yGSwI73yCqtwteJ7OUdyzfWTQMjHHiwNAGBeOL8bnTybf8TvmHa\nvjJjOdCQNXBIozkdMEKgTa4dSoG6F42q0mMR82Pnb+28/unYEy9IH7BtQveUw8We\nldqwMFHpCmB9hS8oPRx93C1f+xwAv3iWAWUqMuAe6tMd+ecG9Clk1kXt/spa+UoZ\nkPO4kk40/mupGTSN07uNqIVEBiScaWf9q2qHaaduLYuJFA7I8wwWSGSYAlnqh1/O\ncs3fh9aaKkcM4vdt5rJbPy088Azj97RDV9ZeGaO2YzNA1xv4xm70Nq2Ilkxy6BeD\nqhagDp3PAgMBAAECggEAWnPXI8LeoFj5TREqi1hgYK9OcaAvCtQYJKi3Rnb2Q88w\nC4qoiVw4T5K5nyij65ISSobcbTn6O8wAHGtjCymu6QSzoPlJDdwCaW8QSH1qJTj/\nZ1J1t9ZQwS4neIFXZexUpyDzZUgZAv9RTSRVoq/sJnOEMXOR3iYGlo9ksON8SkFr\nOywE3w1LIfdNzAEd1A00mskX4264TDE6MNUYyUjCspA9VySoZ1F6McQDr99ZBAAo\nagxcUEN6/sv5dMZwONCBr1SEnSdzW5hRBydMhX2b9/9vRevNHWK7H890cpbWoLwS\nMm19snOzzrjELYxn0TPDJBr16NRbQXcBuClyMq3qsQKBgQD1Ar+y6KCqUBZaGcFM\nGFqFUzM4knuh6lc3SIAkosf3Vdq9PVqmpS90yZm2nMwsFNePyt10T9+2bez+gQHr\nlU6jtxherLlugFZgtE9gHdfkytXJYAYlycr+4IyLFMgqrSW2xAUS0OkUPoAXf5EX\nGmfusP++gbkV7T4Vu65qRZLI3wKBgQDMbaAvHmZRpWQe4rZKFos0Od/3NjQln3Vt\nt7G+yZlId5XzMdQyXHcYCP9yZqGsfeB+xiC3DJjhugJr3KE+IbGtYe+k+ZoAukn3\nncZwW0S4M6/eDqUwS+uag/3GVygY5sDdOJ9cD6sUvCXq5yR0mLeLfzmAjNzqoeHl\ns+59Rv6ZEQKBgFAE4c7wouh814/9sV/E5Gt+zM/BJ5euDWYEy7UrZNumspXzn9Ol\nR2aBIS6+7v/GntBblRATtiDCrhBA2fuy+8gEWHUzPCyWxZ83xGTD2mrixAfM0LUu\nvpmXhM83rlghzJtwUaffiwANmZATHbPJ7//I1v3FKEm8/fXjIgebSWFJAoGAF+WU\nvQ1TrqWjz4x2/LAn86H0UWSvsdozEvFPQNs2JOd9yuD/SifO8CtVGR1wNsa8MHWe\nq2c4k+J3l/5Bhw7PQ1JYfjODUiR0sxJpeQbiQJoiK9YQb1Xgo75cMwxLLqYC05lj\n35IhUJox4ITGmS6k/hSQNzvAM1lbG8vtzA05g9ECgYAdrwhMXj+PO2KnY8fZFNz4\nA8T4s1KvymalplGibu7Pfy93TsQlYq/McUIzsS2GQZn5FmFizNyvlzvpfF8I1k08\nqp2IxZ3s33+g08bQ20MXBxc7yOJ8KTWIFFI+y4MEsVyGzBwjw9lpnktR/EniJBdE\ndOiTQfoPRRHzDhNB+ue99Q==\n-----END PRIVATE KEY-----\n';

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

