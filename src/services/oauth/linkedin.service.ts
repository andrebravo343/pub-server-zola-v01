import axios, { AxiosError } from 'axios';
import { CustomError } from '../../middlewares/errorHandler';

export interface LinkedInProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePicture?: {
    displayImage: string;
  };
}

// Cache para códigos usados (prevenir reutilização)
const usedCodes = new Map<string, number>(); // code -> timestamp
const CODE_TTL = 60000; // 60 segundos

class LinkedInOAuthService {
  private clientId: string = '';
  private clientSecret: string = '';
  private redirectUri: string = '';
  private initialized: boolean = false;

  /**
   * Inicializar configurações (lazy initialization)
   */
  private initialize(): void {
    if (this.initialized) return;
    
    // Usar apenas variáveis de ambiente - sem fallbacks hardcoded para segurança
    this.clientId = process.env.LINKEDIN_CLIENT_ID || '';
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
    // Atualizar redirect URI padrão para admin
    this.redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'https://admin-zolangola.vercel.app/api/oauth/linkedin/callback';

    this.initialized = true;
  }

  /**
   * Trocar código de autorização por access token
   */
  private async getAccessToken(code: string, redirectUriOverride?: string): Promise<string> {
    this.initialize();
    
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new CustomError('LinkedIn OAuth não configurado. Configure LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET e LINKEDIN_REDIRECT_URI', 500);
    }

    // Verificar se o código já foi usado (prevenir reutilização)
    const now = Date.now();
    if (usedCodes.has(code)) {
      const usedAt = usedCodes.get(code)!;
      const timeSinceUse = now - usedAt;
      
      // Se foi usado recentemente (menos de 60s), rejeitar
      if (timeSinceUse < CODE_TTL) {
        throw new CustomError(
          `Código de autorização já foi usado. Aguarde alguns segundos e tente novamente.`,
          400
        );
      } else {
        // Limpar código antigo
        usedCodes.delete(code);
      }
    }

    // Marcar código como usado
    usedCodes.set(code, now);

    // Limpar códigos antigos (limpeza periódica)
    if (usedCodes.size > 100) {
      for (const [c, timestamp] of usedCodes.entries()) {
        if (now - timestamp > CODE_TTL) {
          usedCodes.delete(c);
        }
      }
    }

    // Usar redirectUri fornecido ou o configurado
    const redirectUri = redirectUriOverride || this.redirectUri;

    // Log para debug (remover em produção)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 LinkedIn OAuth Debug - getAccessToken:');
      console.log('  - Client ID:', this.clientId.substring(0, 10) + '...');
      console.log('  - Redirect URI usado:', redirectUri);
      console.log('  - Redirect URI configurado:', this.redirectUri);
      console.log('  - Redirect URI override:', redirectUriOverride || 'não fornecido');
      console.log('  - Code length:', code.length);
      console.log('  - Code (primeiros 20 chars):', code.substring(0, 20) + '...');
    }

    try {
      // Validar credenciais antes de fazer a requisição
      if (!this.clientId || this.clientId.trim() === '') {
        throw new CustomError('LINKEDIN_CLIENT_ID não configurado ou vazio', 500);
      }
      
      if (!this.clientSecret || this.clientSecret.trim() === '') {
        throw new CustomError('LINKEDIN_CLIENT_SECRET não configurado ou vazio', 500);
      }

      // Usar URLSearchParams para garantir encoding correto
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      params.append('client_id', this.clientId.trim());
      params.append('client_secret', this.clientSecret.trim());

      // Log da requisição (sem mostrar o secret completo)
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 LinkedIn OAuth Request Details:');
        console.log('  - URL: https://www.linkedin.com/oauth/v2/accessToken');
        console.log('  - Grant Type: authorization_code');
        console.log('  - Code length:', code.length);
        console.log('  - Redirect URI:', redirectUri);
        console.log('  - Client ID:', this.clientId.trim());
        console.log('  - Client Secret length:', this.clientSecret.trim().length);
        console.log('  - Client Secret (primeiros 15 chars):', this.clientSecret.trim().substring(0, 15) + '...');
      }

      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }
      );

      if (!response.data.access_token) {
        // Remover código do cache se falhou
        usedCodes.delete(code);
        throw new CustomError('Access token não retornado pelo LinkedIn', 401);
      }

      // Sucesso - manter código no cache por mais um pouco para prevenir reutilização
      return response.data.access_token;
    } catch (error: any) {
      if (error instanceof CustomError) {
        throw error;
      }

      const axiosError = error as AxiosError;
      
      // Log detalhado do erro em desenvolvimento
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 LinkedIn OAuth Error Details:');
        console.log('  - Status:', axiosError.response?.status);
        console.log('  - Status Text:', axiosError.response?.statusText);
        console.log('  - Response Data:', JSON.stringify(axiosError.response?.data, null, 2));
        console.log('  - Request URL:', axiosError.config?.url);
        console.log('  - Request Method:', axiosError.config?.method);
        console.log('  - Client ID usado:', this.clientId);
        console.log('  - Client Secret length:', this.clientSecret?.length || 0);
        console.log('  - Client Secret (primeiros 10 chars):', this.clientSecret?.substring(0, 10) + '...');
      }
      
      // Tratamento específico de erros do LinkedIn
      if (axiosError.response) {
        const errorData = axiosError.response.data as any;
        const errorMessage = errorData?.error_description || errorData?.error || 'Erro ao obter access token do LinkedIn';
        const errorCode = errorData?.error;
        
        // Detectar problemas de redirect URI ou código inválido
        const isRedirectUriError = 
          errorMessage.includes('redirect uri') || 
          errorMessage.includes('redirect_uri') ||
          errorMessage.includes('code verifier') ||
          errorMessage.includes('appid') ||
          errorMessage.includes('authorization code') ||
          errorCode === 'invalid_grant';
        
        if (isRedirectUriError) {
          const detailedMessage = 
            `Código de autorização inválido ou redirect URI não corresponde.\n` +
            `URI usado na troca: ${redirectUri}\n` +
            `URI configurado: ${this.redirectUri}\n` +
            `Certifique-se de que:\n` +
            `1. O LINKEDIN_REDIRECT_URI no backend corresponde EXATAMENTE ao configurado no LinkedIn Developers\n` +
            `2. O redirect URI usado na autorização é o mesmo usado na troca do código\n` +
            `3. Não há espaços extras ou diferenças de case`;
          
          throw new CustomError(detailedMessage, 401);
        }
        
        if (errorCode === 'invalid_client') {
          // Remover código do cache se falhou
          usedCodes.delete(code);
          
          const detailedMessage = 
            `Credenciais do LinkedIn inválidas.\n` +
            `Erro retornado: ${errorMessage}\n` +
            `Status: ${axiosError.response.status}\n` +
            `Verifique:\n` +
            `1. LINKEDIN_CLIENT_ID está correto (atual: ${this.clientId})\n` +
            `2. LINKEDIN_CLIENT_SECRET está correto e não expirou\n` +
            `3. Use o Client Secret PRIMÁRIO (não o secundário) no LinkedIn Developers\n` +
            `4. As credenciais correspondem ao app configurado no LinkedIn Developers\n` +
            `5. O app está ativo no LinkedIn Developers\n` +
            `6. Se houver múltiplas chaves ativas, delete as antigas e use apenas a primária`;
          
          throw new CustomError(detailedMessage, 500);
        }
        
        // Remover código do cache se falhou por outros motivos
        if (errorCode === 'invalid_grant' || errorCode === 'invalid_request') {
          usedCodes.delete(code);
        }
        
        throw new CustomError(`${errorMessage} (${errorCode || 'unknown'})`, 401);
      }

      throw new CustomError('Erro ao obter access token do LinkedIn', 401);
    }
  }

  /**
   * Obter perfil do usuário usando access token
   * LinkedIn OpenID Connect API
   */
  async getUserProfile(code: string, redirectUri?: string): Promise<LinkedInProfile> {
    this.initialize();
    
    if (!this.clientId || !this.clientSecret) {
      throw new CustomError('LinkedIn OAuth não configurado. Configure LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET', 500);
    }
    
    try {
      // Obter access token (passar redirectUri se fornecido)
      const accessToken = await this.getAccessToken(code, redirectUri);

      if (!accessToken) {
        throw new CustomError('Access token não obtido', 401);
      }

      // Obter perfil do usuário usando OpenID Connect UserInfo endpoint
      const profileResponse = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const profile = profileResponse.data;

      // Validar dados obrigatórios
      if (!profile.sub) {
        throw new CustomError('Perfil do LinkedIn não contém ID do usuário', 401);
      }

      if (!profile.email) {
        throw new CustomError('Email não disponível no perfil do LinkedIn. Certifique-se de que o escopo "email" está configurado.', 401);
      }

      return {
        id: profile.sub,
        email: profile.email,
        firstName: profile.given_name || profile.name?.split(' ')[0] || '',
        lastName: profile.family_name || profile.name?.split(' ').slice(1).join(' ') || '',
        profilePicture: profile.picture ? { displayImage: profile.picture } : undefined,
      };
    } catch (error: any) {
      if (error instanceof CustomError) {
        throw error;
      }

      const axiosError = error as AxiosError;
      
      // Tratamento específico de erros da API do LinkedIn
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorData = axiosError.response.data as any;
        
        if (status === 401) {
          throw new CustomError('Token do LinkedIn inválido ou expirado', 401);
        }
        
        if (status === 403) {
          throw new CustomError('Permissões insuficientes. Verifique os escopos configurados no LinkedIn Developers.', 403);
        }
        
        if (status === 404) {
          throw new CustomError('Endpoint do LinkedIn não encontrado. Verifique a versão da API.', 404);
        }
        
        const errorMessage = errorData?.message || errorData?.error_description || 'Erro ao obter perfil do LinkedIn';
        throw new CustomError(errorMessage, status);
      }

      // Erro de rede
      if (axiosError.request) {
        throw new CustomError('Erro de conexão com a API do LinkedIn', 503);
      }

      throw new CustomError('Erro ao obter perfil do LinkedIn', 401);
    }
  }

  /**
   * Gerar URL de autorização do LinkedIn
   * @param state - State opcional para CSRF protection
   * @param redirectUriOverride - Redirect URI opcional para garantir correspondência exata
   */
  getAuthorizationUrl(state?: string, redirectUriOverride?: string): string {
    this.initialize();
    
    if (!this.clientId) {
      throw new CustomError('LinkedIn OAuth não configurado. Configure LINKEDIN_CLIENT_ID', 500);
    }
    
    // Usar redirectUri fornecido ou o configurado
    const redirectUri = redirectUriOverride || this.redirectUri;
    
    if (!redirectUri) {
      throw new CustomError('LinkedIn Redirect URI não configurado. Configure LINKEDIN_REDIRECT_URI', 500);
    }
    
    // Gerar state aleatório se não fornecido
    const randomState = state || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri, // Usar o redirectUri fornecido ou configurado
      scope: 'openid profile email', // Escopos OpenID Connect
      state: randomState,
    });

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

    // Log para debug (remover em produção)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 LinkedIn OAuth Debug - getAuthorizationUrl:');
      console.log('  - Redirect URI usado na autorização:', redirectUri);
      console.log('  - Redirect URI configurado:', this.redirectUri);
      console.log('  - Redirect URI override:', redirectUriOverride || 'não fornecido');
      console.log('  - URL gerada (primeiros 200 chars):', authUrl.substring(0, 200) + '...');
      // Extrair redirect_uri da URL para verificar encoding
      const urlParams = new URL(authUrl).searchParams;
      console.log('  - redirect_uri na URL:', urlParams.get('redirect_uri'));
    }

    return authUrl;
  }

  /**
   * Verificar se está configurado
   */
  isConfigured(): boolean {
    this.initialize();
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  /**
   * Obter redirect URI configurado
   */
  getRedirectUri(): string {
    this.initialize();
    return this.redirectUri;
  }
}

// Lazy initialization - criar instância apenas quando necessário
let linkedinOAuthServiceInstance: LinkedInOAuthService | null = null;

export function getLinkedInOAuthService(): LinkedInOAuthService {
  if (!linkedinOAuthServiceInstance) {
    linkedinOAuthServiceInstance = new LinkedInOAuthService();
  }
  return linkedinOAuthServiceInstance;
}

// Exportar instância para compatibilidade (será inicializada lazy)
export const linkedinOAuthService = new LinkedInOAuthService();
